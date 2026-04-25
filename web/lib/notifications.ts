import { SupabaseClient } from "@supabase/supabase-js";

import { createAuthedSupabaseClient } from "./supabase";

export type NotificationRow = {
  id: string;
  wallet_pubkey: string;
  type: string;
  payload: Record<string, unknown>;
  href: string | null;
  title: string;
  body: string | null;
  signature: string | null;
  read: boolean;
  email_eligible: boolean;
  email_sent_at: string | null;
  created_at: string;
};

export async function fetchNotifications(
  jwt: string,
  limit = 30
): Promise<NotificationRow[]> {
  const supabase = createAuthedSupabaseClient(jwt);
  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.warn("fetchNotifications failed", error);
    return [];
  }
  return (data ?? []) as NotificationRow[];
}

export async function markNotificationsRead(
  jwt: string,
  ids: string[]
): Promise<void> {
  if (ids.length === 0) return;
  const supabase = createAuthedSupabaseClient(jwt);
  const { error } = await supabase
    .from("notifications")
    .update({ read: true })
    .in("id", ids);
  if (error) console.warn("markNotificationsRead failed", error);
}

export function subscribeToNotifications(
  client: SupabaseClient,
  walletPubkey: string,
  onInsert: (row: NotificationRow) => void
): () => void {
  const channel = client
    .channel(`notifications:${walletPubkey}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "notifications",
        filter: `wallet_pubkey=eq.${walletPubkey}`,
      },
      (payload) => {
        onInsert(payload.new as NotificationRow);
      }
    )
    .subscribe();
  return () => {
    void client.removeChannel(channel);
  };
}
