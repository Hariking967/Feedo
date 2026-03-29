"use client";

import { useEffect, useMemo, useState } from "react";
import { crisisZones, donations, recipients } from "@/lib/platform/mock-data";
import { CrisisBanner } from "@/components/platform/crisis/crisis-banner";
import { PublicNavbar } from "@/components/platform/layout/public-navbar";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

const CRISIS_MODE_STORAGE_KEY = "frp.crisis-mode.enabled.v1";

interface CrisisSignalSnapshot {
  riskScore: number;
  severity: "normal" | "elevated" | "critical";
  weatherMain: string;
  windSpeed: number;
  rain1h: number;
  temperatureC: number;
  crisisRecommended: boolean;
  recommendedActions?: string[];
}

export default function CrisisPage() {
  const [isCrisisModeEnabled, setIsCrisisModeEnabled] = useState(false);
  const [signal, setSignal] = useState<CrisisSignalSnapshot | null>(null);
  const [selectedZoneId, setSelectedZoneId] = useState<string>(crisisZones[0]?.id ?? "");
  const [zoneOverrides, setZoneOverrides] = useState<Record<string, boolean>>({});
  const [isRefreshingSignal, setIsRefreshingSignal] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const storedValue = window.localStorage.getItem(CRISIS_MODE_STORAGE_KEY);
    setIsCrisisModeEnabled(storedValue === "1");
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(CRISIS_MODE_STORAGE_KEY, isCrisisModeEnabled ? "1" : "0");
  }, [isCrisisModeEnabled]);

  useEffect(() => {
    let cancelled = false;

    const refreshSignal = async () => {
      setIsRefreshingSignal(true);
      try {
        const response = await fetch("/api/crisis/signals?lat=12.9716&lng=77.5946", { cache: "no-store" });
        if (!response.ok) throw new Error("signal unavailable");
        const payload = (await response.json()) as CrisisSignalSnapshot;
        if (!cancelled) {
          setSignal({
            riskScore: Number(payload.riskScore ?? 0),
            severity:
              payload.severity === "critical" || payload.severity === "elevated"
                ? payload.severity
                : "normal",
            weatherMain: String(payload.weatherMain ?? "unknown"),
            windSpeed: Number(payload.windSpeed ?? 0),
            rain1h: Number(payload.rain1h ?? 0),
            temperatureC: Number(payload.temperatureC ?? 0),
            crisisRecommended: Boolean(payload.crisisRecommended),
          });
        }
      } catch {
        if (!cancelled) {
          setSignal(null);
        }
      } finally {
        if (!cancelled) {
          setIsRefreshingSignal(false);
        }
      }
    };

    void refreshSignal();
    const timer = window.setInterval(() => {
      void refreshSignal();
    }, 60000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const activeZones = useMemo(
    () =>
      crisisZones.filter((zone) => {
        if (zoneOverrides[zone.id] != null) return zoneOverrides[zone.id];
        return zone.active;
      }),
    [zoneOverrides],
  );

  const prioritizedDonations = useMemo(
    () =>
      [...donations].sort((a, b) => {
        const urgencyScore = (urgency: typeof a.urgency) =>
          urgency === "critical" ? 4 : urgency === "high" ? 3 : urgency === "medium" ? 2 : 1;
        const aScore = urgencyScore(a.urgency) + (isCrisisModeEnabled ? (a.safetyStatus === "pickup_soon" ? 2 : 0) : 0);
        const bScore = urgencyScore(b.urgency) + (isCrisisModeEnabled ? (b.safetyStatus === "pickup_soon" ? 2 : 0) : 0);
        return bScore - aScore;
      }),
    [isCrisisModeEnabled],
  );

  const activateSelectedZone = () => {
    if (!selectedZoneId) return;
    setZoneOverrides((current) => ({ ...current, [selectedZoneId]: true }));
  };

  const deactivateSelectedZone = () => {
    if (!selectedZoneId) return;
    setZoneOverrides((current) => ({ ...current, [selectedZoneId]: false }));
  };

  const shouldForceCrisis = isCrisisModeEnabled || activeZones.length > 0 || Boolean(signal?.crisisRecommended);

  return (
    <main className="min-h-screen bg-gradient-to-b from-rose-950/5 via-slate-50 to-slate-100 dark:from-rose-950/30 dark:via-slate-950 dark:to-slate-950">
      <PublicNavbar />
      <section className="mx-auto max-w-7xl space-y-4 px-4 py-8">
        <CrisisBanner
          active={shouldForceCrisis}
          message={
            shouldForceCrisis
              ? "Emergency protocol active. Routing and matching are now locked to life-critical prioritization."
              : "No forced crisis mode. System is operating in balanced mode."
          }
        />

        <div className="rounded-xl border border-rose-400 bg-gradient-to-r from-rose-900 to-red-700 p-4 text-white shadow-lg shadow-rose-900/25 dark:border-rose-500">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-rose-100">Incident Command</p>
              <h2 className="text-lg font-semibold">Force crisis mode across dashboards</h2>
              <p className="text-sm text-rose-100">
                This trigger enforces emergency weighting for recipient matching and volunteer routing.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${isCrisisModeEnabled ? "bg-white text-rose-800" : "bg-rose-100/20 text-rose-100"}`}>
                {isCrisisModeEnabled ? "CRISIS MODE ON" : "AUTO MODE"}
              </span>
              <Switch checked={isCrisisModeEnabled} onCheckedChange={setIsCrisisModeEnabled} />
            </div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-xl border border-rose-200 bg-white p-4 lg:col-span-2 dark:border-rose-900/40 dark:bg-slate-900">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Crisis zones</h2>
            <div className="mt-3 space-y-3">
              {crisisZones.map((zone) => {
                const active = zoneOverrides[zone.id] != null ? zoneOverrides[zone.id] : zone.active;
                return (
                  <article
                    key={zone.id}
                    className={`rounded-lg border p-3 ${
                      active
                        ? "border-rose-300 bg-rose-50 dark:border-rose-900/40 dark:bg-rose-950/20"
                        : "border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/40"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => setSelectedZoneId(zone.id)}
                        className={`text-left font-semibold ${selectedZoneId === zone.id ? "text-rose-700 dark:text-rose-300" : "text-slate-900 dark:text-slate-100"}`}
                      >
                        {zone.zone}
                      </button>
                      <span className={`rounded-full px-2 py-1 text-xs font-semibold ${active ? "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-200" : "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-100"}`}>
                        {active ? "active" : "standby"}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{zone.reason}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Impacted recipients: {zone.impactedRecipients}</p>
                  </article>
                );
              })}
            </div>
          </div>

          <div className="space-y-3 rounded-xl border border-rose-300 bg-rose-50 p-4 dark:border-rose-900/50 dark:bg-rose-950/20">
            <h2 className="text-lg font-semibold text-rose-900 dark:text-rose-100">Emergency actions</h2>
            <label className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Selected zone
              <select
                value={selectedZoneId}
                onChange={(event) => setSelectedZoneId(event.target.value)}
                className="mt-1 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                {crisisZones.map((zone) => (
                  <option key={zone.id} value={zone.id}>{zone.zone}</option>
                ))}
              </select>
            </label>
            <Button className="w-full justify-start bg-rose-700 hover:bg-rose-800" onClick={activateSelectedZone}>Activate crisis mode for zone</Button>
            <Button variant="outline" className="w-full justify-start border-rose-300 text-rose-700" onClick={deactivateSelectedZone}>Deactivate crisis mode for zone</Button>
            <Button variant="outline" className="w-full justify-start border-rose-300 text-rose-700">Reassign nearest volunteer squad</Button>
            <Button variant="outline" className="w-full justify-start border-rose-300 text-rose-700">Escalate priority weighting</Button>
            <Button variant="outline" className="w-full justify-start border-rose-300 text-rose-700">Flag unsafe donation batch</Button>
            <Button variant="outline" className="w-full justify-start border-rose-300 text-rose-700">Open incident audit trail</Button>
            <div className="rounded-lg border border-rose-200 bg-white p-3 text-xs text-rose-900 dark:border-rose-900/40 dark:bg-slate-900 dark:text-rose-200">
              Protocol: activate zone, assign nearest volunteers, lock urgent matching, and monitor signal every cycle.
            </div>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100">Bulk dispatch list</h3>
            <ul className="mt-2 space-y-2 text-sm text-slate-600 dark:text-slate-300">
              {prioritizedDonations.slice(0, 4).map((donation) => (
                <li key={donation.id} className="rounded-md bg-slate-50 p-2 dark:bg-slate-800">
                  {donation.title} | {donation.quantity} | {donation.urgency}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100">High-priority recipient list</h3>
            <ul className="mt-2 space-y-2 text-sm text-slate-600 dark:text-slate-300">
              {recipients.map((recipient) => (
                <li key={recipient.id} className="rounded-md bg-slate-50 p-2 dark:bg-slate-800">
                  {recipient.name} | Capacity {recipient.capacity} | Crisis Priority
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 md:col-span-2 dark:border-slate-700 dark:bg-slate-900">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="font-semibold text-slate-900 dark:text-slate-100">Weather and disaster signal summary</h3>
              <Button variant="outline" size="sm" onClick={() => window.location.reload()} disabled={isRefreshingSignal}>
                {isRefreshingSignal ? "Refreshing..." : "Refresh signal"}
              </Button>
            </div>
            {signal ? (
              <div className="space-y-3">
                <div className="grid gap-2 text-sm text-slate-600 dark:text-slate-300 md:grid-cols-4">
                  <p className="rounded-md bg-slate-50 p-2 dark:bg-slate-800">Risk score: {signal.riskScore}/100</p>
                  <p className="rounded-md bg-slate-50 p-2 dark:bg-slate-800">Severity: {signal.severity}</p>
                  <p className="rounded-md bg-slate-50 p-2 dark:bg-slate-800">Weather: {signal.weatherMain} | Wind {signal.windSpeed} m/s</p>
                  <p className="rounded-md bg-slate-50 p-2 dark:bg-slate-800">Rain {signal.rain1h} mm/h | Temp {signal.temperatureC} C</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Suggested Actions
                  </p>
                  <ul className="mt-2 space-y-1 text-sm text-slate-700 dark:text-slate-200">
                    {(signal.recommendedActions ?? []).slice(0, 4).map((action, index) => (
                      <li key={`action-${index}`}>- {action}</li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Live signal unavailable right now. Dashboard fallback logic is still active.
              </p>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
