"use client";

import { donations as seedDonations } from "@/lib/platform/mock-data";
import type { Donation } from "@/lib/platform/types";
import { isSupabaseConfigured, supabaseClient } from "@/lib/integrations/supabase";

const DONATIONS_KEY = "frp.donations.v1";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchDonations(): Promise<Donation[]> {
  await delay(220);

  if (isSupabaseConfigured && supabaseClient) {
    const { data, error } = await supabaseClient
      .from("donations")
      .select("*")
      .order("createdAt", { ascending: false })
      .limit(200);

    if (!error && data && data.length) {
      return data as Donation[];
    }
  }

  const raw = window.localStorage.getItem(DONATIONS_KEY);
  if (!raw) return seedDonations;

  try {
    const parsed = JSON.parse(raw) as Donation[];
    return parsed.length ? parsed : seedDonations;
  } catch {
    return seedDonations;
  }
}

export async function saveDonations(donations: Donation[]) {
  await delay(80);

  if (isSupabaseConfigured && supabaseClient) {
    const payload = donations.map((donation) => ({
      ...donation,
      updatedAt: new Date().toISOString(),
    }));

    const { error } = await supabaseClient.from("donations").upsert(payload, { onConflict: "id" });
    if (!error) return;
  }

  window.localStorage.setItem(DONATIONS_KEY, JSON.stringify(donations));
}
