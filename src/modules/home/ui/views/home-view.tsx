"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import { Bell, Flame, Heart, House, MapPinned, ShieldAlert, Truck, Zap } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { donorListings, recipients, volunteers } from "../../data/network-seed";
import { createAssignmentDecision } from "../../lib/matching";
import { buildAssignmentMatrixNodes, selectMatrixAssignment } from "../../lib/matrix-assignment";
import { computeRescueReadinessScore, foodSafetyScreen } from "../../lib/rescoring";
import type {
  CrisisState,
  MatrixResult,
  MultiStopPlan,
  RouteLeg,
  RoutingNotification,
  VolunteerTask,
} from "../../types/logistics";
import { useOfflineDeliverySync } from "../../hooks/use-offline-delivery-sync";
import SWRegister from "../components/sw-register";

const LogisticsMap = dynamic(() => import("../components/logistics-map"), {
  ssr: false,
});

const initialCrisis: CrisisState = {
  active: false,
  severity: "normal",
  reason: "Normal operating conditions",
  radiusMultiplier: 1,
};

const initialTasks: VolunteerTask[] = [
  { id: "t-1", listingId: "d-1", volunteerId: "v-1", status: "pending", updatedAt: Date.now() },
  { id: "t-2", listingId: "d-2", volunteerId: "v-3", status: "pending", updatedAt: Date.now() },
  { id: "t-3", listingId: "d-3", volunteerId: "v-2", status: "assigned", updatedAt: Date.now(), acceptedAt: Date.now() - 50000 },
];

type DashboardRole = "donor" | "volunteer" | "recipient" | "admin";

type VolunteerActionStage = "accept" | "arrived" | "pickup" | "delivered";

const stageOrder: VolunteerActionStage[] = ["accept", "arrived", "pickup", "delivered"];

async function fetchRoute(startLat: number, startLng: number, endLat: number, endLng: number) {
  const params = new URLSearchParams({
    startLat: String(startLat),
    startLng: String(startLng),
    endLat: String(endLat),
    endLng: String(endLng),
  });

  const response = await fetch(`/api/logistics/route?${params.toString()}`);
  if (!response.ok) return null;
  return (await response.json()) as RouteLeg;
}

async function fetchMatrix(nodes: Array<{ id: string; location: { lat: number; lng: number; label: string }; kind: string }>) {
  const response = await fetch("/api/logistics/matrix", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nodes }),
  });
  if (!response.ok) return null;
  return (await response.json()) as MatrixResult;
}

async function optimizeMultiStop(startId: string, pickupIds: string[], endId: string, matrix: MatrixResult) {
  const response = await fetch("/api/logistics/optimize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ startId, pickupIds, endId, matrix }),
  });
  if (!response.ok) return null;
  return (await response.json()) as MultiStopPlan;
}

function routeLinkForPoints(points: Array<{ lat: number; lng: number }>) {
  if (points.length < 2) return "#";
  const encoded = points.map((point) => `${point.lat},${point.lng}`).join("/");
  return `https://www.google.com/maps/dir/${encoded}`;
}

function scoreColor(score: number) {
  if (score <= 40) return "#94a3b8";
  if (score <= 70) return "#2563eb";
  return "#ca8a04";
}

function playTone(type: "ding" | "siren") {
  if (typeof window === "undefined") return;
  const AudioCtx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return;
  const audioCtx = new AudioCtx();
  const oscillator = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  oscillator.connect(gain);
  gain.connect(audioCtx.destination);
  gain.gain.value = 0.03;

  if (type === "ding") {
    oscillator.frequency.setValueAtTime(880, audioCtx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(1320, audioCtx.currentTime + 0.12);
    oscillator.start();
    oscillator.stop(audioCtx.currentTime + 0.14);
  } else {
    oscillator.frequency.setValueAtTime(540, audioCtx.currentTime);
    oscillator.frequency.linearRampToValueAtTime(880, audioCtx.currentTime + 0.25);
    oscillator.frequency.linearRampToValueAtTime(540, audioCtx.currentTime + 0.5);
    oscillator.start();
    oscillator.stop(audioCtx.currentTime + 0.5);
  }
}

function RescueReadinessGauge({ score }: { score: number }) {
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const progress = (score / 100) * circumference;
  const color = scoreColor(score);

  return (
    <div className="flex items-center gap-3">
      <svg width="100" height="100" viewBox="0 0 100 100" className="drop-shadow-sm">
        <circle cx="50" cy="50" r={radius} stroke="#e2e8f0" strokeWidth="10" fill="none" />
        <circle
          cx="50"
          cy="50"
          r={radius}
          stroke={color}
          strokeWidth="10"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${progress} ${circumference}`}
          transform="rotate(-90 50 50)"
        />
        <text x="50" y="55" textAnchor="middle" className="fill-slate-900 text-xl font-bold">
          {score}
        </text>
      </svg>
      <div className="text-xs text-slate-600">
        <p className="font-semibold text-slate-800">Rescue Readiness</p>
        <p>0-40 low</p>
        <p>41-70 medium</p>
        <p>71-100 high</p>
      </div>
    </div>
  );
}

function AlertStack({
  notifications,
  onDismiss,
}: {
  notifications: RoutingNotification[];
  onDismiss: (id: string) => void;
}) {
  if (!notifications.length) return null;

  return (
    <div className="pointer-events-none fixed right-3 top-12 z-50 flex w-[320px] flex-col gap-2">
      {notifications.map((notice) => (
        <div
          key={notice.id}
          className={`pointer-events-auto rounded-xl border px-3 py-2 shadow-lg backdrop-blur ${
            notice.level === "critical"
              ? "border-red-400 bg-red-50/95"
              : notice.level === "warning"
                ? "border-amber-400 bg-amber-50/95"
                : "border-slate-300 bg-white/95"
          }`}
        >
          <p className="text-sm font-semibold text-slate-900">{notice.message}</p>
          <button
            onClick={() => onDismiss(notice.id)}
            className="mt-1 text-xs font-medium text-slate-600 underline"
          >
            Dismiss
          </button>
        </div>
      ))}
    </div>
  );
}

export default function HomeView() {
  const router = useRouter();
  const { data } = authClient.useSession();

  const [activeRole, setActiveRole] = useState<DashboardRole>("volunteer");
  const [activeListingId, setActiveListingId] = useState(donorListings[0].id);
  const [crisisState, setCrisisState] = useState<CrisisState>(initialCrisis);
  const [manualCrisis, setManualCrisis] = useState(false);
  const [pickupRoute, setPickupRoute] = useState<RouteLeg | null>(null);
  const [deliveryRoute, setDeliveryRoute] = useState<RouteLeg | null>(null);
  const [matrix, setMatrix] = useState<MatrixResult | null>(null);
  const [matrixSource, setMatrixSource] = useState<string>("-");
  const [multiStopPlan, setMultiStopPlan] = useState<MultiStopPlan | null>(null);
  const [multiStopRoutes, setMultiStopRoutes] = useState<RouteLeg[]>([]);
  const [notifications, setNotifications] = useState<RoutingNotification[]>([]);
  const [step, setStep] = useState(0);
  const [foodChoice, setFoodChoice] = useState<"Cooked" | "Dry" | "Produce">("Cooked");
  const [quantityMeals, setQuantityMeals] = useState(10);
  const [expiryMins, setExpiryMins] = useState(120);
  const [handoffNote, setHandoffNote] = useState("");
  const [volunteerStage, setVolunteerStage] = useState<VolunteerActionStage>("accept");
  const [slideAcceptValue, setSlideAcceptValue] = useState(0);
  const [isAcceptingRecipient, setIsAcceptingRecipient] = useState(true);
  const [recipientRequest, setRecipientRequest] = useState("");

  const listing = useMemo(
    () => donorListings.find((item) => item.id === activeListingId) ?? donorListings[0],
    [activeListingId],
  );

  const appliedCrisis = useMemo(() => {
    if (!manualCrisis) return crisisState;
    return {
      active: true,
      severity: "critical" as const,
      reason: "Manual crisis override",
      radiusMultiplier: 2,
    };
  }, [crisisState, manualCrisis]);

  const fallbackAssignment = useMemo(
    () => createAssignmentDecision(listing, recipients, volunteers, appliedCrisis),
    [listing, appliedCrisis],
  );

  const matrixAssignment = useMemo(() => {
    if (!matrix || !isAcceptingRecipient) return null;
    return selectMatrixAssignment(listing, recipients, volunteers, appliedCrisis, matrix);
  }, [listing, appliedCrisis, matrix, isAcceptingRecipient]);

  const assignment = useMemo(
    () =>
      matrixAssignment ??
      (fallbackAssignment
        ? {
            recipient: fallbackAssignment.recipient,
            volunteer: fallbackAssignment.volunteer,
            totalMinutes: (pickupRoute?.durationMinutes ?? 0) + (deliveryRoute?.durationMinutes ?? 0),
            score: fallbackAssignment.assignmentScore,
          }
        : null),
    [matrixAssignment, fallbackAssignment, pickupRoute?.durationMinutes, deliveryRoute?.durationMinutes],
  );

  const safety = useMemo(() => foodSafetyScreen(listing), [listing]);
  const readiness = useMemo(() => computeRescueReadinessScore(listing, appliedCrisis), [listing, appliedCrisis]);
  const liveRescues = tasksInPlay(initialTasks, activeRole);

  const { tasks, isOnline, pendingSyncCount, progress, updateTaskStatus } = useOfflineDeliverySync(initialTasks);

  useEffect(() => {
    const nodes = buildAssignmentMatrixNodes(listing, recipients, volunteers);
    const resolveMatrix = async () => {
      const result = await fetchMatrix(nodes);
      if (!result) return;
      setMatrix(result);
      setMatrixSource(result.source);
    };
    void resolveMatrix();
  }, [listing]);

  useEffect(() => {
    const getCrisis = async () => {
      const params = new URLSearchParams({
        lat: String(listing.location.lat),
        lng: String(listing.location.lng),
        demandSpike: String(readiness > 75 ? 0.7 : 0.3),
      });
      const response = await fetch(`/api/logistics/crisis?${params.toString()}`);
      if (!response.ok) return;
      const state = (await response.json()) as CrisisState;
      setCrisisState(state);
    };

    void getCrisis();
    const interval = window.setInterval(getCrisis, 60000);
    return () => window.clearInterval(interval);
  }, [listing.location.lat, listing.location.lng, readiness]);

  useEffect(() => {
    const resolveRoutes = async () => {
      if (!assignment) {
        setPickupRoute(null);
        setDeliveryRoute(null);
        return;
      }

      const volunteer = assignment.volunteer;
      const recipient = assignment.recipient;

      const [pickup, delivery] = await Promise.all([
        fetchRoute(volunteer.location.lat, volunteer.location.lng, listing.location.lat, listing.location.lng),
        fetchRoute(listing.location.lat, listing.location.lng, recipient.location.lat, recipient.location.lng),
      ]);

      setPickupRoute(pickup);
      setDeliveryRoute(delivery);
    };

    void resolveRoutes();
  }, [assignment, listing.location.lat, listing.location.lng]);

  useEffect(() => {
    const planMultiStop = async () => {
      if (!assignment || !matrix) {
        setMultiStopPlan(null);
        setMultiStopRoutes([]);
        return;
      }

      const urgentPickups = [...donorListings]
        .sort((a, b) => a.expiresInMinutes - b.expiresInMinutes)
        .slice(0, 2)
        .map((item) => item.id);

      const neededNodeIds = [assignment.volunteer.id, ...urgentPickups, assignment.recipient.id];
      const matrixNodes = buildAssignmentMatrixNodes(listing, recipients, volunteers).filter((node) =>
        neededNodeIds.includes(node.id),
      );

      const reducedMatrix = await fetchMatrix(matrixNodes);
      if (!reducedMatrix) return;

      const plan = await optimizeMultiStop(
        assignment.volunteer.id,
        urgentPickups,
        assignment.recipient.id,
        reducedMatrix,
      );

      if (!plan) return;
      setMultiStopPlan(plan);

      const sequenceRoutes: RouteLeg[] = [];
      for (let i = 0; i < plan.sequence.length - 1; i += 1) {
        const fromId = plan.sequence[i];
        const toId = plan.sequence[i + 1];
        const fromNode = matrixNodes.find((node) => node.id === fromId);
        const toNode = matrixNodes.find((node) => node.id === toId);
        if (!fromNode || !toNode) continue;

        const leg = await fetchRoute(
          fromNode.location.lat,
          fromNode.location.lng,
          toNode.location.lat,
          toNode.location.lng,
        );
        if (leg) sequenceRoutes.push(leg);
      }
      setMultiStopRoutes(sequenceRoutes);
    };

    void planMultiStop();
  }, [assignment, matrix, listing]);

  useEffect(() => {
    const escalatedTasks = tasks.filter((task) => task.escalated);
    if (!escalatedTasks.length) return;

    const latest = escalatedTasks[escalatedTasks.length - 1];
    setNotifications((current) => [
      {
        id: `n-${latest.id}-${latest.updatedAt}`,
        level: "critical",
        message: `Escalation: ${latest.id} needs reassignment`,
        createdAt: Date.now(),
      },
      ...current,
    ]);
    playTone("siren");
  }, [tasks]);

  useEffect(() => {
    const channel = new BroadcastChannel("feedo-events");
    channel.onmessage = (event) => {
      if (event.data?.type === "donation:new") {
        setNotifications((current) => [
          {
            id: `n-${Date.now()}`,
            level: "info",
            message: `New rescue posted: ${event.data.label ?? "incoming donation"}`,
            createdAt: Date.now(),
          },
          ...current,
        ]);
        playTone("ding");
      }
    };
    return () => channel.close();
  }, []);

  const navPoints = useMemo(() => {
    if (!assignment) return [] as Array<{ lat: number; lng: number }>;
    return [
      { lat: assignment.volunteer.location.lat, lng: assignment.volunteer.location.lng },
      { lat: listing.location.lat, lng: listing.location.lng },
      { lat: assignment.recipient.location.lat, lng: assignment.recipient.location.lng },
    ];
  }, [assignment, listing.location.lat, listing.location.lng]);

  const etaMinutes = assignment?.totalMinutes || (pickupRoute?.durationMinutes ?? 0) + (deliveryRoute?.durationMinutes ?? 0);
  const kiloSavedToday = donorListings.reduce((sum, item) => sum + item.quantityKg, 0);

  const currentStageIndex = stageOrder.indexOf(volunteerStage);
  const nextStage = () => {
    const next = stageOrder[currentStageIndex + 1];
    if (!next) return;
    setVolunteerStage(next);
  };

  const dismissNotification = (id: string) => setNotifications((current) => current.filter((notice) => notice.id !== id));

  const activeRoleTitle: Record<DashboardRole, string> = {
    donor: "The Rapid Dispatcher",
    volunteer: "The Field HUD",
    recipient: "Capacity and Intake",
    admin: "The Watchtower",
  };

  const uploadProofImage = async (taskId: string, file: File | null) => {
    if (!file || !taskId) return;
    const localUrl = URL.createObjectURL(file);
    await updateTaskStatus(taskId, "delivered", { proofImageUrl: localUrl });
  };

  const urgencySortedListings = [...donorListings].sort((a, b) => a.expiresInMinutes - b.expiresInMinutes);

  const handleSlideAccept = async (value: number) => {
    setSlideAcceptValue(value);
    if (value >= 98) {
      const task = tasks[0];
      if (task) {
        await updateTaskStatus(task.id, "assigned");
      }
      setVolunteerStage("arrived");
      setSlideAcceptValue(0);
    }
  };

  const handleMainAction = async () => {
    const task = tasks[0];
    if (!task) return;

    if (volunteerStage === "arrived") {
      await updateTaskStatus(task.id, "assigned");
      nextStage();
      return;
    }

    if (volunteerStage === "pickup") {
      await updateTaskStatus(task.id, "picked");
      nextStage();
      return;
    }

    if (volunteerStage === "delivered") {
      await updateTaskStatus(task.id, "delivered");
      setNotifications((current) => [
        {
          id: `n-delivery-${Date.now()}`,
          level: "info",
          message: "Delivery completed and proof synced.",
          createdAt: Date.now(),
        },
        ...current,
      ]);
      return;
    }
  };

  const crisisClass = appliedCrisis.severity === "critical" ? "feedo-crisis" : "";

  return (
    <div className={`min-h-screen bg-[radial-gradient(circle_at_0%_0%,#fef3c7_0%,#f8fafc_35%,#dbeafe_100%)] ${crisisClass}`}>
      <SWRegister />
      <AlertStack notifications={notifications} onDismiss={dismissNotification} />

      <div className="sticky top-0 z-40 border-b border-slate-300 bg-black text-white">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between px-4 py-2 text-xs md:text-sm">
          <div className="font-semibold tracking-wide">
            <span className="text-emerald-400">SYSTEM LIVE</span>: {liveRescues} Active Rescues
          </div>
          <div className="flex items-center gap-2">
            <select
              value={activeRole}
              onChange={(event) => setActiveRole(event.target.value as DashboardRole)}
              className="rounded border border-slate-500 bg-slate-900 px-2 py-1 text-xs"
            >
              <option value="donor">Donor</option>
              <option value="volunteer">Volunteer</option>
              <option value="recipient">Recipient</option>
              <option value="admin">Admin</option>
            </select>
            <button
              onClick={() => setManualCrisis((current) => !current)}
              className={`rounded p-1 ${appliedCrisis.severity === "critical" ? "bg-orange-500" : "bg-slate-700"}`}
              aria-label="Crisis alert"
            >
              <Bell className="size-4" />
            </button>
            <Button size="sm" onClick={() => authClient.signOut({ fetchOptions: { onSuccess: () => router.push("/auth/sign-in") } })}>
              Logout
            </Button>
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-[1600px] grid-cols-1 gap-4 p-4 lg:grid-cols-[260px_1fr]">
        <aside className="rounded-2xl border border-white/40 bg-white/45 p-3 backdrop-blur-xl">
          <div className="mb-3 border-b border-slate-300 pb-3">
            <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Command Sidebar</p>
            <p className="mt-1 text-lg font-black text-slate-900">{activeRoleTitle[activeRole]}</p>
            <p className="text-xs text-slate-600">{data?.user?.name ?? "Operator"}</p>
          </div>

          <nav className="space-y-2">
            {[
              { key: "donor", icon: House, label: "Donor Module" },
              { key: "volunteer", icon: Truck, label: "Volunteer Module" },
              { key: "recipient", icon: Heart, label: "Recipient Module" },
              { key: "admin", icon: ShieldAlert, label: "Admin Module" },
            ].map((item) => {
              const Icon = item.icon;
              const active = activeRole === item.key;
              return (
                <button
                  key={item.key}
                  onClick={() => setActiveRole(item.key as DashboardRole)}
                  className={`relative flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm ${
                    active ? "border-cyan-300 bg-cyan-50" : "border-slate-200 bg-white/70"
                  }`}
                >
                  {active ? <span className="absolute left-0 top-1 h-7 w-1 rounded-r bg-cyan-500 shadow-[0_0_10px_#06b6d4]" /> : null}
                  <Icon className="size-4 text-slate-700" />
                  {item.label}
                </button>
              );
            })}
          </nav>

          <div className="mt-4 rounded-xl border border-slate-300 bg-slate-950 p-3 text-white">
            <p className="text-xs uppercase tracking-wide text-slate-400">Today Impact</p>
            <p className="mt-2 text-xl font-bold">{kiloSavedToday} kg</p>
            <p className="text-xs text-slate-400">Saved from {donorListings.length} live donations</p>
          </div>
        </aside>

        <main className="space-y-4">
          <section className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm backdrop-blur">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Shared Intelligence</p>
                <h1 className="text-2xl font-black text-slate-900">Actionable Rescue Modules</h1>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-full bg-slate-100 px-3 py-1">Matrix: {matrixSource}</span>
                <span className={`rounded-full px-3 py-1 ${isOnline ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                  {isOnline ? "Realtime Sync" : "Offline Queue"}
                </span>
                <span className="rounded-full bg-blue-100 px-3 py-1 text-blue-700">ETA {etaMinutes || "-"}m</span>
                <span className="rounded-full bg-indigo-100 px-3 py-1 text-indigo-700">Delivered {progress.delivered}/{progress.total}</span>
                <span className="rounded-full bg-orange-100 px-3 py-1 text-orange-700">Queued {pendingSyncCount}</span>
              </div>
            </div>
          </section>

          {activeRole === "donor" ? (
            <section className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-sm font-semibold text-slate-500">Donor Listing Creation</p>
                <h2 className="text-xl font-bold text-slate-900">3-Step Rapid Wizard</h2>

                <div className="mt-3 flex gap-2 text-xs">
                  {["What & How Much", "Freshness Window", "Hand-off"].map((label, index) => (
                    <button
                      key={label}
                      onClick={() => setStep(index)}
                      className={`rounded-full px-3 py-1 ${step === index ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"}`}
                    >
                      {index + 1}. {label}
                    </button>
                  ))}
                </div>

                {step === 0 ? (
                  <div className="mt-4 space-y-3">
                    <p className="text-sm font-semibold text-slate-700">Food Type and Quantity</p>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { label: "Cooked", icon: Flame },
                        { label: "Dry", icon: Zap },
                        { label: "Produce", icon: Heart },
                      ].map((item) => {
                        const Icon = item.icon;
                        return (
                          <button
                            key={item.label}
                            onClick={() => setFoodChoice(item.label as "Cooked" | "Dry" | "Produce")}
                            className={`rounded-lg border p-3 text-center ${foodChoice === item.label ? "border-cyan-400 bg-cyan-50" : "border-slate-200"}`}
                          >
                            <Icon className="mx-auto size-5 text-slate-700" />
                            <p className="mt-1 text-xs font-semibold text-slate-800">{item.label}</p>
                          </button>
                        );
                      })}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {[10, 25, 50].map((count) => (
                        <button
                          key={count}
                          onClick={() => setQuantityMeals(count)}
                          className={`rounded-md border px-3 py-2 text-xs ${quantityMeals === count ? "border-blue-500 bg-blue-50" : "border-slate-200"}`}
                        >
                          Quick-Add {count} Meals
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                {step === 1 ? (
                  <div className="mt-4 space-y-3">
                    <p className="text-sm font-semibold text-slate-700">Freshness Life Bar</p>
                    <input
                      type="range"
                      min={20}
                      max={360}
                      value={expiryMins}
                      onChange={(event) => setExpiryMins(Number(event.target.value))}
                      className="w-full"
                    />
                    <div className="h-4 overflow-hidden rounded-full bg-slate-200">
                      <div
                        className={`h-full transition-all ${expiryMins > 180 ? "bg-emerald-500" : expiryMins > 60 ? "bg-amber-500" : "bg-red-500"}`}
                        style={{ width: `${Math.min(100, (expiryMins / 360) * 100)}%` }}
                      />
                    </div>
                    <p className="text-sm text-slate-700">Expiry in {expiryMins} minutes</p>
                  </div>
                ) : null}

                {step === 2 ? (
                  <div className="mt-4 space-y-3">
                    <p className="text-sm font-semibold text-slate-700">Hand-off Details</p>
                    <Button
                      variant="outline"
                      onClick={() => {
                        if (!navigator.geolocation) return;
                        navigator.geolocation.getCurrentPosition((position) => {
                          setNotifications((current) => [
                            {
                              id: `n-gps-${Date.now()}`,
                              level: "info",
                              message: `GPS locked ${position.coords.latitude.toFixed(4)}, ${position.coords.longitude.toFixed(4)}`,
                              createdAt: Date.now(),
                            },
                            ...current,
                          ]);
                        });
                      }}
                    >
                      <MapPinned className="mr-2 size-4" /> Current Location
                    </Button>
                    <textarea
                      value={handoffNote}
                      onChange={(event) => setHandoffNote(event.target.value)}
                      placeholder="Park in rear, buzz 202"
                      className="min-h-24 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                ) : null}
              </div>

              <div className="space-y-4">
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Live Tracking Card</p>
                  <p className="mt-2 text-lg font-bold text-slate-900">{listing.location.label}</p>
                  <p className="text-sm text-slate-600">{foodChoice} � {quantityMeals} meals � expires in {expiryMins}m</p>
                  <div className="mt-3 rounded-lg bg-slate-100 p-3">
                    <p className="text-sm font-semibold text-slate-800">
                      {assignment ? "Volunteer Assigned" : "Searching for Volunteer"}
                      {!assignment ? <span className="ml-1 inline-flex gap-1"><span className="dot-pulse" /><span className="dot-pulse [animation-delay:150ms]" /><span className="dot-pulse [animation-delay:300ms]" /></span> : null}
                    </p>
                    {assignment ? (
                      <p className="mt-1 text-sm text-slate-700">{assignment.volunteer.name} ready for pickup <button className="ml-2 rounded bg-slate-900 px-2 py-1 text-xs text-white">Call</button></p>
                    ) : null}
                  </div>
                </div>

                <div className="rounded-2xl border border-yellow-300 bg-yellow-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-yellow-700">Reliability Badge</p>
                  <p className="mt-2 text-lg font-black text-yellow-900">
                    {listing.donorReliability > 0.9 ? "Elite Donor" : "Gold Star Donor"}
                  </p>
                  <p className="text-sm text-yellow-800">Trust score {(listing.donorReliability * 100).toFixed(0)}%</p>
                </div>
              </div>
            </section>
          ) : null}

          {activeRole === "volunteer" ? (
            <section className="space-y-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-sm font-semibold text-slate-500">Task Marketplace</p>
                <div className="mt-3 grid gap-3 md:grid-cols-3">
                  {urgencySortedListings.map((item) => {
                    const impactPoints = Math.round(item.quantityKg * 4 + (300 - item.expiresInMinutes) / 10);
                    const co2Saved = (item.quantityKg * 2.7).toFixed(1);
                    return (
                      <button
                        key={item.id}
                        onClick={() => setActiveListingId(item.id)}
                        className={`rounded-xl border p-3 text-left transition ${
                          item.expiresInMinutes < 30
                            ? "border-red-400 bg-red-50 shadow-[0_0_14px_rgba(239,68,68,0.45)]"
                            : "border-slate-200 bg-slate-50"
                        }`}
                      >
                        <p className="text-sm font-bold text-slate-900">{item.location.label}</p>
                        <p className="mt-1 text-xs text-slate-600">Expires {item.expiresInMinutes}m � {item.quantityKg}kg</p>
                        <p className="mt-2 text-xs text-slate-700">Impact Points: {impactPoints}</p>
                        <p className="text-xs text-slate-700">Estimated CO2 Saved: {co2Saved}kg</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-sm font-semibold text-slate-500">Active Route Logistics View</p>
                <div className="mt-2 grid h-[720px] gap-4 lg:grid-rows-[60%_40%]">
                  <div className="min-h-0 rounded-xl border border-slate-200 p-2">
                    <LogisticsMap
                      listing={listing}
                      recipients={isAcceptingRecipient ? recipients : []}
                      volunteers={volunteers}
                      selectedRecipientId={assignment?.recipient.id}
                      selectedVolunteerId={assignment?.volunteer.id}
                      pickupRoute={pickupRoute}
                      deliveryRoute={deliveryRoute}
                      multiStopRoutes={multiStopRoutes}
                    />
                  </div>

                  <div className="relative flex min-h-0 flex-col rounded-xl border border-slate-200 bg-slate-50 p-4 pb-24">
                    <p className="text-xs uppercase tracking-wide text-slate-500">Step Drawer</p>
                    <p className="text-sm font-semibold text-slate-900">{stageLabel(volunteerStage)}</p>
                    <p className="mt-1 text-xs text-slate-600">ETA {etaMinutes || "-"} min � Route source {matrixSource}</p>
                    <p className="text-xs text-slate-600">Sequence {multiStopPlan?.sequence?.join(" -> ") ?? "volunteer -> donor -> recipient"}</p>
                    <a
                      href={routeLinkForPoints(navPoints)}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-block text-xs font-semibold text-blue-700 underline"
                    >
                      Open navigation view
                    </a>

                    {volunteerStage === "accept" ? (
                      <div className="mt-3 rounded-md border border-slate-300 bg-white p-2">
                        <p className="text-xs text-slate-600">Slide to Accept Task</p>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          value={slideAcceptValue}
                          onChange={(event) => void handleSlideAccept(Number(event.target.value))}
                          className="w-full"
                        />
                      </div>
                    ) : null}

                    {tasks[0]?.proofImageUrl ? (
                      <Image
                        src={tasks[0].proofImageUrl}
                        alt="Proof of pickup or delivery"
                        width={400}
                        height={100}
                        className="mt-2 h-20 w-full rounded-md object-cover"
                      />
                    ) : null}

                    <div className="fixed bottom-4 left-0 right-0 mx-auto w-[min(92vw,640px)] px-3 lg:static lg:mx-0 lg:w-full lg:px-0">
                      <Button className="h-12 w-full text-base font-bold" onClick={() => void handleMainAction()}>
                        {volunteerStage === "accept"
                          ? "Slide to Accept"
                          : volunteerStage === "arrived"
                            ? "Arrived at Donor"
                            : volunteerStage === "pickup"
                              ? "Confirm Pickup"
                              : "Delivered"}
                      </Button>
                      <label className="mt-2 block text-xs text-slate-600">
                        Proof image
                        <input
                          type="file"
                          accept="image/*"
                          className="mt-1 block w-full text-xs"
                          onChange={(event) => {
                            const file = event.target.files?.[0] ?? null;
                            void uploadProofImage(tasks[0]?.id ?? "", file);
                          }}
                        />
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          ) : null}

          {activeRole === "recipient" ? (
            <section className="grid gap-4 xl:grid-cols-[1.1fr_1fr]">
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-sm font-semibold text-slate-500">Intake Waitlist Timeline</p>
                <div className="mt-3 space-y-3">
                  {urgencySortedListings.map((item, index) => {
                    const eta = 6 + index * 4;
                    const progressPct = Math.max(12, 100 - eta * 7);
                    const nutritionTag = item.category === "protein-rich" ? "High Protein" : item.category === "balanced-meals" ? "Balanced Meal" : "High Carb";
                    return (
                      <article key={item.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-semibold text-slate-900">{item.location.label}</p>
                          <p className="text-xs text-slate-600">ETA: {eta} mins</p>
                        </div>
                        <div className="mt-2 h-2 rounded-full bg-slate-200">
                          <div className="h-full rounded-full bg-blue-500" style={{ width: `${progressPct}%` }} />
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2 text-xs">
                          <span className="rounded-full bg-green-100 px-2 py-1 text-green-700">{nutritionTag}</span>
                          <span className="rounded-full bg-emerald-100 px-2 py-1 text-emerald-700">Vegan</span>
                          <span className="rounded-full bg-red-100 px-2 py-1 text-red-700">Allergen Alert</span>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="text-sm font-semibold text-slate-500">Capacity Toggle</p>
                  <button
                    onClick={() => setIsAcceptingRecipient((current) => !current)}
                    className={`mt-3 flex w-full items-center justify-between rounded-lg border px-3 py-3 text-left ${
                      isAcceptingRecipient ? "border-emerald-400 bg-emerald-50" : "border-rose-400 bg-rose-50"
                    }`}
                  >
                    <span className="font-semibold text-slate-900">Accepting New Donations</span>
                    <span className={`rounded-full px-3 py-1 text-xs ${isAcceptingRecipient ? "bg-emerald-500 text-white" : "bg-rose-500 text-white"}`}>
                      {isAcceptingRecipient ? "ON" : "OFF"}
                    </span>
                  </button>
                  <p className="mt-2 text-xs text-slate-600">
                    {isAcceptingRecipient ? "Matching engine can route donations here." : "Matching engine bypasses this recipient now."}
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="text-sm font-semibold text-slate-500">Request Specifics</p>
                  <textarea
                    value={recipientRequest}
                    onChange={(event) => setRecipientRequest(event.target.value)}
                    placeholder="We are low on protein today"
                    className="mt-2 min-h-24 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  />
                  <Button
                    className="mt-2"
                    onClick={() => {
                      if (!recipientRequest.trim()) return;
                      setNotifications((current) => [
                        {
                          id: `n-need-${Date.now()}`,
                          level: "warning",
                          message: `Recipient need broadcast: ${recipientRequest.trim()}`,
                          createdAt: Date.now(),
                        },
                        ...current,
                      ]);
                    }}
                  >
                    Flag Nearby Donors
                  </Button>
                </div>
              </div>
            </section>
          ) : null}

          {activeRole === "admin" ? (
            <section className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
              <div className="rounded-2xl border border-slate-800 bg-[#081019] p-4 text-slate-100">
                <p className="text-sm font-semibold text-slate-300">Global Heatmap</p>
                <div className="mt-3 h-[420px] rounded-xl border border-slate-700 bg-[radial-gradient(circle_at_20%_20%,rgba(59,130,246,0.25),transparent_35%),radial-gradient(circle_at_70%_40%,rgba(239,68,68,0.25),transparent_42%),#030712] p-4">
                  <p className="text-xs text-slate-300">Hexbin style zones</p>
                  <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                    <div className="rounded-lg border border-red-500/50 bg-red-950/40 p-2">
                      <p className="font-semibold text-red-200">Red Area</p>
                      <p>High waste or uncollected food</p>
                    </div>
                    <div className="rounded-lg border border-blue-500/50 bg-blue-950/40 p-2">
                      <p className="font-semibold text-blue-200">Blue Area</p>
                      <p>High volunteer density</p>
                    </div>
                  </div>

                  <div className="mt-4 space-y-2">
                    {donorListings
                      .filter((item) => item.id !== listing.id)
                      .map((item) => (
                        <div key={item.id} className="animate-pulse rounded-md border border-orange-500/50 bg-orange-500/15 p-2 text-xs">
                          Ghost Donation: {item.location.label} ({item.expiresInMinutes}m)
                        </div>
                      ))}
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-2xl border border-red-400 bg-red-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-red-700">Crisis Mode Control</p>
                  <button
                    onClick={() => setManualCrisis((current) => !current)}
                    className="mt-3 w-full rounded-xl bg-red-700 px-4 py-4 text-base font-black text-white shadow-[0_10px_30px_rgba(127,29,29,0.45)]"
                  >
                    BIG RED BUTTON
                  </button>
                  <div className="mt-3 space-y-1 text-sm text-red-900">
                    <label className="flex items-center gap-2"><input type="checkbox" checked readOnly /> Expand pickup radius to 15km</label>
                    <label className="flex items-center gap-2"><input type="checkbox" checked readOnly /> Auto-assign volunteer under 5 mins</label>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="text-sm font-semibold text-slate-500">Rescue Readiness Score</p>
                  <RescueReadinessGauge score={readiness} />
                  <p className="mt-2 text-xs text-slate-600">Score = f(time remaining, donor trust, food stability)</p>
                </div>
              </div>
            </section>
          ) : null}

          <section className="grid gap-4 md:grid-cols-[1fr_auto]">
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-sm font-semibold text-slate-500">Core Dispatch Snapshot</p>
              <div className="mt-2 grid gap-3 md:grid-cols-3">
                <div className="rounded-lg bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">Safety</p>
                  <p className="text-lg font-bold text-slate-900">{safety}</p>
                </div>
                <div className="rounded-lg bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">Volunteer</p>
                  <p className="text-lg font-bold text-slate-900">{assignment?.volunteer.name ?? "Pending"}</p>
                </div>
                <div className="rounded-lg bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">Recipient</p>
                  <p className="text-lg font-bold text-slate-900">{isAcceptingRecipient ? assignment?.recipient.name ?? "Pending" : "Bypassed"}</p>
                </div>
              </div>
            </div>
            <div className="flex items-end">
              <Button variant="outline" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>Back to top</Button>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

function tasksInPlay(tasks: VolunteerTask[], role: DashboardRole) {
  if (role === "admin") return tasks.length + 3;
  if (role === "donor") return tasks.length + 1;
  return tasks.length;
}

function stageLabel(stage: VolunteerActionStage) {
  if (stage === "accept") return "State 1: Accept Task";
  if (stage === "arrived") return "State 2: Arrived at Donor";
  if (stage === "pickup") return "State 3: Confirm Pickup";
  return "State 4: Delivered";
}
