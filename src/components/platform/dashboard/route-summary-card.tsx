import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { RouteModel } from "@/lib/platform/types";

export function RouteSummaryCard({ route }: { route: RouteModel }) {
  return (
    <Card className="border-slate-200 bg-white">
      <CardHeader>
        <CardTitle className="text-base">Route Summary</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm text-slate-700">
        <p>Distance: <span className="font-semibold">{route.distance} km</span></p>
        <p>Duration: <span className="font-semibold">{route.duration} min</span></p>
        <div className="rounded-md bg-slate-50 p-2">
          {route.steps.map((step) => (
            <p key={step.label} className="text-xs text-slate-600">• {step.label} ({step.etaMinutes} min)</p>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
