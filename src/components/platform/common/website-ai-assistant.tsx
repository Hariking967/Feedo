"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Bot, Compass, Lightbulb, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface AssistantLink {
  label: string;
  href: string;
  tags?: string[];
}

interface AssistantIntent {
  id: string;
  title: string;
  keywords: string[];
  answer: string;
  links: AssistantLink[];
}

interface WebsiteAiAssistantProps {
  title?: string;
  description?: string;
  placeholder?: string;
  maxSuggestions?: number;
  extraLinks?: AssistantLink[];
}

const WEBSITE_LINKS: AssistantLink[] = [
  { label: "Home", href: "/", tags: ["home", "landing", "overview"] },
  { label: "Donor Dashboard", href: "/dashboard/donor", tags: ["donor", "supplier", "listing"] },
  { label: "NGO Dashboard", href: "/dashboard/ngo", tags: ["ngo", "recipient", "request"] },
  { label: "Volunteer Dashboard", href: "/dashboard/volunteer", tags: ["volunteer", "route", "delivery"] },
  { label: "Analytics", href: "/analytics", tags: ["analytics", "impact", "metrics"] },
  { label: "Browse Donations", href: "/browse", tags: ["browse", "discover", "donations"] },
  { label: "Create Listing", href: "/post", tags: ["create", "post", "listing", "donation"] },
  { label: "Map", href: "/map", tags: ["map", "routing", "location"] },
  { label: "Crisis Mode", href: "/crisis", tags: ["crisis", "emergency", "risk"] },
  { label: "Notifications", href: "/notifications", tags: ["notifications", "alerts"] },
  { label: "Orders", href: "/orders", tags: ["orders", "tasks", "history"] },
  { label: "Profile", href: "/profile", tags: ["profile", "settings", "account"] },
];

const INTENTS: AssistantIntent[] = [
  {
    id: "donor-start",
    title: "How do I start as a donor?",
    keywords: ["donor", "supplier", "start", "post", "listing", "contribute"],
    answer:
      "Use Create Listing to post available food, then monitor pickups from your donor workspace. You can also track response speed and successful pickups in analytics.",
    links: [
      { label: "Create Listing", href: "/post" },
      { label: "Donor Dashboard", href: "/dashboard/donor" },
      { label: "Analytics", href: "/analytics" },
    ],
  },
  {
    id: "ngo-flow",
    title: "How does NGO request flow work?",
    keywords: ["ngo", "recipient", "request", "cart", "needs", "acceptance radius"],
    answer:
      "NGO teams browse eligible donations, reserve quantities into the request cart, and place pickup requests. The request queue tracks requested, assigned, and delivered states, with delivery history shown in the NGO workspace.",
    links: [
      { label: "NGO Dashboard", href: "/dashboard/ngo" },
      { label: "Browse Donations", href: "/browse" },
    ],
  },
  {
    id: "volunteer-flow",
    title: "How do volunteers complete deliveries?",
    keywords: ["volunteer", "pickup", "deliver", "route", "eta", "multi-order"],
    answer:
      "Volunteers choose stop count, compare suggested route options, accept the best route, then confirm pickup and delivery. Previous order history shows recent assigned and delivered tasks.",
    links: [
      { label: "Volunteer Dashboard", href: "/dashboard/volunteer" },
      { label: "Map", href: "/map" },
      { label: "Orders", href: "/orders" },
    ],
  },
  {
    id: "crisis-mode",
    title: "What changes in crisis mode?",
    keywords: ["crisis", "emergency", "radius", "priority", "urgent", "rescue"],
    answer:
      "Crisis mode increases urgency weighting, expands matching radius, and prioritizes faster feasible rescue routes. High-risk areas are highlighted to improve dispatch decisions.",
    links: [
      { label: "Crisis Mode", href: "/crisis" },
      { label: "Volunteer Dashboard", href: "/dashboard/volunteer" },
      { label: "NGO Dashboard", href: "/dashboard/ngo" },
    ],
  },
  {
    id: "analytics",
    title: "What can I see in analytics?",
    keywords: ["analytics", "metrics", "kpi", "impact", "charts", "score"],
    answer:
      "Analytics separates donor, NGO, and volunteer sections, then combines cross-role views such as throughput, lifecycle activity, reliability, and operational pressure.",
    links: [
      { label: "Analytics", href: "/analytics" },
    ],
  },
  {
    id: "auth",
    title: "How do sign in and account settings work?",
    keywords: ["login", "register", "sign in", "sign up", "account", "profile", "settings", "logout"],
    answer:
      "Use sign-in/sign-up pages for account access, and manage personal profile and preferences under Profile. Sign-out is available from dashboard profile menu.",
    links: [
      { label: "Sign In", href: "/auth/sign-in" },
      { label: "Sign Up", href: "/auth/sign-up" },
      { label: "Profile", href: "/profile" },
    ],
  },
];

function tokenize(value: string) {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function scoreKeywords(queryTokens: string[], keywords: string[]) {
  if (!queryTokens.length) return 0;
  const lowered = keywords.map((keyword) => keyword.toLowerCase());
  let score = 0;

  for (const token of queryTokens) {
    if (lowered.some((keyword) => keyword.includes(token))) score += 2;
    if (lowered.some((keyword) => token.includes(keyword))) score += 1;
  }

  return score;
}

function dedupeLinks(links: AssistantLink[]) {
  const map = new Map<string, AssistantLink>();
  for (const item of links) {
    if (!map.has(item.href)) {
      map.set(item.href, item);
    }
  }
  return Array.from(map.values());
}

export function WebsiteAiAssistant({
  title = "AI Website Assistant",
  description = "Ask anything about Feedo workflows, roles, pages, and operations.",
  placeholder = "Ask about donor, NGO, volunteer, crisis, map, orders, analytics...",
  maxSuggestions = 5,
  extraLinks = [],
}: WebsiteAiAssistantProps) {
  const [query, setQuery] = useState("");

  const allLinks = useMemo(() => dedupeLinks([...extraLinks, ...WEBSITE_LINKS]), [extraLinks]);

  const matchedIntent = useMemo(() => {
    const queryTokens = tokenize(query);
    if (!queryTokens.length) return null;

    let best: { intent: AssistantIntent; score: number } | null = null;
    for (const intent of INTENTS) {
      const score = scoreKeywords(queryTokens, intent.keywords);
      if (!best || score > best.score) {
        best = { intent, score };
      }
    }

    if (!best || best.score < 2) return null;
    return best.intent;
  }, [query]);

  const routeSuggestions = useMemo(() => {
    const queryTokens = tokenize(query);

    if (!queryTokens.length) {
      return allLinks.slice(0, maxSuggestions);
    }

    const scored = allLinks
      .map((link) => {
        const score = scoreKeywords(queryTokens, [link.label, link.href, ...(link.tags ?? [])]);
        return { link, score };
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxSuggestions)
      .map((entry) => entry.link);

    return scored.length ? scored : allLinks.slice(0, Math.min(3, maxSuggestions));
  }, [allLinks, maxSuggestions, query]);

  const quickTopics = useMemo(() => [
    "How do I post a donation?",
    "How does NGO request history work?",
    "How do volunteers pick the best route?",
    "What changes in crisis mode?",
  ], []);

  const answer = matchedIntent
    ? matchedIntent.answer
    : query.trim()
      ? "I can answer Feedo-specific questions about dashboards, routes, crisis mode, orders, history, analytics, and account flows. Try asking with role + action, such as volunteer + delivery confirmation."
      : "Ask a website-specific question. I will return the best answer and the most relevant pages to open next.";

  const answerLinks = matchedIntent ? dedupeLinks([...matchedIntent.links, ...routeSuggestions]).slice(0, maxSuggestions) : routeSuggestions;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-3">
      <p className="flex items-center gap-1 text-xs font-semibold uppercase tracking-widest text-slate-500">
        <Bot className="h-3.5 w-3.5" /> {title}
      </p>
      <p className="mt-1 text-[12px] text-slate-600">{description}</p>

      <div className="mt-2 flex gap-2">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={placeholder}
          className="h-8 text-xs"
        />
        <Button size="sm" className="h-8 px-2" onClick={() => setQuery(query.trim())}>
          <Send className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-2">
        <p className="text-xs font-semibold text-slate-700">Answer</p>
        <p className="mt-1 text-xs text-slate-600">{answer}</p>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {quickTopics.map((topic) => (
          <button
            type="button"
            key={topic}
            className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100"
            onClick={() => setQuery(topic)}
          >
            <Lightbulb className="mr-1 inline h-3 w-3" />
            {topic}
          </button>
        ))}
      </div>

      <div className="mt-3 space-y-1">
        {answerLinks.map((item) => (
          <Link
            key={`${item.href}-${item.label}`}
            href={item.href}
            className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
          >
            <Compass className="h-3 w-3" />
            {item.label}
          </Link>
        ))}
      </div>
    </section>
  );
}
