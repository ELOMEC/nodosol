import { Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";

const CONFIG_SEED = Buffer.from("config");

export function configPda(programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([CONFIG_SEED], programId);
}

export type FeeConfig = {
  address: PublicKey;
  authority: PublicKey;
  treasury: PublicKey;
  feeBps: number;
};

// Shared cache for every program's Config PDA. Configs change only when
// the multisig runs update_fee_bps / update_treasury / update_authority,
// which is a human-pace operation — 15 min TTL is safe and saves a
// 200–400 ms RPC round-trip on every marketplace/otc/buy click.
const CONFIG_TTL_MS = 15 * 60 * 1000;

type CacheEntry<T> = { value: T; expiresAt: number };
const configCache = new Map<string, CacheEntry<unknown>>();

/**
 * Wrap any Config-fetch async function with a 15-min TTL keyed by
 * program id + an optional label (in case a program exposes multiple
 * PDAs that look like configs). Returns the cached value on hit.
 */
export async function withConfigCache<T>(
  programId: PublicKey,
  label: string,
  fetchFn: () => Promise<T>
): Promise<T> {
  const key = `${programId.toBase58()}:${label}`;
  const now = Date.now();
  const entry = configCache.get(key) as CacheEntry<T> | undefined;
  if (entry && entry.expiresAt > now) return entry.value;
  const value = await fetchFn();
  configCache.set(key, { value, expiresAt: now + CONFIG_TTL_MS });
  return value;
}

/**
 * Invalidate every cached entry for a program. Call after update_fee_bps
 * or update_treasury succeeds so the next read is fresh.
 */
export function invalidateConfigCache(programId: PublicKey): void {
  const prefix = `${programId.toBase58()}:`;
  for (const k of configCache.keys()) {
    if (k.startsWith(prefix)) configCache.delete(k);
  }
}

export async function fetchConfig(program: Program): Promise<FeeConfig> {
  return withConfigCache(program.programId, "fee-config", async () => {
    const [address] = configPda(program.programId);
    const account = await (program.account as Record<string, {
      fetch: (addr: PublicKey) => Promise<{
        authority: PublicKey;
        treasury: PublicKey;
        feeBps: number;
      }>;
    }>).config.fetch(address);
    return {
      address,
      authority: account.authority,
      treasury: account.treasury,
      feeBps: account.feeBps,
    };
  });
}
