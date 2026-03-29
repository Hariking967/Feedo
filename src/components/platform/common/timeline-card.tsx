import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export interface TimelineItem {
  id: string;
  title: string;
  time: string;
  tone?: "neutral" | "success" | "warning" | "critical";
}

const toneDot = {
  neutral: "bg-slate-400",
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  critical: "bg-rose-500",
};

export function TimelineCard({ title, items }: { title: string; items: TimelineItem[] }) {
  return (
    <Card className="border-slate-200 bg-white">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.map((item) => (
          <div key={item.id} className="flex items-start gap-3">
            <span className={`mt-1 h-2.5 w-2.5 rounded-full ${toneDot[item.tone ?? "neutral"]}`} />
            <div>
              <p className="text-sm font-medium text-slate-800">{item.title}</p>
              <p className="text-xs text-slate-500">{item.time}</p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
