"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { fetchDonations } from "@/lib/platform/service";
import type { Donation } from "@/lib/platform/types";
import { PublicNavbar } from "@/components/platform/layout/public-navbar";
import { StatusBadge } from "@/components/platform/common/status-badge";
import { UrgencyBadge } from "@/components/platform/common/urgency-badge";
import { TimelineCard } from "@/components/platform/common/timeline-card";
import { LoadingState } from "@/components/platform/common/loading-state";
import { ErrorState } from "@/components/platform/common/error-state";
import { EmptyState } from "@/components/platform/common/empty-state";

export default function DonationDetailPage() {
  const params = useParams<{ id: string }>();
  const donationId = params?.id;
  const [donations, setDonations] = useState<Donation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const data = await fetchDonations();
        if (!mounted) return;
        setDonations(data);
      } catch {
        if (!mounted) return;
        setError("Could not load donation detail.");
      } finally {
        if (mounted) setLoading(false);
      }
    };

    void load();
    return () => {
      mounted = false;
    };
  }, []);

  const donation = useMemo(() => donations.find((item) => item.id === donationId), [donations, donationId]);

  return (
    <main className="min-h-screen bg-slate-50">
      <PublicNavbar />
      <section className="mx-auto max-w-5xl space-y-4 px-4 py-8">
        <Link href="/dashboard/donor" className="text-sm font-semibold text-emerald-700 hover:underline">Back to dashboard</Link>

        {loading ? <LoadingState message="Loading donation detail..." /> : null}
        {error ? <ErrorState title="Load failed" message={error} /> : null}
        {!loading && !error && !donation ? <EmptyState title="Donation not found" message="This donation may have been removed." /> : null}

        {donation ? (
          <>
            <article className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h1 className="text-2xl font-bold text-slate-900">{donation.title}</h1>
                <div className="flex items-center gap-2">
                  <StatusBadge status={donation.safetyStatus} />
                  <UrgencyBadge urgency={donation.urgency} />
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-700">Posted time: <span className="font-semibold">{new Date(donation.createdAt).toLocaleString()}</span></p>
                <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-700">Expiry time: <span className="font-semibold">{new Date(donation.expiresAt).toLocaleString()}</span></p>
                <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-700">Safety classification: <span className="font-semibold">{donation.safetyStatus}</span></p>
                <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-700">Readiness score: <span className="font-semibold">{donation.readinessScore}/100</span></p>
                <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-700">Assigned volunteer: <span className="font-semibold">{donation.assignedVolunteer ?? "Pending"}</span></p>
                <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-700">Assigned recipient: <span className="font-semibold">{donation.assignedRecipient ?? "Pending"}</span></p>
              </div>

              <div className="mt-4 grid gap-2 md:grid-cols-2">
                <div className="rounded-md border border-slate-200 p-3">
                  <p className="text-sm font-semibold text-slate-900">Nutrition tags</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {donation.nutritionTags.map((tag) => (
                      <span key={tag} className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">{tag}</span>
                    ))}
                  </div>
                </div>
                <div className="rounded-md border border-slate-200 p-3">
                  <p className="text-sm font-semibold text-slate-900">Allergens</p>
                  <p className="mt-2 text-sm text-slate-600">{donation.allergens.length ? donation.allergens.join(", ") : "None listed"}</p>
                </div>
              </div>
            </article>

            <div className="grid gap-4 md:grid-cols-2">
              <TimelineCard
                title="Assignment history"
                items={[
                  { id: "t1", title: "Donation posted", time: new Date(donation.createdAt).toLocaleTimeString(), tone: "success" },
                  { id: "t2", title: "Match generated", time: "+6 min", tone: "neutral" },
                  { id: "t3", title: "Volunteer assignment", time: "+10 min", tone: "warning" },
                  { id: "t4", title: donation.status === "delivered" ? "Delivered" : "In progress", time: "latest", tone: donation.status === "delivered" ? "success" : "neutral" },
                ]}
              />

              <article className="rounded-xl border border-slate-200 bg-white p-4">
                <h2 className="text-base font-semibold text-slate-900">Proof and completion</h2>
                <p className="mt-2 text-sm text-slate-600">Proof photos and delivery confirmation events are attached in this panel when uploaded by volunteers.</p>
                <div className="mt-3 rounded-md bg-slate-50 p-3 text-sm text-slate-600">Final status: <span className="font-semibold">{donation.status}</span></div>
              </article>
            </div>
          </>
        ) : null}
      </section>
    </main>
  );
}
