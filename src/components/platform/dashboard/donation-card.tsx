import { Card, CardContent } from "@/components/ui/card";
import Link from "next/link";
import { StatusBadge } from "@/components/platform/common/status-badge";
import { UrgencyBadge } from "@/components/platform/common/urgency-badge";
import { ScoreRing } from "@/components/platform/common/score-ring";
import type { Donation } from "@/lib/platform/types";

export function DonationCard({ donation }: { donation: Donation }) {
  return (
    <Card className="border-slate-200 bg-white">
      <CardContent className="pt-5">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-base font-semibold text-slate-900">{donation.title}</p>
            <p className="text-sm text-slate-600">{donation.quantity} • {donation.estimatedMeals} meals</p>
          </div>
          <UrgencyBadge urgency={donation.urgency} />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <ScoreRing
            score={donation.readinessScore}
            size={58}
            strokeWidth={7}
            label="Food score"
            tone={donation.readinessScore >= 75 ? "success" : donation.readinessScore >= 45 ? "warning" : "critical"}
          />
          <StatusBadge status={donation.safetyStatus} />
          <span className="rounded-full bg-blue-100 px-2 py-1 text-xs font-semibold text-blue-700">{donation.status}</span>
          <span className="rounded-full bg-indigo-100 px-2 py-1 text-xs font-semibold text-indigo-700">Donor reliability {donation.donor.reliabilityScore}%</span>
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          {donation.nutritionTags.map((tag) => (
            <span key={tag} className="rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-700">
              {tag}
            </span>
          ))}
        </div>
        <p className="mt-3 text-xs text-slate-500">Pickup by {new Date(donation.expiresAt).toLocaleTimeString()}</p>
        <Link href={`/donations/${donation.id}`} className="mt-2 inline-flex text-xs font-semibold text-emerald-700 hover:underline">
          View donation detail
        </Link>
      </CardContent>
    </Card>
  );
}
