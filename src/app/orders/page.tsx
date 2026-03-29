"use client";

import { useEffect, useMemo, useState } from "react";
import { PublicNavbar } from "@/components/platform/layout/public-navbar";
import { authClient } from "@/lib/auth-client";
import Link from "next/link";
import {
  ShoppingBag,
  MapPin,
  Clock,
  CheckCircle2,
  Package,
  TruckIcon,
  ArrowRight,
  Star,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";

/* ────────────────────────────────────────────────────────────────────── *
 * Types                                                                    *
 * ────────────────────────────────────────────────────────────────────── */
interface FeedoOrder {
  id: string;
  dish: string;
  sellerName: string;
  sellerType: "individual" | "caterer";
  unitPrice: number;
  unit: "meals" | "kg";
  quantity: number;
  totalAmount: number;
  distanceKm: number;
  deliveryAvailable: boolean;
  foodType: "veg" | "non_veg";
  status: "pending" | "confirmed" | "picked_up" | "delivered" | "cancelled";
  paidAt: string;
  pickupAddress?: string;
}

const STATUS_META: Record<
  FeedoOrder["status"],
  { label: string; icon: React.ElementType; color: string; bg: string }
> = {
  pending: {
    label: "Pending",
    icon: Clock,
    color: "text-amber-700",
    bg: "bg-amber-50 border-amber-200",
  },
  confirmed: {
    label: "Confirmed",
    icon: CheckCircle2,
    color: "text-blue-700",
    bg: "bg-blue-50 border-blue-200",
  },
  picked_up: {
    label: "Picked Up",
    icon: TruckIcon,
    color: "text-purple-700",
    bg: "bg-purple-50 border-purple-200",
  },
  delivered: {
    label: "Delivered",
    icon: CheckCircle2,
    color: "text-emerald-700",
    bg: "bg-emerald-50 border-emerald-200",
  },
  cancelled: {
    label: "Cancelled",
    icon: AlertCircle,
    color: "text-rose-700",
    bg: "bg-rose-50 border-rose-200",
  },
};

/* ────────────────────────────────────────────────────────────────────── *
 * Demo orders — replace with real API call once backend is wired         *
 * ────────────────────────────────────────────────────────────────────── */
function makeDemoOrders(): FeedoOrder[] {
  const now = Date.now();
  return [
    {
      id: "ord-001",
      dish: "Hyderabadi Biryani",
      sellerName: "Chef Ravi Catering",
      sellerType: "caterer",
      unitPrice: 85,
      unit: "meals",
      quantity: 3,
      totalAmount: 255,
      distanceKm: 1.8,
      deliveryAvailable: true,
      foodType: "non_veg",
      status: "delivered",
      paidAt: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
      pickupAddress: "Rainbow Residency, Koramangala",
    },
    {
      id: "ord-002",
      dish: "Paneer Butter Masala Combo",
      sellerName: "Home Kitchen by Sunita",
      sellerType: "individual",
      unitPrice: 65,
      unit: "meals",
      quantity: 2,
      totalAmount: 130,
      distanceKm: 2.4,
      deliveryAvailable: false,
      foodType: "veg",
      status: "picked_up",
      paidAt: new Date(now - 45 * 60 * 1000).toISOString(),
      pickupAddress: "HSR Layout, Sector 4",
    },
    {
      id: "ord-003",
      dish: "South Indian Thali",
      sellerName: "Samayal Kadai",
      sellerType: "caterer",
      unitPrice: 70,
      unit: "meals",
      quantity: 5,
      totalAmount: 350,
      distanceKm: 0.9,
      deliveryAvailable: true,
      foodType: "veg",
      status: "confirmed",
      paidAt: new Date(now - 15 * 60 * 1000).toISOString(),
      pickupAddress: "Indiranagar 100ft Road",
    },
    {
      id: "ord-004",
      dish: "Fresh Dal Khichdi",
      sellerName: "Anna Daan Trust",
      sellerType: "individual",
      unitPrice: 0,
      unit: "meals",
      quantity: 10,
      totalAmount: 0,
      distanceKm: 3.1,
      deliveryAvailable: false,
      foodType: "veg",
      status: "pending",
      paidAt: new Date(now - 5 * 60 * 1000).toISOString(),
      pickupAddress: "Jayanagar 4th Block",
    },
  ];
}

function timeAgo(iso: string) {
  const diff = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (diff < 1) return "Just now";
  if (diff < 60) return `${diff}m ago`;
  const h = Math.floor(diff / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function OrdersPage() {
  const { data: session } = authClient.useSession();
  const [orders, setOrders] = useState<FeedoOrder[]>([]);
  const [filter, setFilter] = useState<FeedoOrder["status"] | "all">("all");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Simulate a brief load then show demo data.
    // Replace this with a real fetch once the orders API is ready.
    const timer = setTimeout(() => {
      setOrders(makeDemoOrders());
      setIsLoading(false);
    }, 600);
    return () => clearTimeout(timer);
  }, []);

  const filtered = useMemo(() => {
    if (filter === "all") return orders;
    return orders.filter((o) => o.status === filter);
  }, [orders, filter]);

  const totals = useMemo(
    () => ({
      spent: orders.reduce((s, o) => s + o.totalAmount, 0),
      delivered: orders.filter((o) => o.status === "delivered").length,
      active: orders.filter(
        (o) => o.status === "pending" || o.status === "confirmed" || o.status === "picked_up"
      ).length,
    }),
    [orders]
  );

  return (
    <main className="min-h-screen bg-gradient-to-b from-emerald-50 via-slate-50 to-white">
      <PublicNavbar />

      <section className="mx-auto max-w-5xl px-4 py-10 space-y-8">
        {/* ── Header ─────────────────────────────────────────── */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-emerald-700">
              My Account
            </p>
            <h1 className="mt-1 text-3xl font-extrabold text-slate-900">
              Order History
            </h1>
            {session?.user && (
              <p className="mt-1 text-sm text-slate-500">
                Logged in as{" "}
                <span className="font-semibold text-slate-700">
                  {session.user.name ?? session.user.email}
                </span>
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setIsLoading(true);
                setTimeout(() => {
                  setOrders(makeDemoOrders());
                  setIsLoading(false);
                }, 600);
              }}
              className="gap-2 border-emerald-200 text-emerald-700 hover:bg-emerald-50"
            >
              <RefreshCw className="size-3.5" /> Refresh
            </Button>
            <Button asChild size="sm" className="gap-2">
              <Link href="/">
                <ShoppingBag className="size-3.5" /> Browse Food
              </Link>
            </Button>
          </div>
        </div>

        {/* ── Summary stat row ───────────────────────────────── */}
        <div className="grid grid-cols-3 gap-3">
          {[
            {
              label: "Total Spent",
              value: totals.spent > 0 ? `Rs. ${totals.spent}` : "Free 🙌",
              icon: ShoppingBag,
              color: "text-emerald-700",
              bg: "bg-emerald-50 border-emerald-200",
            },
            {
              label: "Delivered",
              value: totals.delivered,
              icon: CheckCircle2,
              color: "text-blue-700",
              bg: "bg-blue-50 border-blue-200",
            },
            {
              label: "Active",
              value: totals.active,
              icon: Clock,
              color: "text-amber-700",
              bg: "bg-amber-50 border-amber-200",
            },
          ].map(({ label, value, icon: Icon, color, bg }) => (
            <div
              key={label}
              className={`flex items-center gap-3 rounded-2xl border p-4 ${bg}`}
            >
              <div
                className={`flex size-10 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm ${color}`}
              >
                <Icon className="size-5" />
              </div>
              <div>
                <p className={`text-2xl font-extrabold ${color}`}>{value}</p>
                <p className="text-xs font-semibold text-slate-500">{label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ── Filter chips ───────────────────────────────────── */}
        <div className="flex flex-wrap gap-2">
          {(["all", "pending", "confirmed", "picked_up", "delivered", "cancelled"] as const).map(
            (s) => (
              <button
                key={s}
                onClick={() => setFilter(s)}
                className={`rounded-full border px-4 py-1.5 text-xs font-semibold capitalize transition-all ${
                  filter === s
                    ? "border-emerald-600 bg-emerald-600 text-white shadow-sm shadow-emerald-200"
                    : "border-slate-200 bg-white text-slate-600 hover:border-emerald-300 hover:text-emerald-700"
                }`}
              >
                {s.replace("_", " ")}
              </button>
            )
          )}
        </div>

        {/* ── Order list ─────────────────────────────────────── */}
        {isLoading ? (
          <div className="flex flex-col items-center gap-3 py-20 text-slate-400">
            <Package className="size-12 animate-bounce opacity-40" />
            <p className="text-sm font-medium">Loading your orders…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-slate-300 py-20">
            <ShoppingBag className="size-12 text-slate-300" />
            <div className="text-center">
              <p className="font-semibold text-slate-600">No orders here</p>
              <p className="text-sm text-slate-400">
                {filter === "all"
                  ? "You haven't placed any orders yet."
                  : `No ${filter.replace("_", " ")} orders.`}
              </p>
            </div>
            <Button asChild size="sm">
              <Link href="/">Start Browsing Food</Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {filtered.map((order) => {
              const meta = STATUS_META[order.status];
              const StatusIcon = meta.icon;
              return (
                <article
                  key={order.id}
                  className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-lg"
                >
                  {/* Status bar accent */}
                  <div
                    className={`absolute inset-y-0 left-0 w-1 rounded-l-2xl ${
                      order.status === "delivered"
                        ? "bg-emerald-500"
                        : order.status === "cancelled"
                        ? "bg-rose-400"
                        : order.status === "picked_up"
                        ? "bg-purple-500"
                        : order.status === "confirmed"
                        ? "bg-blue-500"
                        : "bg-amber-400"
                    }`}
                  />

                  <div className="px-6 py-5 pl-8">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      {/* Left: dish info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h2 className="text-lg font-bold text-slate-900 truncate">
                            {order.dish}
                          </h2>
                          <span
                            className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${
                              order.foodType === "veg"
                                ? "bg-emerald-100 text-emerald-700"
                                : "bg-rose-100 text-rose-700"
                            }`}
                          >
                            {order.foodType === "veg" ? "🟢 Veg" : "🔴 Non-veg"}
                          </span>
                        </div>
                        <p className="mt-0.5 text-sm text-slate-500">
                          {order.sellerName} ·{" "}
                          <span className="capitalize">{order.sellerType}</span>
                        </p>
                      </div>

                      {/* Right: status badge */}
                      <div
                        className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold ${meta.bg} ${meta.color}`}
                      >
                        <StatusIcon className="size-3.5" />
                        {meta.label}
                      </div>
                    </div>

                    {/* Info row */}
                    <div className="mt-4 flex flex-wrap gap-4 text-sm text-slate-600">
                      <span className="flex items-center gap-1.5">
                        <Package className="size-4 text-slate-400" />
                        {order.quantity} × {order.unit} @ Rs. {order.unitPrice} each
                      </span>
                      <span className="flex items-center gap-1.5">
                        <MapPin className="size-4 text-slate-400" />
                        {order.distanceKm} km ·{" "}
                        {order.deliveryAvailable ? "Delivery" : "Pickup"}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Clock className="size-4 text-slate-400" />
                        {timeAgo(order.paidAt)}
                      </span>
                    </div>

                    {/* Pickup address */}
                    {order.pickupAddress && (
                      <p className="mt-2 text-xs text-slate-400">
                        📍 {order.pickupAddress}
                      </p>
                    )}

                    {/* Footer */}
                    <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4">
                      <div>
                        <p className="text-xs text-slate-400">Total Paid</p>
                        <p className="text-xl font-extrabold text-slate-900">
                          {order.totalAmount > 0
                            ? `Rs. ${order.totalAmount}`
                            : "Free"}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {order.status === "delivered" && (
                          <button className="flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-100 transition-colors">
                            <Star className="size-3" /> Rate
                          </button>
                        )}
                        <button className="flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 transition-colors">
                          Reorder <ArrowRight className="size-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {/* ── Empty CTA ──────────────────────────────────────── */}
        {!isLoading && orders.length > 0 && (
          <div className="flex justify-center pt-4">
            <Button asChild variant="outline" className="gap-2">
              <Link href="/">
                <ShoppingBag className="size-4" /> Browse More Food
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
        )}
      </section>
    </main>
  );
}
