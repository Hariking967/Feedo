import Link from "next/link";

export default function OrdersPage() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-[#f7fbf5] via-[#f4f0e7] to-[#eef3ed] text-[#1a1c1a]">
      <div className="max-w-5xl mx-auto px-4 py-12 space-y-8">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#2d5a27]">
              Orders & tracking
            </p>
            <h1 className="text-3xl font-extrabold text-[#1f2a1a]">
              Follow your rescues
            </h1>
            <p className="text-sm text-[#565c53]">
              Pickup and delivery states, ETA, and drop-off details.
            </p>
          </div>
          <Link
            href="/"
            className="text-sm font-semibold text-[#2d5a27] underline underline-offset-4"
          >
            Back home
          </Link>
        </div>

        <div className="rounded-3xl bg-white/85 border border-[#e5e8e1] p-6 shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#2d5a27]">
                In transit
              </p>
              <p className="text-xl font-bold text-[#1f2a1a]">
                Order #1234 • Saffron Restaurant → Helping Hands NGO
              </p>
              <p className="text-sm text-[#565c53]">
                ETA 12 mins • Route optimized for freshness.
              </p>
            </div>
            <span className="rounded-full bg-[#ffe7a6] text-[#5e2c00] px-3 py-1 text-xs font-bold uppercase tracking-[0.12em]">
              Live
            </span>
          </div>
          <div className="grid gap-3 md:grid-cols-3 text-sm">
            <div className="rounded-2xl bg-[#f2f5f0] p-4">
              <p className="font-semibold text-[#2d5a27]">Pickup</p>
              <p className="text-[#454745]">Saffron Restaurant</p>
              <p className="text-[#7b7f78]">42 Culinary Street</p>
            </div>
            <div className="rounded-2xl bg-[#f2f5f0] p-4">
              <p className="font-semibold text-[#2d5a27]">Drop-off</p>
              <p className="text-[#454745]">Helping Hands NGO</p>
              <p className="text-[#7b7f78]">102 Community Hub</p>
            </div>
            <div className="rounded-2xl bg-[#f2f5f0] p-4">
              <p className="font-semibold text-[#2d5a27]">Status</p>
              <p className="text-[#454745]">Courier en route</p>
              <p className="text-[#7b7f78]">Last ping 2 mins ago</p>
            </div>
          </div>
          <button className="w-full rounded-xl bg-gradient-to-br from-[#2d5a27] to-[#254a21] text-white py-4 font-semibold shadow-lg shadow-[#2d5a27]/15">
            Track delivery
          </button>
        </div>
      </div>
    </main>
  );
}
