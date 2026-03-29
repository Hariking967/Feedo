import { Card, CardContent } from "@/components/ui/card";

interface MatchCardProps {
  donorName: string;
  recipientName: string;
  distanceKm: number;
  etaMinutes: number;
  compatibility: string;
}

export function MatchCard({ donorName, recipientName, distanceKm, etaMinutes, compatibility }: MatchCardProps) {
  return (
    <Card className="border-slate-200 bg-white">
      <CardContent className="pt-5 space-y-2">
        <p className="text-sm font-semibold text-slate-900">{donorName} → {recipientName}</p>
        <p className="text-sm text-slate-600">Distance {distanceKm} km • ETA {etaMinutes} min</p>
        <p className="rounded-md bg-emerald-50 p-2 text-xs text-emerald-700">{compatibility}</p>
      </CardContent>
    </Card>
  );
}
