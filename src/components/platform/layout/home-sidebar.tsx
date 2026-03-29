"use client";

import { useRouter } from "next/navigation";
import { LayoutDashboard, ShoppingBag, ChevronRight } from "lucide-react";

export function HomeSidebar() {
  const router = useRouter();

  return (
    <aside className="space-y-4 xl:sticky xl:top-24 xl:h-fit">
      <div className="rounded-2xl border border-emerald-200 bg-white/80 p-4 shadow-sm backdrop-blur-md">
        <h3 className="mb-3 px-2 text-xs font-bold uppercase tracking-wider text-emerald-800">
          Navigation
        </h3>
        <nav className="space-y-2">
          <button
            onClick={() => router.push("/analytics")}
            className="group flex w-full items-center justify-between rounded-xl border border-transparent px-3 py-2.5 text-sm font-semibold text-slate-700 transition-all hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-900 hover:shadow-sm"
          >
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-emerald-100 p-1.5 text-emerald-600">
                <LayoutDashboard className="size-4" />
              </div>
              Dashboard
            </div>
            <ChevronRight className="size-4 text-emerald-300 transition-transform group-hover:translate-x-0.5" />
          </button>

          <button
            onClick={() => router.push("/orders")}
            className="group flex w-full items-center justify-between rounded-xl border border-transparent px-3 py-2.5 text-sm font-semibold text-slate-700 transition-all hover:border-cyan-200 hover:bg-cyan-50 hover:text-cyan-900 hover:shadow-sm"
          >
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-cyan-100 p-1.5 text-cyan-600">
                <ShoppingBag className="size-4" />
              </div>
              Orders
            </div>
            <ChevronRight className="size-4 text-cyan-300 transition-transform group-hover:translate-x-0.5" />
          </button>
        </nav>
      </div>
    </aside>
  );
}
