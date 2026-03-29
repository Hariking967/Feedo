import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface ErrorStateProps {
  title: string;
  message: string;
  onRetry?: () => void;
}

export function ErrorState({ title, message, onRetry }: ErrorStateProps) {
  return (
    <Card className="border-rose-200 bg-rose-50">
      <CardContent className="py-6">
        <p className="font-semibold text-rose-700">{title}</p>
        <p className="mt-1 text-sm text-rose-600">{message}</p>
        {onRetry ? (
          <Button variant="outline" className="mt-3" onClick={onRetry}>
            Retry
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
