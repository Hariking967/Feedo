"use client";

import { useEffect } from "react";
import { supabaseClient } from "@/lib/integrations/supabase";

export function useDonationsRealtime(onChange: () => void) {
  useEffect(() => {
    if (!supabaseClient) return;
    const client = supabaseClient;

    const channel = client
      .channel("donations-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "donations" }, () => {
        onChange();
      })
      .subscribe();

    return () => {
      void client.removeChannel(channel);
    };
  }, [onChange]);
}
