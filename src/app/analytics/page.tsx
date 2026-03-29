"use client";

import { useEffect, useMemo, useState } from "react";
import { PublicNavbar } from "@/components/platform/layout/public-navbar";
import { AnalyticsChartCard } from "@/components/platform/analytics/analytics-chart-card";
import { StatCard } from "@/components/platform/common/stat-card";
import { WebsiteAiAssistant } from "@/components/platform/common/website-ai-assistant";

interface SupplierAnalyticsPayload {
  metrics?: {
    mealsContributed?: number;
    successfulPickups?: number;
    averageResponseMinutes?: number;
    peopleServed?: number;
    wastePreventedKg?: number;
    co2ReductionKg?: number;
  };
  trustProfile?: {
    score?: number;
    level?: string;
  };
}

interface ReceiverAnalyticsPayload {
  metrics?: {
    totalNeeds?: number;
    activeNeeds?: number;
    matchedNeeds?: number;
    avgMealsPerNeed?: number;
    avgPromptReach?: number;
  };
}

interface VolunteerAnalyticsPayload {
  metrics?: {
    totalEvents?: number;
    acceptedCount?: number;
    deliveredCount?: number;
    proofCount?: number;
    avgEventsPerTask?: number;
  };
}

interface LifecycleTimelineItem {
  id?: string;
  event_type?: string;
  actor_role?: string;
  status_after?: string | null;
  occurred_at?: string;
}

function numberOrZero(value: number | null | undefined) {
  return Number.isFinite(value ?? NaN) ? Number(value) : 0;
}

function formatCompact(value: number | null | undefined) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(numberOrZero(value));
}

export default function AnalyticsPage() {
  const [supplierAnalytics, setSupplierAnalytics] = useState<SupplierAnalyticsPayload | null>(null);
  const [receiverAnalytics, setReceiverAnalytics] = useState<ReceiverAnalyticsPayload | null>(null);
  const [volunteerAnalytics, setVolunteerAnalytics] = useState<VolunteerAnalyticsPayload | null>(null);
  const [timeline, setTimeline] = useState<LifecycleTimelineItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const loadAnalytics = async () => {
      setIsLoading(true);

      try {
        const [supplierRes, receiverRes, volunteerRes, lifecycleRes] = await Promise.all([
          fetch("/api/supplier/analytics", { cache: "no-store" }),
          fetch("/api/receiver/analytics", { cache: "no-store" }),
          fetch("/api/volunteer/analytics", { cache: "no-store" }),
          fetch("/api/lifecycle?limit=120", { cache: "no-store" }),
        ]);

        if (!cancelled && supplierRes.ok) {
          const payload = (await supplierRes.json()) as SupplierAnalyticsPayload;
          setSupplierAnalytics(payload);
        }

        if (!cancelled && receiverRes.ok) {
          const payload = (await receiverRes.json()) as ReceiverAnalyticsPayload;
          setReceiverAnalytics(payload);
        }

        if (!cancelled && volunteerRes.ok) {
          const payload = (await volunteerRes.json()) as VolunteerAnalyticsPayload;
          setVolunteerAnalytics(payload);
        }

        if (!cancelled && lifecycleRes.ok) {
          const payload = (await lifecycleRes.json()) as { timeline?: LifecycleTimelineItem[] };
          setTimeline(Array.isArray(payload.timeline) ? payload.timeline : []);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void loadAnalytics();
    const timer = window.setInterval(() => {
      void loadAnalytics();
    }, 180000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const supplierMetrics = supplierAnalytics?.metrics;
  const receiverMetrics = receiverAnalytics?.metrics;
  const volunteerMetrics = volunteerAnalytics?.metrics;

  const operationsTrend = useMemo(
    () => [
      { day: "Meals", value: numberOrZero(supplierMetrics?.mealsContributed) },
      { day: "Pickups", value: numberOrZero(supplierMetrics?.successfulPickups) },
      { day: "Delivered", value: numberOrZero(volunteerMetrics?.deliveredCount) },
      { day: "Matched", value: numberOrZero(receiverMetrics?.matchedNeeds) },
    ],
    [receiverMetrics?.matchedNeeds, supplierMetrics?.mealsContributed, supplierMetrics?.successfulPickups, volunteerMetrics?.deliveredCount],
  );

  const roleBalance = useMemo(
    () => [
      { day: "Donor", value: numberOrZero(supplierMetrics?.peopleServed) },
      { day: "Recipient", value: numberOrZero(receiverMetrics?.activeNeeds) },
      { day: "Volunteer", value: numberOrZero(volunteerMetrics?.acceptedCount) },
    ],
    [receiverMetrics?.activeNeeds, supplierMetrics?.peopleServed, volunteerMetrics?.acceptedCount],
  );

  const lifecycleByRole = useMemo(() => {
    const roleMap = new Map<string, number>();
    for (const event of timeline) {
      const role = String(event.actor_role ?? "system");
      roleMap.set(role, (roleMap.get(role) ?? 0) + 1);
    }

    return [...roleMap.entries()].map(([role, count]) => ({
      day: role.toUpperCase(),
      value: count,
    }));
  }, [timeline]);

  const lifecycleByEvent = useMemo(() => {
    const eventMap = new Map<string, number>();
    for (const event of timeline) {
      const eventType = String(event.event_type ?? "status_updated");
      eventMap.set(eventType, (eventMap.get(eventType) ?? 0) + 1);
    }

    return [...eventMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([eventType, count]) => ({
        day: eventType.replaceAll("_", " "),
        value: count,
      }));
  }, [timeline]);

  const rescueConversionRate = useMemo(() => {
    const accepted = numberOrZero(volunteerMetrics?.acceptedCount);
    const delivered = numberOrZero(volunteerMetrics?.deliveredCount);
    if (!accepted) return 0;
    return Number(((delivered / accepted) * 100).toFixed(1));
  }, [volunteerMetrics?.acceptedCount, volunteerMetrics?.deliveredCount]);

  const executionFunnel = useMemo(
    () => [
      { day: "Needs Raised", value: numberOrZero(receiverMetrics?.totalNeeds) },
      { day: "Needs Matched", value: numberOrZero(receiverMetrics?.matchedNeeds) },
      { day: "Tasks Accepted", value: numberOrZero(volunteerMetrics?.acceptedCount) },
      { day: "Tasks Delivered", value: numberOrZero(volunteerMetrics?.deliveredCount) },
    ],
    [receiverMetrics?.matchedNeeds, receiverMetrics?.totalNeeds, volunteerMetrics?.acceptedCount, volunteerMetrics?.deliveredCount],
  );

  const impactSplit = useMemo(
    () => [
      { day: "Meals", value: numberOrZero(supplierMetrics?.mealsContributed) },
      { day: "People", value: numberOrZero(supplierMetrics?.peopleServed) },
      { day: "Waste KG", value: numberOrZero(supplierMetrics?.wastePreventedKg) },
      { day: "CO2 KG", value: numberOrZero(supplierMetrics?.co2ReductionKg) },
    ],
    [supplierMetrics?.co2ReductionKg, supplierMetrics?.mealsContributed, supplierMetrics?.peopleServed, supplierMetrics?.wastePreventedKg],
  );

  const responsePressure = useMemo(
    () => [
      { day: "Need backlog", value: Math.max(0, numberOrZero(receiverMetrics?.activeNeeds) - numberOrZero(receiverMetrics?.matchedNeeds)) },
      { day: "Response mins", value: numberOrZero(supplierMetrics?.averageResponseMinutes) },
      { day: "Proof gaps", value: Math.max(0, numberOrZero(volunteerMetrics?.acceptedCount) - numberOrZero(volunteerMetrics?.proofCount)) },
    ],
    [receiverMetrics?.activeNeeds, receiverMetrics?.matchedNeeds, supplierMetrics?.averageResponseMinutes, volunteerMetrics?.acceptedCount, volunteerMetrics?.proofCount],
  );

  const attentionNotes = useMemo(() => {
    const notes: string[] = [];
    if (numberOrZero(receiverMetrics?.activeNeeds) > numberOrZero(receiverMetrics?.matchedNeeds)) {
      notes.push("Recipient demand is ahead of current matching throughput.");
    }
    if (numberOrZero(supplierMetrics?.averageResponseMinutes) > 45) {
      notes.push("Supplier response time is above target; consider more volunteer availability windows.");
    }
    if (rescueConversionRate < 75) {
      notes.push("Volunteer acceptance-to-delivery conversion is low; review route quality and load fitting.");
    }
    if (!notes.length) {
      notes.push("All core signals are stable. Keep monitoring lifecycle anomalies and urgent windows.");
    }
    return notes;
  }, [receiverMetrics?.activeNeeds, receiverMetrics?.matchedNeeds, rescueConversionRate, supplierMetrics?.averageResponseMinutes]);

  const donorSeries = useMemo(
    () => [
      { day: "Meals", value: numberOrZero(supplierMetrics?.mealsContributed) },
      { day: "Pickups", value: numberOrZero(supplierMetrics?.successfulPickups) },
      { day: "People", value: numberOrZero(supplierMetrics?.peopleServed) },
      { day: "Waste KG", value: numberOrZero(supplierMetrics?.wastePreventedKg) },
    ],
    [supplierMetrics?.mealsContributed, supplierMetrics?.peopleServed, supplierMetrics?.successfulPickups, supplierMetrics?.wastePreventedKg],
  );

  const ngoSeries = useMemo(
    () => [
      { day: "Total Needs", value: numberOrZero(receiverMetrics?.totalNeeds) },
      { day: "Active Needs", value: numberOrZero(receiverMetrics?.activeNeeds) },
      { day: "Matched Needs", value: numberOrZero(receiverMetrics?.matchedNeeds) },
      { day: "Prompt Reach", value: numberOrZero(receiverMetrics?.avgPromptReach) },
    ],
    [receiverMetrics?.activeNeeds, receiverMetrics?.avgPromptReach, receiverMetrics?.matchedNeeds, receiverMetrics?.totalNeeds],
  );

  const volunteerSeries = useMemo(
    () => [
      { day: "Accepted", value: numberOrZero(volunteerMetrics?.acceptedCount) },
      { day: "Delivered", value: numberOrZero(volunteerMetrics?.deliveredCount) },
      { day: "Proof", value: numberOrZero(volunteerMetrics?.proofCount) },
      { day: "Events/Task", value: numberOrZero(volunteerMetrics?.avgEventsPerTask) },
    ],
    [volunteerMetrics?.acceptedCount, volunteerMetrics?.avgEventsPerTask, volunteerMetrics?.deliveredCount, volunteerMetrics?.proofCount],
  );

  return (
    <main className="min-h-screen bg-gradient-to-b from-cyan-50 via-slate-50 to-emerald-50">
      <PublicNavbar />
      <section className="mx-auto max-w-7xl space-y-4 px-4 py-8">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Feedo Analytics</p>
          <h1 className="text-2xl font-bold text-slate-900">Impact Overview</h1>
          <p className="mt-1 text-xs text-slate-400">
            {isLoading ? "Refreshing..." : `${timeline.length} lifecycle events loaded`}
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Meals rescued" value={formatCompact(supplierMetrics?.mealsContributed)} tone="success" />
          <StatCard label="People served" value={formatCompact(supplierMetrics?.peopleServed)} tone="success" />
          <StatCard label="Needs matched" value={formatCompact(receiverMetrics?.matchedNeeds)} tone="neutral" />
          <StatCard label="Rescue conversion" value={`${formatCompact(rescueConversionRate)}%`} tone="warning" />
          <StatCard label="Avg supplier response" value={`${formatCompact(supplierMetrics?.averageResponseMinutes)} min`} tone="warning" />
          <StatCard label="Volunteer proof logs" value={formatCompact(volunteerMetrics?.proofCount)} tone="neutral" />
          <StatCard label="Waste prevented (kg)" value={formatCompact(supplierMetrics?.wastePreventedKg)} tone="success" />
          <StatCard label="CO2 reduction (kg)" value={formatCompact(supplierMetrics?.co2ReductionKg)} tone="success" />
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <div id="donor-analytics" className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-emerald-700">Donor / Supplier Analytics</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <StatCard label="Meals" value={formatCompact(supplierMetrics?.mealsContributed)} tone="success" />
              <StatCard label="Pickups" value={formatCompact(supplierMetrics?.successfulPickups)} tone="success" />
            </div>
            <div className="mt-3">
              <AnalyticsChartCard title="Supplier Performance" type="bar" data={donorSeries} />
            </div>
          </div>

          <div id="ngo-analytics" className="rounded-xl border border-blue-200 bg-blue-50/50 p-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-blue-700">NGO / Recipient Analytics</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <StatCard label="Needs" value={formatCompact(receiverMetrics?.totalNeeds)} tone="neutral" />
              <StatCard label="Matched" value={formatCompact(receiverMetrics?.matchedNeeds)} tone="success" />
            </div>
            <div className="mt-3">
              <AnalyticsChartCard title="Recipient Demand Funnel" type="line" data={ngoSeries} />
            </div>
          </div>

          <div id="volunteer-analytics" className="rounded-xl border border-amber-200 bg-amber-50/50 p-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-amber-700">Volunteer Analytics</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <StatCard label="Accepted" value={formatCompact(volunteerMetrics?.acceptedCount)} tone="warning" />
              <StatCard label="Delivered" value={formatCompact(volunteerMetrics?.deliveredCount)} tone="success" />
            </div>
            <div className="mt-3">
              <AnalyticsChartCard title="Volunteer Throughput" type="bar" data={volunteerSeries} />
            </div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <AnalyticsChartCard title="Cross-Role Throughput" type="bar" data={operationsTrend} />
          <AnalyticsChartCard title="Role Balance" type="donut" data={roleBalance} />
          <AnalyticsChartCard title="Lifecycle Activity by Role" type="bar" data={lifecycleByRole.length ? lifecycleByRole : [{ day: "NO DATA", value: 0 }]} />
          <AnalyticsChartCard title="Top Lifecycle Event Types" type="line" data={lifecycleByEvent.length ? lifecycleByEvent : [{ day: "no events", value: 0 }]} />
          <AnalyticsChartCard title="Execution Funnel" type="bar" data={executionFunnel} />
          <AnalyticsChartCard title="Impact Split" type="donut" data={impactSplit} />
          <AnalyticsChartCard title="Operational Pressure" type="line" data={responsePressure} />

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="text-base font-semibold text-slate-900">Operational Attention</h3>
            <ul className="mt-2 space-y-2 text-sm text-slate-700">
              {attentionNotes.map((note) => (
                <li key={note} className="rounded-lg bg-slate-50 px-3 py-2">
                  {note}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="text-base font-semibold text-slate-900">Trust and Reliability</h3>
            <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">Trust score</p>
                <p className="mt-1 text-lg font-bold text-slate-900">
                  {formatCompact(supplierAnalytics?.trustProfile?.score)}
                </p>
                <p className="text-xs text-slate-500">{supplierAnalytics?.trustProfile?.level ?? "N/A"}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">Volunteer avg events/task</p>
                <p className="mt-1 text-lg font-bold text-slate-900">
                  {formatCompact(volunteerMetrics?.avgEventsPerTask)}
                </p>
                <p className="text-xs text-slate-500">Higher can indicate richer traceability</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">Prompt reach</p>
                <p className="mt-1 text-lg font-bold text-slate-900">
                  {formatCompact(receiverMetrics?.avgPromptReach)}
                </p>
                <p className="text-xs text-slate-500">Suppliers per need request</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">Volunteer accepted</p>
                <p className="mt-1 text-lg font-bold text-slate-900">
                  {formatCompact(volunteerMetrics?.acceptedCount)}
                </p>
                <p className="text-xs text-slate-500">Operational pickup commitments</p>
              </div>
            </div>
          </div>

          <WebsiteAiAssistant
            title="AI Website Assistant"
            description="General-purpose assistant for Feedo website questions and route guidance."
            maxSuggestions={5}
          />
        </div>
      </section>
    </main>
  );
}
