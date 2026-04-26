/**
 * Seed 5 rental subscription plans + upload rental metadata to Supabase.
 * Idempotent: re-uses plan PDAs whose accounts already exist; metadata
 * upload uses upsert.
 *
 * Plan ids 100..104 are reserved for rentals (seed-demo-plans uses 1..5).
 *
 * Run after `init-fee-config` (subscription Config must exist):
 *   npm run seed-rentals
 *
 * Env (with sensible defaults):
 *   SOLANA_RPC_URL          (default: api.devnet.solana.com)
 *   SOLANA_WALLET_PATH      (default: ~/.config/solana/id-devnet.json)
 *   SUPABASE_URL            (required for metadata upload)
 *   SUPABASE_ANON_KEY       (required for metadata upload — public asset-media bucket allows anon upsert)
 */

import pkg from "@coral-xyz/anchor";
const { AnchorProvider, BN, Program, Wallet } = pkg;
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { Connection, Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";

import subscriptionIdl from "../web/idl/subscription.json" with { type: "json" };

const RPC_URL = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
const WALLET_PATH =
  process.env.SOLANA_WALLET_PATH ?? `${homedir()}/.config/solana/id-devnet.json`;

const SUPABASE_URL = process.env.SUPABASE_URL ?? "https://xvgxaodxylrolkpyuszx.supabase.co";
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ?? "sb_publishable_J3YZ2Lpx2k3UUF3xBF_VSA_xLS7GR_D";

const USDC_MINT = new PublicKey("73w3ocXSe2yDMWTHj1kwQxrbNjUY9tBJP9HYDkcpmh7h");
const USDC_DECIMALS = 6;
const USDC_UNIT = 10n ** BigInt(USDC_DECIMALS);

const PLAN_SEED = Buffer.from("plan");
const VAULT_SEED = Buffer.from("vault");

const ASSET_MEDIA_BUCKET = "asset-media";

type RentalSpec = {
  /** Deterministic plan id (100..) so reruns are idempotent. */
  planId: bigint;
  priceUsdc: number;
  periodSeconds: number;
  periodLabel: string;
  metadata: {
    title: string;
    description: string;
    gallery: string[];
    location: { address: string; lat?: number; lng?: number };
    amenities: string[];
    terms: string;
    allowChat: boolean;
  };
};

const RENTALS: RentalSpec[] = [
  {
    planId: 100n,
    priceUsdc: 480,
    periodSeconds: 30 * 86_400,
    periodLabel: "monthly",
    metadata: {
      title: "Belgrade studio — Vračar",
      description:
        "Renovated 38 m² studio in Vračar, 5 min walk to Slavija. Quiet building, fast wi-fi, fully equipped kitchen. Ideal for digital nomads on Solana hours.",
      gallery: [
        "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200&q=80",
        "https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=1200&q=80",
      ],
      location: { address: "Vračar, Belgrade, Serbia", lat: 44.7989, lng: 20.4708 },
      amenities: ["Wi-Fi 1 Gbps", "Air-con", "Washer", "Dishwasher", "Smart-lock"],
      terms: "30-day minimum stay, 14-day cancellation, no smoking, no parties.",
      allowChat: true,
    },
  },
  {
    planId: 101n,
    priceUsdc: 950,
    periodSeconds: 30 * 86_400,
    periodLabel: "monthly",
    metadata: {
      title: "Novi Sad penthouse — central",
      description:
        "85 m² 2-bedroom penthouse with rooftop terrace overlooking the Danube. Walking distance to EXIT festival routes; ideal during festival season.",
      gallery: [
        "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=1200&q=80",
        "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200&q=80",
      ],
      location: { address: "Centar, Novi Sad, Serbia", lat: 45.2671, lng: 19.8335 },
      amenities: ["Rooftop terrace", "Wi-Fi 500 Mbps", "Parking", "Smart-TV", "Coffee machine"],
      terms: "30-day minimum, EXIT week premium pricing, security deposit on subscribe.",
      allowChat: true,
    },
  },
  {
    planId: 102n,
    priceUsdc: 350,
    periodSeconds: 7 * 86_400,
    periodLabel: "weekly",
    metadata: {
      title: "Kopaonik ski apartment",
      description:
        "Cozy 2-bedroom apartment 200 m from the main lift. Sleeps 4. Boot-warmer, ski storage, ski-in-ski-out access via Karaman.",
      gallery: [
        "https://images.unsplash.com/photo-1454496522488-7a8e488e8606?w=1200&q=80",
        "https://images.unsplash.com/photo-1551524559-8af4e6624178?w=1200&q=80",
      ],
      location: { address: "Kopaonik, Serbia", lat: 43.2898, lng: 20.8089 },
      amenities: ["Fireplace", "Ski storage", "Boot-warmer", "Mountain view", "Hot tub"],
      terms: "7-day minimum, December–March only, security deposit on subscribe.",
      allowChat: true,
    },
  },
  {
    planId: 103n,
    priceUsdc: 1500,
    periodSeconds: 30 * 86_400,
    periodLabel: "monthly",
    metadata: {
      title: "Coworking suite — Belgrade Tech Park",
      description:
        "Private 4-desk suite inside Belgrade Tech Park co-working. 24/7 access, 1 Gbps fiber, meeting room credits, espresso bar. Ideal for a small startup team.",
      gallery: [
        "https://images.unsplash.com/photo-1497366216548-37526070297c?w=1200&q=80",
        "https://images.unsplash.com/photo-1497366754035-f200968a6e72?w=1200&q=80",
      ],
      location: { address: "Belgrade Tech Park, Belgrade, Serbia", lat: 44.8167, lng: 20.4574 },
      amenities: ["1 Gbps fiber", "24/7 access", "Meeting rooms", "Espresso bar", "Printer"],
      terms: "Monthly rolling, 14-day cancellation, includes 4 named seats.",
      allowChat: true,
    },
  },
  {
    planId: 104n,
    priceUsdc: 220,
    periodSeconds: 7 * 86_400,
    periodLabel: "weekly",
    metadata: {
      title: "Fruška Gora vineyard cottage",
      description:
        "Stone cottage on a small organic vineyard. 1 bedroom, garden with grill, tasting access. Quiet weekend retreat 1h from Belgrade.",
      gallery: [
        "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=1200&q=80",
        "https://images.unsplash.com/photo-1506377247377-2a5b3b417ebb?w=1200&q=80",
      ],
      location: { address: "Fruška Gora, Serbia", lat: 45.1607, lng: 19.7128 },
      amenities: ["Garden grill", "Wine tasting", "Wi-Fi", "Mountain bike rental"],
      terms: "7-day minimum, weekend stays welcome, no parties.",
      allowChat: true,
    },
  },
];

function loadKeypair(path: string): Keypair {
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(path, "utf8"))));
}

async function uploadMetadata(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  planAddress: string,
  metadata: RentalSpec["metadata"]
): Promise<string> {
  const key = `rental-metadata/${planAddress}.json`;
  const body = JSON.stringify(metadata, null, 2);
  const { error } = await supabase.storage
    .from(ASSET_MEDIA_BUCKET)
    .upload(key, new Blob([body], { type: "application/json" }), {
      contentType: "application/json",
      upsert: true,
    });
  if (error) throw error;
  const { data } = supabase.storage.from(ASSET_MEDIA_BUCKET).getPublicUrl(key);
  return data.publicUrl;
}

async function main(): Promise<void> {
  const kp = loadKeypair(WALLET_PATH);
  const connection = new Connection(RPC_URL, "confirmed");
  const provider = new AnchorProvider(connection, new Wallet(kp), {
    commitment: "confirmed",
  });
  const program = new Program(subscriptionIdl as never, provider);
  const programId = new PublicKey((subscriptionIdl as { address: string }).address);
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });

  console.log("Landlord:", kp.publicKey.toBase58());
  console.log("Balance:", (await connection.getBalance(kp.publicKey)) / 1e9, "SOL");
  console.log(`Seeding ${RENTALS.length} rentals…\n`);

  let created = 0;
  let metadataUploaded = 0;
  for (let i = 0; i < RENTALS.length; i++) {
    const spec = RENTALS[i];
    const idBuf = Buffer.alloc(8);
    idBuf.writeBigUInt64LE(spec.planId);
    const [planPda] = PublicKey.findProgramAddressSync(
      [PLAN_SEED, kp.publicKey.toBuffer(), idBuf],
      programId
    );
    const [vaultPda] = PublicKey.findProgramAddressSync(
      [VAULT_SEED, planPda.toBuffer()],
      programId
    );

    const existing = await connection.getAccountInfo(planPda);
    if (!existing) {
      const priceBase = BigInt(Math.round(spec.priceUsdc * Number(USDC_UNIT)));
      await (program.methods as Record<string, (...args: unknown[]) => {
        accounts: (a: unknown) => { rpc: () => Promise<string> };
      }>)
        .createPlan(
          new BN(spec.planId.toString()),
          new BN(priceBase.toString()),
          new BN(spec.periodSeconds)
        )
        .accounts({
          creator: kp.publicKey,
          mint: USDC_MINT,
          plan: planPda,
          vault: vaultPda,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      created++;
      console.log(
        `[${i + 1}/${RENTALS.length}] ${spec.metadata.title} — plan created (${planPda.toBase58().slice(0, 8)}…)`
      );
    } else {
      console.log(
        `[${i + 1}/${RENTALS.length}] ${spec.metadata.title} — plan exists, refreshing metadata`
      );
    }

    try {
      const url = await uploadMetadata(supabase, planPda.toBase58(), spec.metadata);
      metadataUploaded++;
      console.log(`         metadata → ${url}`);
    } catch (err) {
      console.warn(`         metadata upload FAILED:`, err);
    }
  }

  console.log(`\n✓ Rentals seeded — ${created} new plans, ${metadataUploaded}/${RENTALS.length} metadata uploads.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
