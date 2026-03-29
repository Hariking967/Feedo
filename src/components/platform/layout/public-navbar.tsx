"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Map,
  Activity,
  Bell,
  ShieldAlert,
  ShoppingBag,
  User,
  LogOut,
  ChevronDown,
  Menu,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { authClient, reliableSignOut } from "@/lib/auth-client";

const NAV_LINKS = [
  { href: "/", label: "Home", icon: LayoutDashboard },
  { href: "/map", label: "Live Map", icon: Map },
  { href: "/analytics", label: "Impact", icon: Activity },
  { href: "/crisis", label: "Crisis", icon: ShieldAlert },
  { href: "/notifications", label: "Alerts", icon: Bell },
];

const DASHBOARD_LINKS = [
  { href: "/dashboard/donor", label: "Donor" },
  { href: "/dashboard/ngo", label: "NGO/Recipient" },
  { href: "/dashboard/volunteer", label: "Volunteer" },
  { href: "/dashboard/analytics", label: "Analytics" },
];

export function PublicNavbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const handleLogout = async () => {
    await reliableSignOut("/auth/sign-in");
    router.refresh();
  };

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <>
      <header
        className={`sticky top-0 z-50 w-full transition-all duration-300 ${
          scrolled
            ? "border-b border-emerald-100/60 bg-white/90 shadow-sm shadow-emerald-100/30 backdrop-blur-lg"
            : "border-b border-transparent bg-white/70 backdrop-blur"
        }`}
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
          {/* ── Brand ─────────────────────────────────────── */}
          <Link href="/" className="flex items-center gap-2.5 shrink-0">
            {/* Feedo leaf logo */}
            <span className="flex size-8 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 shadow-md shadow-emerald-300/40">
              <svg
                width="18"
                height="18"
                viewBox="0 0 34 34"
                aria-hidden="true"
                fill="none"
              >
                <path
                  d="M12 22c3-2 5-6 5-10 3 2 5 6 5 10"
                  stroke="#ecfdf5"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
                <path
                  d="M17 10v14"
                  stroke="#ecfdf5"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
              </svg>
            </span>
            <span className="text-xl font-extrabold tracking-tight text-slate-900">
              Feedo
            </span>
          </Link>

          {/* ── Desktop Nav ───────────────────────────────── */}
          <nav className="hidden items-center gap-1 md:flex">
            {NAV_LINKS.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold transition-all ${
                  isActive(href)
                    ? "bg-emerald-50 text-emerald-700"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                <Icon className="size-4" />
                {label}
              </Link>
            ))}

            {/* Dashboard Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-all">
                  <LayoutDashboard className="size-4" />
                  Dashboards
                  <ChevronDown className="size-3.5 opacity-60" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="center" className="w-48">
                <DropdownMenuLabel className="text-xs text-slate-500">
                  Role Workspaces
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {DASHBOARD_LINKS.map(({ href, label }) => (
                  <DropdownMenuItem key={href} asChild>
                    <Link href={href}>{label}</Link>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </nav>

          {/* ── Right Actions ─────────────────────────────── */}
          <div className="hidden items-center gap-2 md:flex">
            {session ? (
              <>
                {/* Orders */}
                <Link
                  href="/orders"
                  className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold transition-all ${
                    isActive("/orders")
                      ? "bg-emerald-50 text-emerald-700"
                      : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <ShoppingBag className="size-4" />
                  Orders
                </Link>

                {/* Account dropdown */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:border-emerald-300 hover:text-emerald-700 transition-all">
                      <span className="flex size-6 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold">
                        {(session.user?.name ?? session.user?.email ?? "U")
                          .charAt(0)
                          .toUpperCase()}
                      </span>
                      <span className="max-w-[100px] truncate">
                        {session.user?.name ?? "Account"}
                      </span>
                      <ChevronDown className="size-3 opacity-50" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52">
                    <DropdownMenuLabel className="text-xs text-slate-500">
                      {session.user?.email}
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <Link href="/profile" className="gap-2">
                        <User className="size-4" /> Profile & Settings
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href="/orders" className="gap-2">
                        <ShoppingBag className="size-4" /> My Orders
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={handleLogout}
                      className="text-rose-600 focus:text-rose-700 gap-2"
                    >
                      <LogOut className="size-4" /> Sign Out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            ) : (
              <>
                <Button variant="outline" asChild size="sm">
                  <Link href="/auth/sign-in">Sign In</Link>
                </Button>
                <Button
                  asChild
                  size="sm"
                  className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 shadow-md shadow-emerald-200/50"
                >
                  <Link href="/auth/sign-up">Get Started</Link>
                </Button>
              </>
            )}
          </div>

          {/* ── Mobile hamburger ─────────────────────────── */}
          <button
            className="flex items-center rounded-xl p-2 text-slate-600 hover:bg-slate-100 md:hidden"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>

        {/* ── Mobile menu ───────────────────────────────── */}
        {mobileOpen && (
          <div className="border-t border-slate-100 bg-white px-4 pb-4 md:hidden">
            <div className="mt-3 space-y-1">
              {NAV_LINKS.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setMobileOpen(false)}
                  className={`flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold ${
                    isActive(href)
                      ? "bg-emerald-50 text-emerald-700"
                      : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <Icon className="size-4" />
                  {label}
                </Link>
              ))}
              <div className="my-2 h-px bg-slate-100" />
              {DASHBOARD_LINKS.map(({ href, label }) => (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                >
                  <LayoutDashboard className="size-4" />
                  {label} Dashboard
                </Link>
              ))}
              <div className="my-2 h-px bg-slate-100" />
              {session ? (
                <>
                  <Link
                    href="/orders"
                    onClick={() => setMobileOpen(false)}
                    className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    <ShoppingBag className="size-4" /> My Orders
                  </Link>
                  <Link
                    href="/profile"
                    onClick={() => setMobileOpen(false)}
                    className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    <User className="size-4" /> Profile
                  </Link>
                  <button
                    onClick={handleLogout}
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold text-rose-600 hover:bg-rose-50"
                  >
                    <LogOut className="size-4" /> Sign Out
                  </button>
                </>
              ) : (
                <div className="flex gap-2 pt-2">
                  <Button variant="outline" asChild className="flex-1">
                    <Link href="/auth/sign-in">Sign In</Link>
                  </Button>
                  <Button asChild className="flex-1">
                    <Link href="/auth/sign-up">Sign Up</Link>
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}
      </header>
    </>
  );
}
