import { createClient, SupabaseClient } from "@supabase/supabase-js";

const DEFAULT_URL = "https://xvgxaodxylrolkpyuszx.supabase.co";
const DEFAULT_ANON_KEY = "sb_publishable_J3YZ2Lpx2k3UUF3xBF_VSA_xLS7GR_D";

// Anon / publishable keys are safe to embed client-side. Env vars are preferred
// so the dev / staging projects can override without a rebuild.
export function getSupabaseUrl(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_URL ?? DEFAULT_URL;
}

export function getSupabaseAnonKey(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? DEFAULT_ANON_KEY;
}

let clientSingleton: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (clientSingleton) return clientSingleton;
  clientSingleton = createClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    realtime: {
      params: { eventsPerSecond: 5 },
    },
  });
  return clientSingleton;
}

export type ChatMessage = {
  id: number;
  thread_memo_hash: string;
  sender_pubkey: string;
  body: string;
  created_at: string;
};

export type ChatThread = {
  memo_hash: string;
  seller_pubkey: string;
  buyer_pubkey: string;
  deal_address: string;
  created_at: string;
};
