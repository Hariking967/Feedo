interface StatusBadgeProps {
  status: "safe" | "pickup_soon" | "not_suitable" | "verified" | "unverified";
}

const map = {
  safe: "bg-emerald-100 text-emerald-700",
  pickup_soon: "bg-amber-100 text-amber-700",
  not_suitable: "bg-rose-100 text-rose-700",
  verified: "bg-blue-100 text-blue-700",
  unverified: "bg-slate-100 text-slate-700",
};

const label = {
  safe: "Safe",
  pickup_soon: "Pickup Soon",
  not_suitable: "Not Suitable",
  verified: "Verified",
  unverified: "Unverified",
};

export function StatusBadge({ status }: StatusBadgeProps) {
  return <span className={`rounded-full px-2 py-1 text-xs font-semibold ${map[status]}`}>{label[status]}</span>;
}
