"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { activeRoute, crisisZones, donations, recipients, volunteers } from "@/lib/platform/mock-data";
import { PublicNavbar } from "@/components/platform/layout/public-navbar";
import { RouteSummaryCard } from "@/components/platform/dashboard/route-summary-card";

const MapPanel = dynamic(
  () => import("@/components/platform/map/map-panel").then((module) => module.MapPanel),
  { ssr: false },
);

const filters = ["donors", "recipients", "volunteers", "urgent", "crisis", "assigned", "delivered"];

export default function SharedMapPage() {
  const [activeFilter, setActiveFilter] = useState("donors");

  return (
    <main className="min-h-screen bg-slate-50">
      <PublicNavbar />
      <section className="mx-auto max-w-7xl space-y-4 px-4 py-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Live Map</h1>
        </div>

        <div className="flex flex-wrap gap-2">
          {filters.map((filter) => (
            <button
              key={filter}
              onClick={() => setActiveFilter(filter)}
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${activeFilter === filter ? "border-emerald-500 bg-emerald-100 text-emerald-700" : "border-slate-300 bg-white text-slate-700"}`}
            >
              {filter}
            </button>
          ))}
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.7fr_1fr]">
          <MapPanel donations={donations} recipients={recipients} volunteers={volunteers} route={activeRoute} crisisZones={crisisZones} heightClassName="h-[580px]" />
          <RouteSummaryCard route={activeRoute} />
        </div>
      </section>
    </main>
  );
}
