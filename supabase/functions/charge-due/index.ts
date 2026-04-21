// Supabase Edge Function: charge-due
//
// Permissionless recurring-rent cranker. Scans the subscription
// program for every `Subscription` account whose `next_charge_at`
// has passed and sends a `charge` ix for each, pulling that period's
// rent from the subscriber ATA into the plan vault via the delegate
// the subscriber granted at subscribe time.
//
// Deploy from the Supabase dashboard or via CLI:
//   supabase functions deploy charge-due --no-verify-jwt
//
// Required function env vars (Supabase → Functions → Edge Function →
// Secrets):
//   CRANKER_KEYPAIR_JSON  JSON-encoded 64-byte Solana keypair secret.
//                         Copy the contents of id-devnet.json on devnet;
//                         use a dedicated keypair on mainnet.
//   RPC_URL               Solana RPC (default: public devnet).
//
// The cranker only pays tx fees (~0.000005 SOL per charge). Fund it
// with a modest SOL balance — one run over 100 due subscriptions
// costs roughly 0.0005 SOL.
//
// Schedule in SQL editor after deploy:
//   select cron.schedule(
//     'charge-due-hourly',
//     '0 * * * *',
//     $$ select net.http_post(
//          url := 'https://xvgxaodxylrolkpyuszx.supabase.co/functions/v1/charge-due',
//          headers := '{"Authorization":"Bearer <ANON_KEY>"}'::jsonb
//        ) $$
//   );
//
// Runtime: Deno. Imports use esm.sh since Supabase Edge Functions
// don't bundle node_modules.

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  ComputeBudgetProgram,
  TransactionInstruction,
  SystemProgram,
} from "https://esm.sh/@solana/web3.js@1.98.0";
import { AnchorProvider, BN, Program, Wallet } from "https://esm.sh/@coral-xyz/anchor@0.31.1";
import { getAssociatedTokenAddressSync, TOKEN_2022_PROGRAM_ID } from "https://esm.sh/@solana/spl-token@0.4.12";

const SUBSCRIPTION_PROGRAM_ID = new PublicKey("8G2hbD1qJUcaVAEdfVxaHfbCgxyEzQdrpjhDMM9pSL4w");
const CONFIG_SEED = new TextEncoder().encode("config");

// Minimal IDL fragment — just the accounts + methods the cranker
// needs. Loading the full IDL from an HTTPS URL at runtime is also
// possible but fragile; inlining the shape keeps the function
// self-contained.
const IDL: unknown = {
  version: "0.1.0",
  name: "subscription",
  address: SUBSCRIPTION_PROGRAM_ID.toBase58(),
  instructions: [
    {
      name: "charge",
      discriminator: [25, 216, 96, 57, 58, 100, 208, 142],
      accounts: [
        { name: "cranker", signer: true, writable: false },
        { name: "plan", writable: true },
        { name: "subscription", writable: true },
        { name: "subscriber_token_account", writable: true },
        { name: "vault", writable: true },
        { name: "config" },
        { name: "treasury", writable: true },
        { name: "mint" },
        { name: "token_program" },
      ],
      args: [],
    },
  ],
  accounts: [
    { name: "Config", discriminator: [155, 12, 170, 224, 30, 250, 204, 130] },
    { name: "SubscriptionPlan", discriminator: [178, 145, 39, 234, 192, 179, 228, 151] },
    { name: "Subscription", discriminator: [64, 7, 93, 180, 59, 157, 225, 215] },
  ],
  types: [],
  events: [],
  errors: [],
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors() });
  }

  const rpcUrl = Deno.env.get("RPC_URL") ?? "https://api.devnet.solana.com";
  const keypairJson = Deno.env.get("CRANKER_KEYPAIR_JSON");
  if (!keypairJson) {
    return json({ error: "CRANKER_KEYPAIR_JSON env var not set" }, 500);
  }

  let cranker: Keypair;
  try {
    cranker = Keypair.fromSecretKey(new Uint8Array(JSON.parse(keypairJson)));
  } catch (e) {
    return json({ error: "Invalid CRANKER_KEYPAIR_JSON", detail: String(e) }, 500);
  }

  const connection = new Connection(rpcUrl, "confirmed");
  const wallet = new Wallet(cranker);
  const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });
  // deno-lint-ignore no-explicit-any
  const program = new Program(IDL as any, provider);

  // getProgramAccounts can be heavy; filter by discriminator +
  // subscription.status == Active (enum variant 0 = Active).
  const subApi = (program.account as Record<string, {
    all: (filters: unknown[]) => Promise<Array<{
      publicKey: PublicKey;
      // deno-lint-ignore no-explicit-any
      account: any;
    }>>;
  }>).subscription;

  // Filter by status=Active (offset 8 + 32(plan) + 32(subscriber) + 8(startedAt)
  // + 8(lastChargedAt) + 8(nextChargeAt) + 8(chargeCount) + 8(totalPaid) = 112).
  // Status is a 1-byte enum where Active = 0.
  const items = await subApi.all([
    { memcmp: { offset: 112, bytes: "1" } }, // base58 "1" = [0]
  ]);

  const now = Math.floor(Date.now() / 1000);
  const due = items.filter((x) => x.account.nextChargeAt.toNumber() <= now);

  const results = {
    ok: true,
    scanned: items.length,
    due: due.length,
    charged: 0,
    failed: [] as Array<{ subscription: string; reason: string }>,
  };

  // Load plans we need (cache by address) + auction config once.
  const configPda = PublicKey.findProgramAddressSync([CONFIG_SEED], SUBSCRIPTION_PROGRAM_ID)[0];
  // deno-lint-ignore no-explicit-any
  const configAcc: any = await (program.account as any).config.fetch(configPda);

  const planCache = new Map<string, {
    plan: PublicKey;
    mint: PublicKey;
    vault: PublicKey;
    // deno-lint-ignore no-explicit-any
    raw: any;
  }>();

  for (const { publicKey: subPk, account: sub } of due) {
    try {
      const planKey = (sub.plan as PublicKey).toBase58();
      let plan = planCache.get(planKey);
      if (!plan) {
        // deno-lint-ignore no-explicit-any
        const raw: any = await (program.account as any).subscriptionPlan.fetch(sub.plan);
        plan = {
          plan: sub.plan,
          mint: raw.mint,
          vault: raw.vault,
          raw,
        };
        planCache.set(planKey, plan);
      }

      const subscriberAta = getAssociatedTokenAddressSync(
        plan.mint,
        sub.subscriber,
        false,
        TOKEN_2022_PROGRAM_ID
      );

      const ix = await program.methods
        .charge()
        .accounts({
          cranker: cranker.publicKey,
          plan: plan.plan,
          subscription: subPk,
          subscriberTokenAccount: subscriberAta,
          vault: plan.vault,
          config: configPda,
          treasury: configAcc.treasury,
          mint: plan.mint,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        } as never)
        .instruction() as TransactionInstruction;

      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
      const tx = new Transaction({ feePayer: cranker.publicKey, recentBlockhash: blockhash });
      tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }));
      tx.add(ix);
      tx.sign(cranker);
      const sig = await connection.sendRawTransaction(tx.serialize());
      await connection.confirmTransaction(
        { signature: sig, blockhash, lastValidBlockHeight },
        "confirmed"
      );
      results.charged++;
    } catch (err) {
      results.failed.push({
        subscription: subPk.toBase58(),
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Silence unused-import warnings for imports we kept for future
  // cNFT / auction variants of the cranker.
  void SystemProgram;
  void BN;

  return json(results);
});

function cors(): HeadersInit {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
}
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...cors() },
  });
}
