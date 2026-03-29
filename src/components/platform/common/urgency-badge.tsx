interface UrgencyBadgeProps {
  urgency: "low" | "medium" | "high" | "critical";
}

const classes = {
  low: "bg-blue-100 text-blue-700",
  medium: "bg-slate-100 text-slate-700",
  high: "bg-amber-100 text-amber-700",
  critical: "bg-rose-100 text-rose-700",
};

export function UrgencyBadge({ urgency }: UrgencyBadgeProps) {
  return <span className={`rounded-full px-2 py-1 text-xs font-semibold uppercase ${classes[urgency]}`}>{urgency}</span>;
}
