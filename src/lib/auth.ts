import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@/db";
import * as schema from "@/db/schema";

function splitOrigins(value: string | undefined) {
  if (!value) return [] as string[];
  return value
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function normalizeOrigin(value: string | null | undefined) {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function isPrivateOrLocalHost(hostname: string) {
  const lower = hostname.toLowerCase();
  if (lower === "localhost" || lower === "::1") return true;
  if (/^127(?:\.\d{1,3}){3}$/.test(lower)) return true;
  if (/^10(?:\.\d{1,3}){3}$/.test(lower)) return true;
  if (/^192\.168(?:\.\d{1,3}){2}$/.test(lower)) return true;

  const match172 = lower.match(/^172\.(\d{1,3})(?:\.\d{1,3}){2}$/);
  if (match172) {
    const secondOctet = Number(match172[1]);
    return secondOctet >= 16 && secondOctet <= 31;
  }

  return false;
}

const baseURL = process.env.BETTER_AUTH_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

const staticTrustedOrigins = Array.from(
  new Set([
    baseURL,
    ...splitOrigins(process.env.AUTH_TRUSTED_ORIGIN),
    ...splitOrigins(process.env.BETTER_AUTH_TRUSTED_ORIGINS),
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost:3002",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:3001",
    "http://127.0.0.1:3002",
  ]),
);

export const auth = betterAuth({
    baseURL,
    trustedOrigins: (request) => {
        const merged = new Set(staticTrustedOrigins);

        const headerOrigin = normalizeOrigin(request.headers.get("origin"));
        const refererOrigin = normalizeOrigin(request.headers.get("referer"));

        if (process.env.NODE_ENV !== "production") {
            for (const candidate of [headerOrigin, refererOrigin]) {
                if (!candidate) continue;
                const host = new URL(candidate).hostname;
                if (isPrivateOrLocalHost(host)) {
                    merged.add(candidate);
                }
            }
        }

        return Array.from(merged);
    },
    socialProviders: {
        github: {
            clientId: process.env.GITHUB_CLIENT_ID as string,
            clientSecret: process.env.GITHUB_CLIENT_SECRET as string,
        },
        google: {
            clientId: process.env.GOOGLE_CLIENT_ID as string,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
        },
    },
    emailAndPassword: {enabled: true,},
    database: drizzleAdapter(db, {
        provider: "pg", // or "mysql", "sqlite"
        schema: {...schema},
    })
})

