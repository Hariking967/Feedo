import Link from "next/link";

export default function PostPage() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-[#f7fbf5] via-[#f4f0e7] to-[#eef3ed] text-[#1a1c1a]">
      <div className="max-w-4xl mx-auto px-4 py-12 space-y-8">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#2d5a27]">Post surplus</p>
            <h1 className="text-3xl font-extrabold text-[#1f2a1a]">List food in minutes</h1>
            <p className="text-sm text-[#565c53]">Individuals stay capped; bulk providers can request delivery for NGOs.</p>
          </div>
          <Link href="/" className="text-sm font-semibold text-[#2d5a27] underline underline-offset-4">Back home</Link>
        </div>

        <div className="rounded-3xl bg-white/85 border border-[#e5e8e1] p-6 shadow-xl space-y-4">
          <div className="flex gap-2 bg-[#f2f5f0] rounded-xl p-1">
            <button className="flex-1 py-2 rounded-lg bg-white text-[#2d5a27] font-semibold shadow-sm">Individual</button>
            <button className="flex-1 py-2 rounded-lg text-[#565c53] font-semibold hover:text-[#2d5a27]">Bulk</button>
          </div>
          <div className="grid gap-4">
            {["Food Type", "Quantity", "Expiry Time", "Pickup Window"].map((label) => (
              <div key={label} className="space-y-1">
                <label className="text-xs font-bold text-[#454745]">{label}</label>
                <input
                  className="w-full rounded-xl border border-[#d7dcd4] bg-[#f7f9f6] px-4 py-3 text-sm focus:border-[#2d5a27] focus:outline-none focus:ring-2 focus:ring-[#b2e3a6]"
                  placeholder={label === "Food Type" ? "e.g., Veg Biryani" : label === "Quantity" ? "e.g., 5 plates" : label === "Expiry Time" ? "e.g., 2 hours" : "e.g., 6 PM - 8 PM"}
                />
              </div>
            ))}
          </div>
          <div className="flex items-start gap-3 rounded-2xl bg-[#ffe7a6] p-4">
            <div className="h-10 w-10 rounded-full bg-[#f57c00] text-white flex items-center justify-center font-bold">!</div>
            <div>
              <p className="font-semibold text-[#5e2c00]">Price cap warning</p>
              <p className="text-sm text-[#4a3a16]">Max 50% of market value. Short expiry required to keep it genuine.</p>
            </div>
          </div>
          <button className="w-full rounded-xl bg-gradient-to-br from-[#2d5a27] to-[#254a21] text-white py-4 font-semibold shadow-lg shadow-[#2d5a27]/15">Post listing</button>
        </div>
      </div>
    </main>
  );
}
