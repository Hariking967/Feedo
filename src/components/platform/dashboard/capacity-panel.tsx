import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

interface CapacityPanelProps {
  capacity: number;
  acceptsCooked: boolean;
  acceptsPackaged: boolean;
  refrigeration: boolean;
  open: boolean;
  nutritionPreferences?: string[];
  crisisPriority?: boolean;
}

export function CapacityPanel({
  capacity,
  acceptsCooked,
  acceptsPackaged,
  refrigeration,
  open,
  nutritionPreferences = [],
  crisisPriority = false,
}: CapacityPanelProps) {
  return (
    <Card className="border-slate-200 bg-white">
      <CardHeader>
        <CardTitle className="text-base">Capacity and Preferences</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-slate-700">
        <p>Max meals now: <span className="font-semibold">{capacity}</span></p>
        <div className="flex items-center justify-between"><Label>Accept cooked food</Label><Switch checked={acceptsCooked} /></div>
        <div className="flex items-center justify-between"><Label>Accept packaged food</Label><Switch checked={acceptsPackaged} /></div>
        <div className="flex items-center justify-between"><Label>Refrigeration available</Label><Switch checked={refrigeration} /></div>
        <div className="flex items-center justify-between"><Label>Open status</Label><Switch checked={open} /></div>
        <div className="flex items-center justify-between"><Label>Crisis priority</Label><Switch checked={crisisPriority} /></div>
        {nutritionPreferences.length ? (
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Nutrition preferences</p>
            <div className="flex flex-wrap gap-1">
              {nutritionPreferences.map((tag) => (
                <span key={tag} className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
                  {tag}
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
