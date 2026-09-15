/**
 * Creates TicketTier PDAs for each seeded event on devnet.
 *
 * Each event gets a curated set of tiers matching its assigned venue template.
 * Idempotent — skips tiers whose PDAs already exist.
 *
 * Run after event_tickets program has been upgraded to the multi-tier version
 * (commit b07c073 or later):
 *   npm run seed-tiers
 *
 * Cost: ~0.002 SOL × (10 events × ~6 tiers) = ~0.12 SOL rent + tx fees.
 */

import pkg from "@coral-xyz/anchor";
const { AnchorProvider, BN, Program, Wallet } = pkg;
import { Connection, Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";

import eventTicketsIdl from "../web/idl/event_tickets.json" with { type: "json" };

const RPC_URL = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
const WALLET_PATH =
  process.env.SOLANA_WALLET_PATH ?? `${homedir()}/.config/solana/id-devnet.json`;

const EVENT_SEED = Buffer.from("event");
const TIER_SEED = Buffer.from("tier");

const USDC_DECIMALS = 6;
const USDC_UNIT = 10n ** BigInt(USDC_DECIMALS);

type TierSpec = {
  tierId: number;
  name: string;
  sectionCode: string; // matches VENUE_TEMPLATES tierRef
  priceUsdc: number;
  capacity: number;
  colorHex: string; // "RRGGBB" no hash
};

/// Pre-canned tier sets keyed by venue template id.
const TIER_SETS: Record<string, TierSpec[]> = {
  "arena-circle": [
    { tierId: 1, name: "Floor",  sectionCode: "FLOOR", priceUsdc: 180, capacity: 40,  colorHex: "DC2626" },
    { tierId: 2, name: "101",    sectionCode: "101",   priceUsdc: 120, capacity: 60,  colorHex: "EA580C" },
    { tierId: 3, name: "102",    sectionCode: "102",   priceUsdc: 120, capacity: 60,  colorHex: "EA580C" },
    { tierId: 4, name: "103",    sectionCode: "103",   priceUsdc: 95,  capacity: 80,  colorHex: "F59E0B" },
    { tierId: 5, name: "104",    sectionCode: "104",   priceUsdc: 95,  capacity: 80,  colorHex: "F59E0B" },
    { tierId: 6, name: "105",    sectionCode: "105",   priceUsdc: 110, capacity: 60,  colorHex: "EAB308" },
    { tierId: 7, name: "201",    sectionCode: "201",   priceUsdc: 55,  capacity: 120, colorHex: "22C55E" },
    { tierId: 8, name: "202",    sectionCode: "202",   priceUsdc: 55,  capacity: 120, colorHex: "22C55E" },
    { tierId: 9, name: "203",    sectionCode: "203",   priceUsdc: 45,  capacity: 140, colorHex: "10B981" },
    { tierId: 10, name: "204",   sectionCode: "204",   priceUsdc: 45,  capacity: 140, colorHex: "10B981" },
    { tierId: 11, name: "205",   sectionCode: "205",   priceUsdc: 50,  capacity: 100, colorHex: "14B8A6" },
    { tierId: 12, name: "SRO",   sectionCode: "SRO",   priceUsdc: 25,  capacity: 200, colorHex: "0EA5E9" },
  ],
  "open-air": [
    { tierId: 1, name: "Front pit",   sectionCode: "PIT",   priceUsdc: 145, capacity: 80,  colorHex: "DC2626" },
    { tierId: 2, name: "VIP Left",    sectionCode: "VIP-L", priceUsdc: 220, capacity: 40,  colorHex: "A855F7" },
    { tierId: 3, name: "VIP Right",   sectionCode: "VIP-R", priceUsdc: 220, capacity: 40,  colorHex: "A855F7" },
    { tierId: 4, name: "Mid floor",   sectionCode: "MID",   priceUsdc: 95,  capacity: 120, colorHex: "F59E0B" },
    { tierId: 5, name: "General Admission", sectionCode: "GA", priceUsdc: 45, capacity: 300, colorHex: "22C55E" },
  ],
  "theatre": [
    { tierId: 1, name: "Orchestra A", sectionCode: "ORCH-A",  priceUsdc: 75, capacity: 40, colorHex: "DC2626" },
    { tierId: 2, name: "Orchestra B", sectionCode: "ORCH-B",  priceUsdc: 55, capacity: 50, colorHex: "F59E0B" },
    { tierId: 3, name: "Circle L",    sectionCode: "CIRCLE-L", priceUsdc: 45, capacity: 40, colorHex: "EAB308" },
    { tierId: 4, name: "Circle C",    sectionCode: "CIRCLE-C", priceUsdc: 50, capacity: 50, colorHex: "EAB308" },
    { tierId: 5, name: "Circle R",    sectionCode: "CIRCLE-R", priceUsdc: 45, capacity: 40, colorHex: "EAB308" },
    { tierId: 6, name: "Balcony",     sectionCode: "BALC",     priceUsdc: 25, capacity: 60, colorHex: "22C55E" },
  ],
  "conference": [
    { tierId: 1, name: "Front rows",  sectionCode: "FRONT",  priceUsdc: 220, capacity: 60, colorHex: "DC2626" },
    { tierId: 2, name: "Mid rows",    sectionCode: "MID",    priceUsdc: 150, capacity: 80, colorHex: "F59E0B" },
    { tierId: 3, name: "Back rows",   sectionCode: "BACK",   priceUsdc: 95,  capacity: 80, colorHex: "22C55E" },
    { tierId: 4, name: "Side Left",   sectionCode: "SIDE-L", priceUsdc: 75,  capacity: 30, colorHex: "14B8A6" },
    { tierId: 5, name: "Side Right",  sectionCode: "SIDE-R", priceUsdc: 75,  capacity: 30, colorHex: "14B8A6" },
  ],
};

/// Event slug → event_id + venue template. event_id is generated from the seed
/// script's loop index; matches 1..10 for our current events.
// Event IDs follow seed-demo-data.ts: eventId = 3000 + loop_index (0..9).
const EVENT_TIER_MAP: Array<{ slug: string; eventId: bigint; template: keyof typeof TIER_SETS }> = [
  { slug: "exit-summer-2026",      eventId: 3000n, template: "open-air" },
  { slug: "sea-dance-2026",        eventId: 3001n, template: "open-air" },
  { slug: "philharmonic-spring",   eventId: 3002n, template: "theatre" },
  { slug: "basketball-final-four", eventId: 3003n, template: "arena-circle" },
  { slug: "volleyball-grand-prix", eventId: 3004n, template: "arena-circle" },
  { slug: "handball-cup-finale",   eventId: 3005n, template: "arena-circle" },
  { slug: "theatre-premiere-night", eventId: 3006n, template: "theatre" },
  { slug: "tech-conference-bg",    eventId: 3007n, template: "conference" },
  { slug: "wine-fair-fruska",      eventId: 3008n, template: "conference" },
  { slug: "exhibition-modern-art", eventId: 3009n, template: "theatre" },
];

async function main() {
  const kp = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(readFileSync(WALLET_PATH, "utf8")))
  );
  const connection = new Connection(RPC_URL, "confirmed");
  const provider = new AnchorProvider(connection, new Wallet(kp), {
    commitment: "confirmed",
  });
  const program = new Program(eventTicketsIdl as never, provider);
  const programId = new PublicKey((eventTicketsIdl as { address: string }).address);

  console.log("Creator:", kp.publicKey.toBase58());
  console.log("Balance:", (await connection.getBalance(kp.publicKey)) / 1e9, "SOL\n");

  let createdCount = 0;
  let skippedCount = 0;

  for (const entry of EVENT_TIER_MAP) {
    const idBuf = Buffer.alloc(8);
    idBuf.writeBigUInt64LE(entry.eventId);
    const [eventPda] = PublicKey.findProgramAddressSync(
      [EVENT_SEED, kp.publicKey.toBuffer(), idBuf],
      programId
    );

    // Ensure event exists first (skip cleanly if not).
    const evInfo = await connection.getAccountInfo(eventPda);
    if (!evInfo) {
      console.log(`⚠ ${entry.slug}: event PDA not found — skip`);
      continue;
    }

    const tiers = TIER_SETS[entry.template];
    console.log(`[${entry.slug}] ${entry.template} (${tiers.length} tiers)`);

    for (const tier of tiers) {
      const tierIdBuf = Buffer.alloc(2);
      tierIdBuf.writeUInt16LE(tier.tierId);
      const [tierPda] = PublicKey.findProgramAddressSync(
        [TIER_SEED, eventPda.toBuffer(), tierIdBuf],
        programId
      );
      const existing = await connection.getAccountInfo(tierPda);
      if (existing) {
        skippedCount++;
        continue;
      }
      const priceBase = BigInt(Math.round(tier.priceUsdc * Number(USDC_UNIT)));
      const colorBytes = Array.from(Buffer.from(tier.colorHex.padEnd(6, "0").slice(0, 6), "utf8"));
      const sig = await program.methods
        .createTier(
          tier.tierId,
          tier.name,
          tier.sectionCode,
          new BN(priceBase.toString()),
          tier.capacity,
          colorBytes
        )
        .accounts({
          creator: kp.publicKey,
          event: eventPda,
          tier: tierPda,
          systemProgram: SystemProgram.programId,
        } as never)
        .rpc();
      createdCount++;
      console.log(
        `    #${tier.tierId} ${tier.sectionCode.padEnd(8)} ${tier.name.padEnd(18)} $${String(tier.priceUsdc).padStart(4)} × ${String(tier.capacity).padStart(3)} — sig ${sig.slice(0, 8)}…`
      );
    }
  }

  console.log(`\n✓ Tiers created: ${createdCount}, skipped: ${skippedCount}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
