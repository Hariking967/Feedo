"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
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
  { id: "t-1", listingId: "d-1", volunteerId: "v-1", status: "assigned", updatedAt: Date.now() },
  { id: "t-2", listingId: "d-2", volunteerId: "v-3", status: "pending", updatedAt: Date.now() },
  { id: "t-3", listingId: "d-3", volunteerId: "v-2", status: "picked", updatedAt: Date.now() },
];

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

export default function HomeView() {
  const router = useRouter();
  const { data } = authClient.useSession();
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
    if (!matrix) return null;
    return selectMatrixAssignment(listing, recipients, volunteers, appliedCrisis, matrix);
  }, [listing, appliedCrisis, matrix]);

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
        demandSpike: String(readiness > 75 ? 0.65 : 0.25),
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
        message: `Escalation triggered for ${latest.id}. No quick response from assigned volunteer.`,
        createdAt: Date.now(),
      },
      ...current.slice(0, 6),
    ]);
  }, [tasks]);

  const navPoints = useMemo(() => {
    if (!assignment) return [] as Array<{ lat: number; lng: number }>;
    return [
      { lat: assignment.volunteer.location.lat, lng: assignment.volunteer.location.lng },
      { lat: listing.location.lat, lng: listing.location.lng },
      { lat: assignment.recipient.location.lat, lng: assignment.recipient.location.lng },
    ];
  }, [assignment, listing.location.lat, listing.location.lng]);

  const multiStopNavPoints = useMemo(() => {
    if (!assignment || !multiStopPlan?.sequence?.length) return [] as Array<{ lat: number; lng: number }>;

    const allNodes = [
      ...buildAssignmentMatrixNodes(listing, recipients, volunteers),
      ...donorListings.map((item) => ({ id: item.id, kind: "donor" as const, location: item.location })),
    ];

    return multiStopPlan.sequence
      .map((nodeId) => allNodes.find((node) => node.id === nodeId)?.location)
      .filter((point): point is { lat: number; lng: number; label: string } => Boolean(point))
      .map((point) => ({ lat: point.lat, lng: point.lng }));
  }, [assignment, multiStopPlan, listing]);

  const uploadProofImage = async (taskId: string, file: File | null) => {
    if (!file) return;
    const localUrl = URL.createObjectURL(file);
    await updateTaskStatus(taskId, "delivered", { proofImageUrl: localUrl });
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <SWRegister />

      <div className="mx-auto flex max-w-7xl flex-col gap-4">
        <div className="flex flex-col justify-between gap-3 rounded-xl border bg-white p-4 md:flex-row md:items-center">
          <div>
            <p className="text-sm text-slate-500">Real-time Rescue Operations</p>
            <h1 className="text-2xl font-semibold text-slate-900">Welcome, {data?.user.name}</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                isOnline ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
              }`}
            >
              {isOnline ? "Online" : "Offline mode"}
            </span>
            <Button
              variant={manualCrisis ? "default" : "outline"}
              onClick={() => setManualCrisis((current) => !current)}
            >
              {manualCrisis ? "Disable Crisis Override" : "Enable Crisis Override"}
            </Button>
            <Button
              onClick={() => {
                authClient.signOut({
                  fetchOptions: { onSuccess: () => router.push("/auth/sign-in") },
                });
              }}
            >
              Logout
            </Button>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[360px,1fr]">
          <aside className="space-y-4">
            <section className="rounded-xl border bg-white p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Crisis Signal</p>
              <p className="mt-2 text-lg font-semibold text-slate-900">{appliedCrisis.severity.toUpperCase()}</p>
              <p className="text-sm text-slate-600">{appliedCrisis.reason}</p>
              <p className="mt-2 text-sm text-slate-700">Radius Multiplier: {appliedCrisis.radiusMultiplier}x</p>
              <p className="mt-1 text-xs text-slate-500">Matrix source: {matrixSource}</p>
            </section>

            <section className="rounded-xl border bg-white p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Donation Feed</p>
              <div className="mt-2 space-y-2">
                {donorListings.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setActiveListingId(item.id)}
                    className={`w-full rounded-lg border px-3 py-2 text-left ${
                      item.id === listing.id ? "border-blue-500 bg-blue-50" : "border-slate-200"
                    }`}
                  >
                    <p className="text-sm font-semibold text-slate-900">{item.location.label}</p>
                    <p className="text-xs text-slate-600">
                      {item.foodType} • {item.quantityKg}kg • expires in {item.expiresInMinutes}m
                    </p>
                  </button>
                ))}
              </div>
            </section>

            <section className="rounded-xl border bg-white p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Rescue Intelligence</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">{readiness}/100</p>
              <p className="text-sm text-slate-600">Safety: {safety}</p>
              {assignment ? (
                <div className="mt-3 text-sm text-slate-700">
                  <p>Recipient: {assignment.recipient.name}</p>
                  <p>Volunteer: {assignment.volunteer.name}</p>
                  <p>Assignment score: {assignment.score}</p>
                  <p>
                    ETA: {assignment.totalMinutes || (pickupRoute?.durationMinutes ?? 0) + (deliveryRoute?.durationMinutes ?? 0)} min
                  </p>
                </div>
              ) : (
                <p className="mt-3 text-sm text-red-700">No compatible recipient-volunteer match.</p>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <a
                  href={routeLinkForPoints(navPoints)}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700"
                >
                  Open Live Navigation
                </a>
                <a
                  href={routeLinkForPoints(multiStopNavPoints)}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-md border border-orange-300 px-2 py-1 text-xs text-orange-700"
                >
                  Open Multi-Stop Navigation
                </a>
              </div>
            </section>

            <section className="rounded-xl border bg-white p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Volunteer Task Tracking</p>
              <p className="mt-2 text-sm text-slate-700">
                Delivered {progress.delivered}/{progress.total}
              </p>
              <p className="text-xs text-slate-500">Pending offline sync: {pendingSyncCount}</p>
              <div className="mt-3 space-y-2">
                {tasks.map((task) => (
                  <div key={task.id} className="rounded-lg border border-slate-200 p-2">
                    <p className="text-xs text-slate-500">Task {task.id}</p>
                    <p className="text-sm font-medium text-slate-900">Status: {task.status}</p>
                    {task.escalated ? <p className="text-xs text-red-600">Escalated due to delayed response</p> : null}
                    {task.proofImageUrl ? (
                      <Image
                        src={task.proofImageUrl}
                        alt="Delivery proof"
                        width={320}
                        height={80}
                        className="mt-2 h-20 w-full rounded object-cover"
                      />
                    ) : null}
                    <div className="mt-2 flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => void updateTaskStatus(task.id, "assigned")}>Accept</Button>
                      <Button size="sm" variant="outline" onClick={() => void updateTaskStatus(task.id, "picked")}>Pick</Button>
                      <Button size="sm" onClick={() => void updateTaskStatus(task.id, "delivered")}>Deliver</Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void updateTaskStatus(task.id, task.status, { escalated: true })}
                      >
                        Escalate
                      </Button>
                    </div>
                    <label className="mt-2 block text-xs text-slate-600">
                      Proof image
                      <input
                        type="file"
                        accept="image/*"
                        className="mt-1 block text-xs"
                        onChange={(event) => {
                          const file = event.target.files?.[0] ?? null;
                          void uploadProofImage(task.id, file);
                        }}
                      />
                    </label>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-xl border bg-white p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Notifications</p>
              <div className="mt-2 space-y-2">
                {!notifications.length ? (
                  <p className="text-xs text-slate-500">No alerts yet.</p>
                ) : (
                  notifications.map((notice) => (
                    <div
                      key={notice.id}
                      className={`rounded border px-2 py-1 text-xs ${
                        notice.level === "critical"
                          ? "border-red-300 bg-red-50 text-red-700"
                          : notice.level === "warning"
                            ? "border-amber-300 bg-amber-50 text-amber-700"
                            : "border-slate-200 bg-slate-50 text-slate-700"
                      }`}
                    >
                      {notice.message}
                    </div>
                  ))
                )}
              </div>
            </section>
          </aside>

          <section className="rounded-xl border bg-white p-2 md:p-4">
            <LogisticsMap
              listing={listing}
              recipients={recipients}
              volunteers={volunteers}
              selectedRecipientId={assignment?.recipient.id}
              selectedVolunteerId={assignment?.volunteer.id}
              pickupRoute={pickupRoute}
              deliveryRoute={deliveryRoute}
              multiStopRoutes={multiStopRoutes}
            />
            <div className="mt-3 grid gap-2 text-sm text-slate-700 md:grid-cols-2">
              <p>
                Pickup leg: {pickupRoute?.distanceKm ?? "-"} km / {pickupRoute?.durationMinutes ?? "-"} min
              </p>
              <p>
                Delivery leg: {deliveryRoute?.distanceKm ?? "-"} km / {deliveryRoute?.durationMinutes ?? "-"} min
              </p>
              <p>
                Multi-stop: {multiStopPlan?.totalDistanceKm ?? "-"} km / {multiStopPlan?.totalDurationMinutes ?? "-"} min
              </p>
              <p>
                Sequence: {multiStopPlan?.sequence?.join(" -> ") ?? "-"}
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
