"use client";

import React from "react";
import { authClient } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Bell,
  Clock,
  MapPin,
  ShieldCheck,
  Sparkles,
  Star,
  Truck,
  Users,
} from "lucide-react";

type Listing = {
  title: string;
  provider: string;
  providerType: "individual" | "bulk";
  quantity: string;
  distance: string;
  expiry: string;
  price: string;
  rating: number;
  tags: string[];
};

const palette = {
  primary: "#2d5a27",
  secondary: "#f57c00",
  tertiary: "#ffb300",
  neutral: "#454745",
};

const liveListings: Listing[] = [
  {
    title: "Veg Biryani & Raita",
    provider: "Home Cook | Lajpat",
    providerType: "individual",
    quantity: "6 plates",
    distance: "0.8 km",
    expiry: "1h left",
    price: "Free pickup",
    rating: 4.7,
    tags: ["Veg", "Spice mild"],
  },
  {
    title: "Catered Rice & Curry",
    provider: "Event Kitchen | Okhla",
    providerType: "bulk",
    quantity: "40 portions",
    distance: "3.2 km",
    expiry: "2.5h left",
    price: "₹45/plate (<=50%)",
    rating: 4.8,
    tags: ["Bulk", "NGO friendly"],
  },
  {
    title: "Mixed Wraps + Salad",
    provider: "Cafe Nova | Hauz Khas",
    providerType: "individual",
    quantity: "10 wraps",
    distance: "1.6 km",
    expiry: "50m left",
    price: "Free pickup",
    rating: 4.6,
    tags: ["Veg", "Egg-free"],
  },
];

const safeguards = [
  {
    title: "50% price cap",
    desc: "No listing can exceed half the market value—keeps the focus on rescue, not profit.",
    icon: <ShieldCheck className="h-5 w-5" />,
  },
  {
    title: "Short expiry only",
    desc: "Every post needs a tight pickup window; no pre-booked meals or future-dated drops.",
    icon: <Clock className="h-5 w-5" />,
  },
  {
    title: "Pattern flags",
    desc: "We flag repeated identical posts from individuals and throttle if it looks suspicious.",
    icon: <Sparkles className="h-5 w-5" />,
  },
  {
    title: "Ratings & proofs",
    desc: "Providers hold responsibility. Community ratings and quick reports keep quality high.",
    icon: <Star className="h-5 w-5" />,
  },
];

const steps = [
  {
    title: "Post surplus",
    copy: "Add food type, quantity, expiry, and pickup window. Individuals have strict limits.",
  },
  {
    title: "Alert nearby",
    copy: "Instant pings to people and NGOs within range—priority to quicker expiry first.",
  },
  {
    title: "Reserve & pickup",
    copy: "Self-pickup stays free; bulk can request delivery for NGO or group drops.",
  },
];

export default function HomeView() {
  const router = useRouter();
  const { data } = authClient.useSession();

  const handleLogout = () => {
    authClient.signOut({
      fetchOptions: {
        onSuccess: () => router.push("/auth/sign-in"),
      },
    });
  };

  const initials = data?.user?.name
    ?.split(" ")
    .map((chunk) => chunk[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div
      className="min-h-screen bg-gradient-to-br from-[#f7fbf5] via-[#f7f5ef] to-[#eff4ee] text-[#1a1c1a]"
      style={{ color: palette.neutral }}
    >
      <div className="relative isolate max-w-6xl px-4 py-10 mx-auto space-y-10">
        <div className="absolute inset-x-10 -top-10 h-40 bg-gradient-to-r from-[#2d5a27]/15 via-[#f57c00]/10 to-[#ffb300]/10 blur-3xl" />

        <header className="flex items-center justify-between gap-4 rounded-2xl bg-white/70 p-4 backdrop-blur shadow-lg border border-white/50">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-full bg-[#2d5a27] text-white flex items-center justify-center font-bold">
              {initials || "FD"}
            </div>
            <div>
              <p className="text-xs font-semibold tracking-[0.08em] text-[#2d5a27] uppercase">
                Smart Food Rescue
              </p>
              <p className="text-xl font-semibold text-[#0f1a11]">
                Feedo Network
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              className="bg-white text-[#2d5a27] border-[#cdd7c8] hover:bg-[#f0f6ed]"
            >
              <Bell className="mr-2 h-4 w-4" />
              Alerts
            </Button>
            <Button
              className="bg-[#2d5a27] hover:bg-[#254a21] text-white"
              onClick={handleLogout}
            >
              Logout
            </Button>
          </div>
        </header>

        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#2d5a27] via-[#2f6028] to-[#f57c00] p-8 text-white shadow-2xl">
          <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/asfalt-dark.png')] opacity-15" />
          <div className="relative grid items-center gap-10 md:grid-cols-2">
            <div className="space-y-5">
              <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-[#e9f6e4]">
                Live surplus • Trust-first
              </span>
              <h1 className="text-4xl md:text-5xl font-extrabold leading-tight">
                Rescue real surplus food
                <span className="block italic text-[#ffe6b0]">
                  before it becomes waste.
                </span>
              </h1>
              <p className="text-lg text-white/85 max-w-xl">
                Nearby people and NGOs get instant alerts when kitchens post
                genuine surplus. Individuals stay capped, bulk kitchens move
                larger drops with delivery options.
              </p>
              <div className="flex flex-wrap gap-3">
                <Button className="bg-white text-[#2d5a27] hover:bg-[#f1f7ee]">
                  Post surplus now
                </Button>
                <Button
                  variant="outline"
                  className="border-white/50 text-white hover:bg-white/10"
                >
                  Browse nearby
                </Button>
                <Button
                  variant="outline"
                  className="border-white/50 text-white hover:bg-white/10"
                >
                  NGO pickup request
                </Button>
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
                <div>
                  <p className="text-white/70 text-xs">This month</p>
                  <p className="text-2xl font-bold">42kg</p>
                  <p className="text-white/70">food rescued</p>
                </div>
                <div>
                  <p className="text-white/70 text-xs">Impact</p>
                  <p className="text-2xl font-bold">28</p>
                  <p className="text-white/70">families served</p>
                </div>
                <div>
                  <p className="text-white/70 text-xs">Trust</p>
                  <p className="text-2xl font-bold flex items-center gap-1">
                    4.8 <Star className="h-4 w-4 fill-white text-white" />
                  </p>
                  <p className="text-white/70">avg rating</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-6 rounded-3xl bg-white/80 p-6 shadow-xl backdrop-blur">
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#2d5a27]">
                Live surplus near you
              </p>
              <h2 className="text-3xl font-bold text-[#23311f]">
                Browse & reserve
              </h2>
              <p className="text-sm text-[#565c53]">
                Instant alerts, genuine surplus, no pre-booking.
              </p>
            </div>
            <div className="flex gap-2">
              <Button className="bg-[#2d5a27] text-white hover:bg-[#244621]">
                Nearby
              </Button>
              <Button
                variant="outline"
                className="border-[#d7dcd4] text-[#23311f]"
              >
                Individual
              </Button>
              <Button
                variant="outline"
                className="border-[#d7dcd4] text-[#23311f]"
              >
                Bulk
              </Button>
            </div>
          </div>

          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {liveListings.map((listing) => (
              <article
                key={listing.title}
                className="group relative overflow-hidden rounded-2xl border border-[#e5e8e1] bg-white p-4 shadow-sm transition hover:-translate-y-1 hover:shadow-xl"
              >
                <div className="flex items-center justify-between mb-3">
                  <span
                    className="rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em]"
                    style={{
                      backgroundColor:
                        listing.providerType === "bulk" ? "#fff3e4" : "#e6f2e3",
                      color:
                        listing.providerType === "bulk" ? "#a04900" : "#2d5a27",
                    }}
                  >
                    {listing.providerType === "bulk"
                      ? "Bulk provider"
                      : "Individual"}
                  </span>
                  <span className="flex items-center gap-1 text-sm font-semibold text-[#454745]">
                    <Star className="h-4 w-4 fill-[#ffb300] text-[#ffb300]" />{" "}
                    {listing.rating.toFixed(1)}
                  </span>
                </div>
                <h3 className="text-xl font-bold text-[#23311f] leading-tight mb-1">
                  {listing.title}
                </h3>
                <p className="text-sm text-[#565c53] mb-4">
                  {listing.provider}
                </p>
                <div className="flex flex-wrap gap-2 mb-4">
                  {listing.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-[#f2f5f0] px-3 py-1 text-xs font-semibold text-[#2d5a27]"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
                <div className="flex items-center justify-between text-sm font-semibold text-[#23311f] mb-3">
                  <span className="flex items-center gap-1">
                    <Clock className="h-4 w-4 text-[#f57c00]" />{" "}
                    {listing.expiry}
                  </span>
                  <span className="flex items-center gap-1">
                    <MapPin className="h-4 w-4 text-[#2d5a27]" />{" "}
                    {listing.distance}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm text-[#565c53]">
                  <span className="flex items-center gap-1">
                    <Users className="h-4 w-4 text-[#2d5a27]" />{" "}
                    {listing.quantity}
                  </span>
                  <span className="text-[#2d5a27] font-bold">
                    {listing.price}
                  </span>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-3">
          <div className="col-span-2 rounded-3xl bg-white/80 p-6 shadow-xl backdrop-blur">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#2d5a27]">
              Safety net
            </p>
            <h3 className="text-3xl font-bold text-[#23311f] mb-6">
              Trust & quality guardrails
            </h3>
            <div className="grid gap-4 md:grid-cols-2">
              {safeguards.map((item) => (
                <div
                  key={item.title}
                  className="rounded-2xl border border-[#e5e8e1] bg-white p-4 shadow-sm"
                >
                  <div className="mb-2 flex items-center gap-2 text-[#2d5a27]">
                    {item.icon}
                    <span className="font-semibold">{item.title}</span>
                  </div>
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
            <h3 className="text-2xl font-bold mb-4">Rescue flow</h3>
            <div className="space-y-4">
              {steps.map((step, idx) => (
                <div
                  key={step.title}
                  className="rounded-2xl bg-white/70 p-3 shadow-sm"
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
            <div className="mt-5 rounded-2xl bg-white/80 p-4 text-[#1f2a1a] shadow-sm">
              <div className="flex items-center gap-2 font-semibold">
                <Truck className="h-5 w-5 text-[#5e2c00]" /> Delivery for bulk &
                NGOs
              </div>
              <p className="text-sm text-[#4a3a16] mt-2">
                Bulk kitchens can opt for partnered delivery for large drops.
                Individuals remain pickup-only to keep things local and fast.
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
