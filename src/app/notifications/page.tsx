"use client";

import { useMemo, useState } from "react";
import { notifications } from "@/lib/platform/mock-data";
import { NotificationItem } from "@/components/platform/common/notification-item";
import { PublicNavbar } from "@/components/platform/layout/public-navbar";

export default function NotificationsPage() {
  const [activeType, setActiveType] = useState<"all" | "assignment" | "match" | "urgent" | "crisis" | "delivery">("all");

  const filtered = useMemo(
    () => notifications.filter((item) => activeType === "all" || item.type === activeType),
    [activeType],
  );

  return (
    <main className="min-h-screen bg-slate-50">
      <PublicNavbar />
      <section className="mx-auto max-w-4xl px-4 py-8">
        <h1 className="text-2xl font-bold text-slate-900">Notifications</h1>
        <p className="text-sm text-slate-600">Assignments, matches, urgent alerts, crisis signals, and delivery confirmations.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {["all", "assignment", "match", "urgent", "crisis", "delivery"].map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setActiveType(type as typeof activeType)}
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                activeType === type ? "border-emerald-600 bg-emerald-100 text-emerald-700" : "border-slate-300 bg-white text-slate-700"
              }`}
            >
              {type}
            </button>
          ))}
        </div>
        <div className="mt-4 space-y-3">
          {filtered.map((item) => (
            <NotificationItem key={item.id} item={item} />
          ))}
        </div>
      </section>
    </main>
  );
}
