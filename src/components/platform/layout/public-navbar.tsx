"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";

export function PublicNavbar() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const isDark = mounted && resolvedTheme === "dark";

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/85 backdrop-blur dark:border-slate-800 dark:bg-slate-950/85">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
        <Link href="/" className="text-lg font-bold text-emerald-700 dark:text-emerald-300">Food Rescue Platform</Link>
        <nav className="hidden items-center gap-5 text-sm font-medium text-slate-600 dark:text-slate-300 md:flex">
          <Link href="/map">Map</Link>
          <Link href="/analytics">Impact</Link>
          <Link href="/crisis">Crisis</Link>
          <Link href="/notifications">Notifications</Link>
        </nav>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            aria-label="Toggle theme"
            onClick={() => setTheme(isDark ? "light" : "dark")}
          >
            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
          <Button variant="outline" asChild><Link href="/auth/sign-in">Login</Link></Button>
          <Button asChild><Link href="/auth/sign-up">Get Started</Link></Button>
        </div>
      </div>
    </header>
  );
}
