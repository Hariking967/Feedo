import Link from "next/link";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

const stats = [
  { label: "Food rescued", value: "42kg", sub: "This month" },
  { label: "Families served", value: "28", sub: "Local impact" },
  { label: "Avg rating", value: "4.8★", sub: "Provider trust" },
];

const guardrails = [
  {
    title: "50% price cap",
    desc: "Stops profiteering; keeps listings genuine and affordable.",
  },
  {
    title: "Short expiry only",
    desc: "No future bookings. Everything is real surplus ready to move now.",
  },
  {
    title: "Pattern detection",
    desc: "Flags repeated identical posts from individuals and throttles spam.",
  },
];

const flows = [
  {
    title: "Post surplus",
    copy: "Add type, quantity, expiry window. Individuals are capped; bulk can scale.",
  },
  {
    title: "Alert nearby",
    copy: "Instant notifications to consumers and NGOs within range.",
  },
  {
    title: "Reserve & pickup",
    copy: "Free self-pickup. Bulk can request delivery for NGO drops.",
  },
];

export default async function Home() {
  const session = await auth.api.getSession({ headers: await headers() });
  const isAuthed = Boolean(session);

  return (
    <main className="min-h-screen bg-gradient-to-br from-[#f7fbf5] via-[#f4f0e7] to-[#eef3ed] text-[#1a1c1a]">
      <div className="relative isolate max-w-6xl mx-auto px-4 py-12 space-y-12">
        <div className="absolute inset-x-10 -top-12 h-44 bg-gradient-to-r from-[#2d5a27]/18 via-[#f57c00]/14 to-[#ffb300]/16 blur-3xl" />

        <header className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-full bg-[#2d5a27] text-white font-bold flex items-center justify-center">
              FD
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#2d5a27]">
                Smart Food Rescue
              </p>
              <p className="text-lg font-bold text-[#1f2a1a]">Feedo Network</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isAuthed ? (
              <Link
                href="/"
                className="rounded-full border border-[#d7dcd4] bg-white px-4 py-2 text-sm font-semibold text-[#2d5a27] hover:bg-[#f1f7ee]"
              >
                Go to dashboard
              </Link>
            ) : (
              <Link
                href="/auth/sign-in"
                className="rounded-full border border-[#d7dcd4] bg-white px-4 py-2 text-sm font-semibold text-[#2d5a27] hover:bg-[#f1f7ee]"
              >
                Sign in
              </Link>
            )}
            {!isAuthed && (
              <Link
                href="/auth/sign-up"
                className="rounded-full bg-[#2d5a27] px-4 py-2 text-sm font-semibold text-white hover:bg-[#254a21]"
              >
                Create account
              </Link>
            )}
          </div>
        </header>

        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#2d5a27] via-[#2f6028] to-[#f57c00] text-white p-8 shadow-2xl">
          <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/asfalt-dark.png')] opacity-10" />
          <div className="relative grid gap-10 md:grid-cols-2 items-center">
            <div className="space-y-5">
              <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-[#e9f6e4]">
                Genuine surplus • Real-time
              </span>
              <h1 className="text-4xl md:text-5xl font-extrabold leading-tight">
                Rescue surplus before it turns into waste.
              </h1>
              <p className="text-white/85 text-lg max-w-xl">
                Providers post live surplus with strict price caps and short
                expiry windows. Consumers and NGOs get instant alerts to pick up
                or request delivery for bulk.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link
                  href={isAuthed ? "/" : "/auth/sign-up"}
                  className="rounded-xl bg-white text-[#2d5a27] px-5 py-3 font-semibold hover:bg-[#f1f7ee]"
                >
                  {isAuthed ? "Open dashboard" : "Start rescuing"}
                </Link>
                <Link
                  href="/auth/sign-in"
                  className="rounded-xl border border-white/60 text-white px-5 py-3 font-semibold hover:bg-white/10"
                >
                  Sign in
                </Link>
                <Link
                  href="/post"
                  className="rounded-xl border border-white/60 text-white px-5 py-3 font-semibold hover:bg-white/10"
                >
                  Post surplus
                </Link>
              </div>
            </div>
            <div className="grid gap-4">
              <div className="grid grid-cols-3 gap-4">
                {["Primary", "Secondary", "Tertiary"].map((tone, idx) => (
                  <div key={tone} className="rounded-2xl bg-white/10 p-3">
                    <p className="text-sm font-semibold mb-1">{tone}</p>
                    <div
                      className="h-12 rounded-xl"
                      style={{
                        background:
                          idx === 0
                            ? "linear-gradient(90deg, #0f3611 0%, #2d5a27 50%, #bdf2b3 100%)"
                            : idx === 1
                              ? "linear-gradient(90deg, #5c2c00 0%, #f57c00 50%, #ffd4a3 100%)"
                              : "linear-gradient(90deg, #4a2e00 0%, #ffb300 50%, #ffe7a6 100%)",
                      }}
                    />
                  </div>
                ))}
              </div>
              <div className="rounded-2xl bg-white/10 p-4 grid grid-cols-3 gap-3 text-sm font-semibold">
                {stats.map((stat) => (
                  <div key={stat.label}>
                    <p className="text-white/75 text-xs">{stat.sub}</p>
                    <p className="text-2xl font-bold">{stat.value}</p>
                    <p className="text-white/75">{stat.label}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-6 rounded-3xl bg-white/85 p-6 shadow-xl backdrop-blur">
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#2d5a27]">
                Browse live surplus
              </p>
              <h2 className="text-3xl font-bold text-[#23311f]">
                Keep it moving fast
              </h2>
              <p className="text-sm text-[#565c53]">
                Instant alerts, pickup-first, capped pricing.
              </p>
            </div>
            <div className="flex gap-2">
              <Link
                href="/browse"
                className="rounded-xl bg-[#2d5a27] text-white px-4 py-2 font-semibold hover:bg-[#244621]"
              >
                Browse
              </Link>
              <Link
                href="/post"
                className="rounded-xl border border-[#d7dcd4] text-[#23311f] px-4 py-2 font-semibold hover:bg-[#f2f5f0]"
              >
                Post surplus
              </Link>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {["Home cooks", "Bulk kitchens", "NGOs & groups"].map(
              (title, idx) => (
                <article
                  key={title}
                  className="rounded-2xl border border-[#e5e8e1] bg-white p-4 shadow-sm"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span
                      className="rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em]"
                      style={{
                        backgroundColor: idx === 1 ? "#fff3e4" : "#e6f2e3",
                        color: idx === 1 ? "#a04900" : "#2d5a27",
                      }}
                    >
                      {idx === 1 ? "Bulk" : "Individual"}
                    </span>
                    <span className="text-sm font-semibold text-[#454745]">
                      50% cap
                    </span>
                  </div>
                  <h3 className="text-xl font-bold text-[#23311f] mb-1">
                    {title}
                  </h3>
                  <p className="text-sm text-[#565c53]">
                    {idx === 0
                      ? "Quick pickups, tight windows, zero delivery—keeps it local and honest."
                      : idx === 1
                        ? "Move larger surplus with delivery options for NGOs and group drops."
                        : "Priority alerts for nearby bulk drops and ready-to-serve meals."}
                  </p>
                </article>
              ),
            )}
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-3">
          <div className="col-span-2 rounded-3xl bg-white/85 p-6 shadow-xl backdrop-blur">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#2d5a27]">
              Safety net
            </p>
            <h3 className="text-3xl font-bold text-[#23311f] mb-6">
              Trust & quality guardrails
            </h3>
            <div className="grid gap-4 md:grid-cols-2">
              {guardrails.map((item) => (
                <div
                  key={item.title}
                  className="rounded-2xl border border-[#e5e8e1] bg-white p-4 shadow-sm"
                >
                  <p className="font-semibold text-[#2d5a27]">{item.title}</p>
                  <p className="text-sm text-[#565c53] leading-relaxed">
                    {item.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-3xl bg-gradient-to-br from-[#f57c00] via-[#ffb300] to-[#ffe7a6] p-6 text-[#2d1700] shadow-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#5e2c00]">
              How it works
            </p>
            <h3 className="text-2xl font-bold mb-4">Three-step flow</h3>
            <div className="space-y-4">
              {flows.map((step, idx) => (
                <div
                  key={step.title}
                  className="rounded-2xl bg-white/75 p-3 shadow-sm"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#2d5a27] text-white font-bold">
                      {idx + 1}
                    </div>
                    <div>
                      <p className="font-semibold text-[#1f2a1a]">
                        {step.title}
                      </p>
                      <p className="text-sm text-[#4a3a16]">{step.copy}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="rounded-3xl bg-white/85 p-6 shadow-xl backdrop-blur flex flex-col md:flex-row items-center justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#2d5a27]">
              Ready to join?
            </p>
            <h3 className="text-2xl font-bold text-[#1f2a1a]">
              Keep surplus real, capped, and fast.
            </h3>
            <p className="text-sm text-[#565c53]">
              Sign up as a consumer by default, switch to supplier when you need
              to post.
            </p>
          </div>
          <div className="flex gap-3">
            <Link
              href="/auth/sign-up"
              className="rounded-xl bg-[#2d5a27] text-white px-5 py-3 font-semibold hover:bg-[#254a21]"
            >
              Create account
            </Link>
            <Link
              href="/auth/sign-in"
              className="rounded-xl border border-[#d7dcd4] text-[#23311f] px-5 py-3 font-semibold hover:bg-[#f2f5f0]"
            >
              Sign in
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
