"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import { authClient } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

  const etaMinutes = assignment?.totalMinutes || (pickupRoute?.durationMinutes ?? 0) + (deliveryRoute?.durationMinutes ?? 0);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,#dbeafe_0%,#f8fafc_38%,#f5f3ff_100%)] p-4 md:p-8">
      <SWRegister />

      <div className="mx-auto flex max-w-7xl flex-col gap-4">
        <Card className="border-slate-200/80 bg-white/90 backdrop-blur-sm">
          <CardContent className="pt-6">
            <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
              <div>
                <p className="text-sm font-medium tracking-wide text-slate-500">Real-time Rescue Operations</p>
                <h1 className="text-3xl font-bold tracking-tight text-slate-900">Logistics Command Center</h1>
                <p className="text-sm text-slate-600">Welcome, {data?.user?.name ?? "Operator"}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    isOnline ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                  }`}
                >
                  {isOnline ? "Online Sync Active" : "Offline Queueing Enabled"}
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
          </CardContent>
        </Card>

        <Card className="border-slate-200/80 bg-white/90 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-base">Active Donation Feed</CardTitle>
            <CardDescription>Choose a listing to update assignment, route, and role dashboards.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 md:grid-cols-3">
              {donorListings.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setActiveListingId(item.id)}
                  className={`rounded-lg border p-3 text-left transition ${
                    item.id === listing.id
                      ? "border-blue-500 bg-blue-50 ring-2 ring-blue-200"
                      : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                >
                  <p className="text-sm font-semibold text-slate-900">{item.location.label}</p>
                  <p className="mt-1 text-xs text-slate-600">
                    {item.foodType} • {item.quantityKg}kg • expires in {item.expiresInMinutes}m
                  </p>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue="volunteer" className="gap-4">
          <TabsList className="grid h-11 w-full grid-cols-3 bg-slate-100 p-1">
            <TabsTrigger value="volunteer" className="font-semibold">Volunteer View</TabsTrigger>
            <TabsTrigger value="ngo" className="font-semibold">NGO View</TabsTrigger>
            <TabsTrigger value="donor" className="font-semibold">Donor View</TabsTrigger>
          </TabsList>

          <TabsContent value="volunteer" className="space-y-4">
            <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
              <Card className="border-slate-200/80 bg-white/95">
                <CardHeader>
                  <CardTitle className="text-lg">Volunteer Navigation Console</CardTitle>
                  <CardDescription>Live map with pickup, delivery, and optional multi-stop routing.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
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

                  <div className="grid gap-2 text-sm text-slate-700 md:grid-cols-2">
                    <p className="rounded-md bg-slate-50 p-2">Pickup: {pickupRoute?.distanceKm ?? "-"} km / {pickupRoute?.durationMinutes ?? "-"} min</p>
                    <p className="rounded-md bg-slate-50 p-2">Delivery: {deliveryRoute?.distanceKm ?? "-"} km / {deliveryRoute?.durationMinutes ?? "-"} min</p>
                    <p className="rounded-md bg-slate-50 p-2">Multi-stop: {multiStopPlan?.totalDistanceKm ?? "-"} km / {multiStopPlan?.totalDurationMinutes ?? "-"} min</p>
                    <p className="rounded-md bg-slate-50 p-2">Matrix source: {matrixSource}</p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <a
                      href={routeLinkForPoints(navPoints)}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Open Live Route
                    </a>
                    <a
                      href={routeLinkForPoints(multiStopNavPoints)}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-md border border-orange-300 px-3 py-2 text-sm font-medium text-orange-700 hover:bg-orange-50"
                    >
                      Open Multi-stop Route
                    </a>
                  </div>
                </CardContent>
              </Card>

              <div className="space-y-4">
                <Card className="border-slate-200/80 bg-white/95">
                  <CardHeader>
                    <CardTitle className="text-base">Assignment and Readiness</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm text-slate-700">
                    <p className="rounded-md bg-slate-50 p-2">Readiness: <span className="font-semibold">{readiness}/100</span></p>
                    <p className="rounded-md bg-slate-50 p-2">Safety screen: <span className="font-semibold">{safety}</span></p>
                    <p className="rounded-md bg-slate-50 p-2">Crisis: <span className="font-semibold">{appliedCrisis.severity.toUpperCase()}</span> ({appliedCrisis.radiusMultiplier}x radius)</p>
                    {assignment ? (
                      <>
                        <p className="rounded-md bg-slate-50 p-2">Volunteer: <span className="font-semibold">{assignment.volunteer.name}</span></p>
                        <p className="rounded-md bg-slate-50 p-2">Recipient: <span className="font-semibold">{assignment.recipient.name}</span></p>
                        <p className="rounded-md bg-slate-50 p-2">ETA: <span className="font-semibold">{etaMinutes} min</span></p>
                        <p className="rounded-md bg-slate-50 p-2">Score: <span className="font-semibold">{assignment.score}</span></p>
                        <p className="rounded-md bg-slate-50 p-2">Sequence: <span className="font-semibold">{multiStopPlan?.sequence?.join(" -> ") ?? "Single donor flow"}</span></p>
                      </>
                    ) : (
                      <p className="rounded-md bg-red-50 p-2 text-red-700">No compatible recipient-volunteer assignment right now.</p>
                    )}
                  </CardContent>
                </Card>

                <Card className="border-slate-200/80 bg-white/95">
                  <CardHeader>
                    <CardTitle className="text-base">Volunteer Task Tracking</CardTitle>
                    <CardDescription>Delivered {progress.delivered}/{progress.total} • Pending sync {pendingSyncCount}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {tasks.map((task) => (
                      <div key={task.id} className="rounded-lg border border-slate-200 p-3">
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
                        <div className="mt-2 flex flex-wrap gap-2">
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
                  </CardContent>
                </Card>

                <Card className="border-slate-200/80 bg-white/95">
                  <CardHeader>
                    <CardTitle className="text-base">Operational Alerts</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {!notifications.length ? (
                      <p className="text-sm text-slate-500">No alerts yet.</p>
                    ) : (
                      notifications.map((notice) => (
                        <div
                          key={notice.id}
                          className={`rounded border px-3 py-2 text-sm ${
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
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="ngo" className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-2">
              <Card className="border-slate-200/80 bg-white/95">
                <CardHeader>
                  <CardTitle className="text-lg">NGO Intake and Capacity</CardTitle>
                  <CardDescription>Clear recipient compatibility and intake readiness for the selected donation.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {recipients.map((recipient) => {
                    const acceptsFoodType = recipient.acceptedFoodTypes.includes(listing.foodType);
                    const acceptsCategory = recipient.acceptedCategories.includes(listing.category);
                    const canTakeLoad = recipient.capacityMeals >= listing.quantityKg * 4;
                    const eligible = acceptsFoodType && acceptsCategory && canTakeLoad && recipient.openNow;

                    return (
                      <div key={recipient.id} className="rounded-lg border border-slate-200 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-slate-900">{recipient.name}</p>
                          <span
                            className={`rounded-full px-2 py-1 text-xs font-semibold ${
                              eligible ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
                            }`}
                          >
                            {eligible ? "Eligible" : "Review"}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-slate-600">Capacity: {recipient.capacityMeals} meals • Open: {recipient.openNow ? "Yes" : "No"}</p>
                        <p className="mt-1 text-xs text-slate-600">
                          Types: {recipient.acceptedFoodTypes.join(", ")} • Categories: {recipient.acceptedCategories.join(", ")}
                        </p>
                        <p className="mt-1 text-xs text-slate-600">Refrigeration: {recipient.refrigeration ? "Available" : "Unavailable"}</p>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>

              <Card className="border-slate-200/80 bg-white/95">
                <CardHeader>
                  <CardTitle className="text-lg">NGO Situation Board</CardTitle>
                  <CardDescription>Crisis severity, route confidence, and expected inbound supply.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-slate-700">
                  <div className="rounded-lg bg-slate-50 p-3">
                    <p className="text-xs uppercase tracking-wide text-slate-500">Crisis State</p>
                    <p className="mt-1 font-semibold text-slate-900">{appliedCrisis.severity.toUpperCase()}</p>
                    <p className="text-xs text-slate-600">{appliedCrisis.reason}</p>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-3">
                    <p className="text-xs uppercase tracking-wide text-slate-500">Inbound Donation</p>
                    <p className="mt-1 font-semibold text-slate-900">{listing.location.label}</p>
                    <p>{listing.quantityKg}kg • {listing.foodType} • expires in {listing.expiresInMinutes}m</p>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-3">
                    <p className="text-xs uppercase tracking-wide text-slate-500">Route Confidence</p>
                    <p>Engine: <span className="font-semibold">{matrixSource}</span></p>
                    <p>Volunteer ETA: <span className="font-semibold">{etaMinutes || "-"} min</span></p>
                    <p>Pickup + Delivery available: <span className="font-semibold">{pickupRoute && deliveryRoute ? "Yes" : "Pending"}</span></p>
                  </div>
                  <div className="rounded-lg bg-blue-50 p-3 text-blue-800">
                    <p className="font-semibold">Recommended receiving center</p>
                    <p>{assignment?.recipient.name ?? "Awaiting compatible assignment"}</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="donor" className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
              <Card className="border-slate-200/80 bg-white/95">
                <CardHeader>
                  <CardTitle className="text-lg">Donor Listings</CardTitle>
                  <CardDescription>Create urgency-aware donations and monitor rescue readiness clearly.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3 md:grid-cols-2">
                  {donorListings.map((item) => (
                    <div
                      key={item.id}
                      className={`rounded-lg border p-3 ${
                        item.id === listing.id ? "border-blue-400 bg-blue-50" : "border-slate-200"
                      }`}
                    >
                      <p className="text-sm font-semibold text-slate-900">{item.location.label}</p>
                      <p className="text-xs text-slate-600">Prepared at {item.prepTime}</p>
                      <p className="mt-1 text-sm text-slate-700">{item.quantityKg}kg • {item.foodType} • {item.category}</p>
                      <p className="mt-1 text-xs text-slate-600">Expires in {item.expiresInMinutes} minutes</p>
                      <p className="mt-1 text-xs text-slate-600">Reliability score: {(item.donorReliability * 100).toFixed(0)}%</p>
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-3"
                        onClick={() => setActiveListingId(item.id)}
                      >
                        Focus This Listing
                      </Button>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <div className="space-y-4">
                <Card className="border-slate-200/80 bg-white/95">
                  <CardHeader>
                    <CardTitle className="text-base">Donor Quality Guardrails</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm text-slate-700">
                    <p className="rounded-md bg-slate-50 p-2">Use only near-expiry genuine surplus, never fresh production stock.</p>
                    <p className="rounded-md bg-slate-50 p-2">Keep package labeling clear for allergens and prep timestamp.</p>
                    <p className="rounded-md bg-slate-50 p-2">Prioritize handoff within {listing.expiresInMinutes} minutes for this listing.</p>
                    <p className="rounded-md bg-slate-50 p-2">Current rescue readiness score: <span className="font-semibold">{readiness}/100</span></p>
                  </CardContent>
                </Card>

                <Card className="border-slate-200/80 bg-white/95">
                  <CardHeader>
                    <CardTitle className="text-base">Donor Dispatch Summary</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm text-slate-700">
                    <p className="rounded-md bg-slate-50 p-2">Assigned volunteer: <span className="font-semibold">{assignment?.volunteer.name ?? "Pending"}</span></p>
                    <p className="rounded-md bg-slate-50 p-2">Receiving NGO: <span className="font-semibold">{assignment?.recipient.name ?? "Pending"}</span></p>
                    <p className="rounded-md bg-slate-50 p-2">Estimated completion: <span className="font-semibold">{etaMinutes || "-"} min</span></p>
                    <p className="rounded-md bg-slate-50 p-2">Route path ready: <span className="font-semibold">{pickupRoute && deliveryRoute ? "Yes" : "No"}</span></p>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
