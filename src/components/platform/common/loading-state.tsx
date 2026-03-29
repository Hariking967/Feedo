import { Card, CardContent } from "@/components/ui/card";

export function LoadingState({ message = "Loading operational data..." }: { message?: string }) {
  return (
    <Card className="border-slate-200 bg-white">
      <CardContent className="py-8">
        <div className="animate-pulse space-y-3">
          <div className="h-4 w-40 rounded bg-slate-200" />
          <div className="h-4 w-64 rounded bg-slate-100" />
          <p className="text-sm text-slate-500">{message}</p>
        </div>
      </CardContent>
    </Card>
  );
}
