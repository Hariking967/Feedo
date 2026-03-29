import { Loader2 } from "lucide-react";

export default function GlobalLoading() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_5%_5%,#dcfce7_0%,#f8fafc_42%,#e0f2fe_100%)] text-slate-900">
      <section className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center px-4 py-10 text-center">
        <Loader2 className="size-10 animate-spin text-emerald-700" />
        <p className="mt-4 text-lg font-semibold text-slate-900">Loading Feedo...</p>
        <p className="mt-1 text-sm text-slate-600">Preparing your next screen.</p>
      </section>
    </main>
  );
}
