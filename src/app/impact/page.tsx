import Link from "next/link";

export default function ImpactPage() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-[#f7fbf5] via-[#f4f0e7] to-[#eef3ed] text-[#1a1c1a]">
      <div className="max-w-5xl mx-auto px-4 py-12 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#2d5a27]">
              Impact Dashboard
            </p>
            <h1 className="text-3xl font-extrabold text-[#1f2a1a]">
              Your rescue footprint
            </h1>
            <p className="text-sm text-[#565c53]">
              Track saved food, emissions avoided, and community reach.
            </p>
          </div>
          <Link
            href="/"
            className="text-sm font-semibold text-[#2d5a27] underline underline-offset-4"
          >
            Back home
          </Link>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {["Food saved", "Families impacted", "CO₂ offset"].map(
            (label, idx) => (
              <div
                key={label}
                className="rounded-2xl bg-white/85 backdrop-blur border border-[#e5e8e1] p-5 shadow-sm"
              >
                <p className="text-xs uppercase tracking-[0.14em] text-[#565c53]">
                  {label}
                </p>
                <p className="text-3xl font-bold text-[#2d5a27] mt-1">
                  {idx === 0 ? "42kg" : idx === 1 ? "28" : "156 kg"}
                </p>
                <p className="text-sm text-[#7b7f78]">
                  Live metrics refreshed in real time.
                </p>
              </div>
            ),
          )}
        </div>
        <div className="rounded-3xl bg-white/85 backdrop-blur border border-[#e5e8e1] p-6 shadow-sm">
          <h2 className="text-xl font-bold text-[#1f2a1a] mb-2">Coming soon</h2>
          <p className="text-sm text-[#565c53]">
            Interactive charts, leaderboards, and milestone tracking will land
            here.
          </p>
        </div>
      </div>
    </main>
  );
}
