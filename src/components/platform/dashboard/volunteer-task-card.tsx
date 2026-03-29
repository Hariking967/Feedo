import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface VolunteerTaskCardProps {
  donor: string;
  recipient: string;
  pickup: string;
  drop: string;
  distance: number;
  eta: number;
  urgency: string;
  quantity: string;
}

export function VolunteerTaskCard(props: VolunteerTaskCardProps) {
  return (
    <Card className="border-slate-200 bg-white">
      <CardContent className="pt-5">
        <p className="text-sm font-semibold text-slate-900">{props.donor} → {props.recipient}</p>
        <p className="text-sm text-slate-600">{props.quantity} • {props.distance} km • {props.eta} min</p>
        <p className="mt-1 text-xs text-slate-500">Pickup: {props.pickup}</p>
        <p className="text-xs text-slate-500">Drop: {props.drop}</p>
        <p className="mt-2 inline-flex rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-700">{props.urgency}</p>
        <div className="mt-3 flex gap-2">
          <Button size="sm">Accept</Button>
          <Button size="sm" variant="outline">Decline</Button>
        </div>
      </CardContent>
    </Card>
  );
}
