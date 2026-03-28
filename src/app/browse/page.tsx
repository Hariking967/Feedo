import Link from "next/link";

export default function BrowsePage() {
  const cards = [
    {
      title: "Artisan bread batch",
      badge: "Individual",
      meta: "0.4 km • 40m left",
    },
    { title: "Catered rice & curry", badge: "Bulk", meta: "3.2 km • 2h left" },
    { title: "Wraps + salad", badge: "Individual", meta: "1.1 km • 55m left" },
  ];

  return (
    <main className="min-h-screen bg-gradient-to-br from-[#f7fbf5] via-[#f4f0e7] to-[#eef3ed] text-[#1a1c1a]">
      <div className="max-w-6xl mx-auto px-4 py-12 space-y-8">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#2d5a27]">
              Browse surplus
            </p>
            <h1 className="text-3xl font-extrabold text-[#1f2a1a]">
              Nearby rescues
            </h1>
            <p className="text-sm text-[#565c53]">
              Real-time surplus from individuals and bulk providers.
            </p>
          </div>
          <Link
            href="/"
            className="text-sm font-semibold text-[#2d5a27] underline underline-offset-4"
          >
            Back home
          </Link>
        </div>

        <div className="flex flex-wrap gap-3">
          {[
            { label: "Nearby", active: true },
            { label: "Individual" },
            { label: "Bulk" },
            { label: "Filter" },
          ].map((chip) => (
            <button
              key={chip.label}
              className={`px-4 py-2 rounded-full text-sm font-semibold border ${
                chip.active
                  ? "bg-[#2d5a27] text-white border-[#2d5a27]"
                  : "bg-white/80 text-[#23311f] border-[#d7dcd4] hover:bg-[#f2f5f0]"
              }`}
            >
              {chip.label}
            </button>
          ))}
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {cards.map((card) => (
            <article
              key={card.title}
              className="rounded-2xl bg-white/85 border border-[#e5e8e1] p-5 shadow-sm"
            >
              <div className="flex items-center justify-between mb-3">
                <span
                  className={`rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] ${
                    card.badge === "Bulk"
                      ? "bg-[#fff3e4] text-[#a04900]"
                      : "bg-[#e6f2e3] text-[#2d5a27]"
                  }`}
                >
                  {card.badge}
                </span>
                <span className="text-sm font-semibold text-[#454745]">
                  ★ 4.8
                </span>
              </div>
              <h3 className="text-xl font-bold text-[#23311f] mb-1">
                {card.title}
              </h3>
              <p className="text-sm text-[#565c53] mb-3">{card.meta}</p>
              <button className="w-full rounded-xl bg-[#2d5a27] text-white py-3 font-semibold hover:bg-[#254a21]">
                Reserve
              </button>
            </article>
          ))}
        </div>
      </div>
    </main>
  );
}
