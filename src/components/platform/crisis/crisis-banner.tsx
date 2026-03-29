interface CrisisBannerProps {
  active: boolean;
  message: string;
}

export function CrisisBanner({ active, message }: CrisisBannerProps) {
  if (!active) return null;

  return (
    <div className="rounded-xl border border-rose-300 bg-gradient-to-r from-rose-50 to-amber-50 px-4 py-3 dark:border-rose-900/40 dark:from-rose-950/40 dark:to-amber-950/30">
      <p className="text-sm font-semibold text-rose-700 dark:text-rose-300">Crisis Mode Active</p>
      <p className="text-sm text-rose-600 dark:text-rose-200">{message}</p>
    </div>
  );
}
