import { Card, CardContent } from "@/components/ui/card";

interface StatCardProps {
  label: string;
  value: string | number;
  subtext?: string;
  tone?: "neutral" | "success" | "warning" | "critical";
}

const toneMap = {
  neutral: "border-slate-200 bg-white",
  success: "border-emerald-200 bg-emerald-50",
  warning: "border-amber-200 bg-amber-50",
  critical: "border-rose-200 bg-rose-50",
};

export function StatCard({ label, value, subtext, tone = "neutral" }: StatCardProps) {
  return (
    <Card className={`${toneMap[tone]} min-h-36`}>
      <CardContent className="pt-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
        <p className="mt-2 min-h-9 text-3xl font-bold tabular-nums text-slate-900">{value}</p>
        {subtext ? <p className="mt-1 min-h-5 text-sm text-slate-600">{subtext}</p> : null}
      </CardContent>
    </Card>
  );
}
