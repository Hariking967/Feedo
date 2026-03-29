import { Card, CardContent } from "@/components/ui/card";

interface EmptyStateProps {
  title: string;
  message: string;
}

export function EmptyState({ title, message }: EmptyStateProps) {
  return (
    <Card className="border-dashed border-slate-300 bg-white">
      <CardContent className="py-8 text-center">
        <p className="text-base font-semibold text-slate-800">{title}</p>
        <p className="mt-2 text-sm text-slate-600">{message}</p>
      </CardContent>
    </Card>
  );
}
