"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  Bell,
  ChartColumn,
  History,
  Home,
  Map,
  Moon,
  Search,
  ShieldAlert,
  ShoppingBag,
  Sun,
  User,
  UserCircle2,
  LogOut,
  LayoutDashboard,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useTheme } from "next-themes";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { reliableSignOut } from "@/lib/auth-client";

const dashboardRouteLabel: Record<string, string> = {
  "/dashboard/donor": "Donor",
  "/dashboard/ngo": "Recipient/NGO",
  "/dashboard/recipient": "Recipient/NGO",
  "/dashboard/volunteer": "Volunteer",
  "/dashboard/analytics": "Analytics",
};

type DashboardWorkspaceRole = "donor" | "recipient" | "volunteer" | "analytics" | "operations";

interface SidebarHistoryItem {
  id: string;
  label: string;
  meta: string;
}

interface RouteHistoryRecord {
  path: string;
  visitedAt: string;
}

interface LifecycleTimelineItem {
  id?: string;
  event_type?: string;
  actor_role?: string;
  status_after?: string | null;
  occurred_at?: string;
}

const LOCAL_DASHBOARD_HISTORY_KEY = "frp.dashboard.route-history.v1";

function humanizeKey(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatRelativeTime(isoValue: string) {
  const timestamp = new Date(isoValue).getTime();
  if (!Number.isFinite(timestamp)) return "just now";

  const diffMinutes = Math.max(0, Math.round((Date.now() - timestamp) / 60000));
  if (diffMinutes < 1) return "just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.round(diffHours / 24);
  return `${diffDays}d ago`;
}

function resolveWorkspaceRole(pathname: string, title: string): DashboardWorkspaceRole {
  if (pathname.startsWith("/dashboard/donor")) return "donor";
  if (pathname.startsWith("/dashboard/ngo") || pathname.startsWith("/dashboard/recipient")) return "recipient";
  if (pathname.startsWith("/dashboard/volunteer")) return "volunteer";
  if (pathname.startsWith("/dashboard/analytics")) return "analytics";

  const lower = title.toLowerCase();
  if (lower.includes("donor")) return "donor";
  if (lower.includes("recipient") || lower.includes("ngo")) return "recipient";
  if (lower.includes("volunteer")) return "volunteer";
  if (lower.includes("analytics")) return "analytics";

  return "operations";
}

function roleLabel(role: DashboardWorkspaceRole) {
  if (role === "donor") return "Donor Workspace";
  if (role === "recipient") return "Recipient Workspace";
  if (role === "volunteer") return "Volunteer Workspace";
  if (role === "analytics") return "Analytics Workspace";
  return "Operations Workspace";
}

function roleAccentClasses(role: DashboardWorkspaceRole) {
  if (role === "donor") {
    return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200";
  }
  if (role === "recipient") {
    return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200";
  }
  if (role === "volunteer") {
    return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200";
  }
  return "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200";
}

function roleAnalyticsHref(role: DashboardWorkspaceRole) {
  if (role === "donor") return "/analytics#donor-analytics";
  if (role === "recipient") return "/analytics#ngo-analytics";
  if (role === "volunteer") return "/analytics#volunteer-analytics";
  return "/analytics";
}

function roleHistoryTitle(role: DashboardWorkspaceRole) {
  if (role === "donor") return "Donor History";
  if (role === "recipient") return "NGO History";
  if (role === "volunteer") return "Volunteer History";
  if (role === "analytics") return "Analytics History";
  return "Workspace History";
}

function matchesWorkspaceRole(actorRole: string, workspaceRole: DashboardWorkspaceRole) {
  const normalized = actorRole.toLowerCase();
  if (workspaceRole === "donor") return ["donor", "supplier"].includes(normalized);
  if (workspaceRole === "recipient") return ["recipient", "ngo", "organization", "organisation"].includes(normalized);
  if (workspaceRole === "volunteer") return normalized === "volunteer";
  if (workspaceRole === "analytics") return ["analytics", "admin", "system"].includes(normalized);
  return true;
}

interface DashboardShellProps {
  basePath: string;
  title: string;
  liveStatus?: string;
  children: React.ReactNode;
}

export function DashboardShell({ basePath, title, liveStatus = "Live sync active", children }: DashboardShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [lifecycleHistory, setLifecycleHistory] = useState<SidebarHistoryItem[]>([]);
  const [lifecycleLoading, setLifecycleLoading] = useState(true);
  const [routeHistory, setRouteHistory] = useState<SidebarHistoryItem[]>([]);

  const workspaceRole = useMemo(() => resolveWorkspaceRole(pathname, title), [pathname, title]);
  const workspaceLabel = useMemo(() => roleLabel(workspaceRole), [workspaceRole]);
  const analyticsHref = useMemo(() => roleAnalyticsHref(workspaceRole), [workspaceRole]);
  const historyTitle = useMemo(() => roleHistoryTitle(workspaceRole), [workspaceRole]);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleLogout = async () => {
    await reliableSignOut("/auth/sign-in");
    router.refresh();
  };

  useEffect(() => {
    if (typeof window === "undefined" || !pathname.startsWith("/dashboard")) return;

    let records: RouteHistoryRecord[] = [];
    try {
      const raw = window.localStorage.getItem(LOCAL_DASHBOARD_HISTORY_KEY);
      const parsed = raw ? (JSON.parse(raw) as unknown) : [];
      if (Array.isArray(parsed)) {
        records = parsed
          .filter((item): item is RouteHistoryRecord => {
            if (!item || typeof item !== "object") return false;
            const maybePath = (item as { path?: unknown }).path;
            const maybeVisitedAt = (item as { visitedAt?: unknown }).visitedAt;
            return typeof maybePath === "string" && typeof maybeVisitedAt === "string";
          })
          .slice(0, 9);
      }
    } catch {
      records = [];
    }

    const nextRecord: RouteHistoryRecord = {
      path: pathname,
      visitedAt: new Date().toISOString(),
    };

    const deduped = [nextRecord, ...records.filter((item) => item.path !== pathname)].slice(0, 8);

    try {
      window.localStorage.setItem(LOCAL_DASHBOARD_HISTORY_KEY, JSON.stringify(deduped));
    } catch {
      // Ignore storage quota issues.
    }

    setRouteHistory(
      deduped.map((item) => {
        const routeLabel = item.path === basePath
          ? "Current Workspace"
          : (dashboardRouteLabel[item.path] ?? item.path.replace("/dashboard/", "").replaceAll("-", " "));
        return {
          id: `route-${item.path}-${item.visitedAt}`,
          label: `Visited ${humanizeKey(routeLabel)}`,
          meta: `${formatRelativeTime(item.visitedAt)} | ${item.path}`,
        };
      }),
    );
  }, [basePath, pathname]);

  useEffect(() => {
    let cancelled = false;

    const loadLifecycleHistory = async () => {
      setLifecycleLoading(true);
      try {
        const response = await fetch("/api/lifecycle?limit=6", { cache: "no-store" });
        if (!response.ok) throw new Error("Lifecycle feed unavailable");

        const payload = (await response.json()) as { timeline?: LifecycleTimelineItem[] };
        const timeline = Array.isArray(payload.timeline) ? payload.timeline : [];

        if (cancelled) return;

        const filteredTimeline = timeline.filter((item) => matchesWorkspaceRole(String(item.actor_role ?? "system"), workspaceRole));

        setLifecycleHistory(
          filteredTimeline.map((item, index) => {
            const eventType = humanizeKey(String(item.event_type ?? "status_updated"));
            const eventState = item.status_after ? `(${humanizeKey(item.status_after)})` : "";
            const eventTime = item.occurred_at ? formatRelativeTime(item.occurred_at) : "recent";

            return {
              id: item.id ?? `timeline-${index}`,
              label: `${eventType} ${eventState}`.trim(),
              meta: eventTime,
            };
          }),
        );
      } catch {
        if (!cancelled) setLifecycleHistory([]);
      } finally {
        if (!cancelled) setLifecycleLoading(false);
      }
    };

    void loadLifecycleHistory();
    const interval = window.setInterval(() => {
      void loadLifecycleHistory();
    }, 120000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [workspaceRole]);

  const activeTheme = mounted ? (theme ?? "system") : "system";
  const sidebarHistory = lifecycleHistory.length ? lifecycleHistory : routeHistory;

  return (
    <div className="feedo-app feedo-chrome min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="feedo-ambient" aria-hidden="true">
        <svg className="feedo-globe" viewBox="0 0 580 580" fill="none" role="presentation">
          <circle cx="290" cy="290" r="220" className="feedo-orbit" />
          <circle cx="290" cy="290" r="160" className="feedo-orbit-muted" />
          <circle cx="290" cy="290" r="100" className="feedo-orbit" />
          <path d="M95 320C162 262 255 242 325 272C404 307 468 300 525 240" className="feedo-route" />
          <path d="M112 206C189 176 276 174 356 212C420 243 479 236 525 198" className="feedo-route-muted" />
          <circle cx="170" cy="282" r="8" className="feedo-node" />
          <circle cx="278" cy="258" r="8" className="feedo-node" />
          <circle cx="386" cy="290" r="8" className="feedo-node feedo-node-alt" />
          <circle cx="475" cy="255" r="8" className="feedo-node" />
        </svg>

        <svg className="feedo-food" viewBox="0 0 240 240" fill="none" role="presentation">
          <circle cx="120" cy="120" r="86" className="feedo-food-ring" />
          <path d="M58 146C84 112 121 96 164 98" className="feedo-food-line" />
          <path d="M62 102C93 76 136 72 177 88" className="feedo-food-line-soft" />
          <circle cx="90" cy="132" r="8" className="feedo-food-dot" />
          <circle cx="126" cy="116" r="8" className="feedo-food-dot" />
          <circle cx="158" cy="126" r="8" className="feedo-food-dot" />
        </svg>
      </div>

      <div className="grid min-h-screen md:grid-cols-[300px_1fr]">
        <aside className="relative z-10 hidden border-r border-slate-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-950/85 md:block">
          <div className="h-full overflow-y-auto scroll-area-smooth">
            {/* Brand */}
            <div className="border-b border-slate-200 p-4 dark:border-slate-800">
              <Link href="/" className="flex items-center gap-2.5">
                <span className="flex size-8 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 shadow-md shadow-emerald-300/30">
                  <svg width="18" height="18" viewBox="0 0 34 34" fill="none" aria-hidden="true">
                    <path d="M12 22c3-2 5-6 5-10 3 2 5 6 5 10" stroke="#ecfdf5" strokeWidth="2.5" strokeLinecap="round" />
                    <path d="M17 10v14" stroke="#ecfdf5" strokeWidth="2.5" strokeLinecap="round" />
                  </svg>
                </span>
                <div>
                  <p className="text-lg font-extrabold tracking-tight text-slate-900 dark:text-slate-100">Feedo</p>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500">Food Rescue Platform</p>
                </div>
              </Link>
              <p className={`mt-3 inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${roleAccentClasses(workspaceRole)}`}>
                {workspaceLabel}
              </p>
            </div>

            {/* Primary nav */}
            <nav className="px-3 pt-3 pb-2 space-y-1">
              <p className="px-2 text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">Navigation</p>
              {([
                { href: "/", label: "Home", icon: Home },
                { href: "/orders", label: "My Orders", icon: ShoppingBag },
                { href: "/map", label: "Live Map", icon: Map },
                { href: "/analytics", label: "Impact & Analytics", icon: ChartColumn },
                { href: "/crisis", label: "Crisis Command", icon: ShieldAlert },
                { href: "/notifications", label: "Notifications", icon: Bell },
              ] as Array<{ href: string; label: string; icon: React.ElementType }>).map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  className={`group flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all ${
                    pathname === href || (href !== "/" && pathname.startsWith(href))
                      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                  }`}
                >
                  <Icon className="size-4" />
                  {label}
                </Link>
              ))}
            </nav>

            {/* Dashboard workspaces */}
            <div className="px-3 pt-2 pb-2">
              <p className="px-2 text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-1">Workspaces</p>
              {([
                { href: "/dashboard/donor", label: "Donor Workspace" },
                { href: "/dashboard/ngo", label: "NGO / Recipient" },
                { href: "/dashboard/volunteer", label: "Volunteer" },
                { href: "/dashboard/analytics", label: "Analytics" },
              ]).map(({ href, label }) => (
                <Link
                  key={href}
                  href={href}
                  className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all ${
                    pathname.startsWith(href)
                      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                  }`}
                >
                  <LayoutDashboard className="size-4" />
                  {label}
                </Link>
              ))}
            </div>

            {/* Role analytics CTA */}
            <section className="mx-3 mt-2 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">Role Analytics</p>
              <Button asChild className="mt-2 w-full gap-2" size="sm">
                <Link href={analyticsHref}>
                  <ChartColumn className="h-4 w-4" /> {workspaceLabel.replace(" Workspace", "")} Analytics
                </Link>
              </Button>
            </section>

            {/* Recent activity */}
            <section id="sidebar-history" className="mx-3 mt-3 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
              <p className="flex items-center gap-1 text-xs font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                <History className="h-3.5 w-3.5" /> {historyTitle}
              </p>
              <div className="mt-3 space-y-2">
                {lifecycleLoading ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400">Loading recent activity...</p>
                ) : sidebarHistory.length ? (
                  sidebarHistory.slice(0, 4).map((item) => (
                    <div key={item.id} className="rounded-lg border border-slate-200 bg-slate-50 p-2 dark:border-slate-700 dark:bg-slate-800">
                      <p className="text-xs font-medium text-slate-800 dark:text-slate-200">{item.label}</p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">{item.meta}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-slate-500 dark:text-slate-400">No history yet. Actions will appear here.</p>
                )}
              </div>
            </section>

            {/* Profile / Sign out */}
            <div className="mx-3 mt-3 mb-4 space-y-1">
              <Link
                href="/profile"
                className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800"
              >
                <User className="size-4" /> Profile & Settings
              </Link>
              <button
                onClick={handleLogout}
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/20"
              >
                <LogOut className="size-4" /> Sign Out
              </button>
            </div>

          </div>
        </aside>

        <main className="relative z-10 p-4 md:p-6">
          <header className="mb-4 flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm text-slate-500 dark:text-slate-400">Operational workspace</p>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{title}</h1>
              <p className={`mt-1 inline-flex rounded-full px-2 py-1 text-xs font-semibold ${roleAccentClasses(workspaceRole)}`}>{workspaceLabel}</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative w-56">
                <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-slate-400" />
                <Input className="pl-8" placeholder="Search" />
              </div>
              <Button variant="outline" size="icon" aria-label="Notifications"><Bell className="h-4 w-4" /></Button>
              <span className="min-w-44 rounded-full bg-emerald-100 px-3 py-1 text-center text-xs font-semibold tabular-nums text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">{liveStatus}</span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2">
                    <UserCircle2 className="h-4 w-4" /> Profile
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuLabel>My Account</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/profile">Profile / Settings</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleLogout}>Logout</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>

          <div className="mb-4 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900 md:hidden">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">Theme</p>
            <div className="mt-2 grid grid-cols-3 gap-2">
              <Button variant={activeTheme === "light" ? "default" : "outline"} size="sm" onClick={() => setTheme("light")} className="gap-1">
                <Sun className="h-3.5 w-3.5" /> Light
              </Button>
              <Button variant={activeTheme === "dark" ? "default" : "outline"} size="sm" onClick={() => setTheme("dark")} className="gap-1">
                <Moon className="h-3.5 w-3.5" /> Dark
              </Button>
              <Button variant={activeTheme === "system" ? "default" : "outline"} size="sm" onClick={() => setTheme("system")}>
                Auto
              </Button>
            </div>
          </div>

          <div className="feedo-dashboard-content">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
