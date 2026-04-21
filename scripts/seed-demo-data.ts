/**
 * Comprehensive demo seeder for nodosol on devnet.
 *
 * Creates a believable population of assets, listings, OTC deals, and events
 * so visitors landing on /marketplace, /events, /otc see a populated app
 * instead of empty cards.
 *
 * Idempotent: re-running skips items whose PDAs already exist.
 *
 * Run after deploys + RWA + marketplace + OTC + event_tickets configs are
 * initialised:
 *   npm run seed-demo
 *
 * Cost (one-time, devnet): ~5–7 SOL on dev wallet 3E8Z…rqBr
 *   - 20 Token-2022 mints (~0.03 SOL)
 *   - 20 Asset PDAs + ATAs (~0.05 SOL)
 *   - 20 marketplace listings + escrow vaults (~0.05 SOL)
 *   - 20 OTC deals + vaults (~0.05 SOL)
 *   - 10 events + vaults + Merkle trees (max_depth=14, max_buffer_size=64)
 *     ≈ 10 × (0.22 + 0.005) ≈ 2.3 SOL  — bulk of cost
 *   - tx fees ~0.05 SOL
 *
 * Requires Phantom test wallet 6AnFbinF7X12mACTVEGfjWZyzYGAShEscAB5UgV3vHsP to
 * have a USDC ATA already created (via the existing init scripts) so OTC
 * deals can target it as buyer; seller (dev wallet) escrows tokens.
 *
 * Image hosting: each asset's metadata JSON references a public Unsplash photo
 * URL — no upload needed. Metadata JSON itself is uploaded to the existing
 * Supabase asset-media bucket so the on-chain metadata_uri stays under 256
 * chars.
 */

import pkg from "@coral-xyz/anchor";
const { AnchorProvider, BN, Program, Wallet, web3 } = pkg;
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  createInitializeMint2Instruction,
  getAssociatedTokenAddressSync,
  getMintLen,
} from "@solana/spl-token";
import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";

import rwaRegistryIdl from "../web/idl/rwa_registry.json" with { type: "json" };
import rwaMintIdl from "../web/idl/rwa_mint.json" with { type: "json" };
import marketplaceIdl from "../web/idl/marketplace.json" with { type: "json" };
import otcIdl from "../web/idl/otc_deals.json" with { type: "json" };
import eventTicketsIdl from "../web/idl/event_tickets.json" with { type: "json" };

const RPC_URL = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
const WALLET_PATH =
  process.env.SOLANA_WALLET_PATH ?? `${homedir()}/.config/solana/id-devnet.json`;
const PHANTOM_BUYER_PUBKEY = "6AnFbinF7X12mACTVEGfjWZyzYGAShEscAB5UgV3vHsP";

// Metadata URIs point at our own /api/metadata/<slug> endpoint — no upload
// step needed. The catalog is served statically from web/lib/seed-catalog.ts.
const METADATA_BASE_URL =
  process.env.METADATA_BASE_URL ?? "https://www.nodosol.com/api/metadata";

const USDC_DECIMALS = 6;
const USDC_UNIT = 10n ** BigInt(USDC_DECIMALS);

const CONFIG_SEED = Buffer.from("config");
const ISSUER_SEED = Buffer.from("issuer");
const ASSET_SEED = Buffer.from("asset");
const LISTING_SEED = Buffer.from("listing");
const VAULT_SEED = Buffer.from("vault");
const DEAL_SEED = Buffer.from("deal");
const EVENT_SEED = Buffer.from("event");

const BUBBLEGUM_PROGRAM_ID = new PublicKey("BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY");
const ACCOUNT_COMPRESSION_PROGRAM_ID = new PublicKey("cmtDvXumGCrqC1Age74AVPhSRVXJMd8PJS91L8KbNCK");
const NOOP_PROGRAM_ID = new PublicKey("noopb9bkMVfRPU8AsbpTUg8AQkHtKwMYZiFUjNRtMmV");
const MERKLE_TREE_ACCOUNT_SIZE = 31_800;

// --- Catalog --------------------------------------------------------------

type Category = "commodity" | "ticket" | "realEstate" | "other";

type AssetSpec = {
  slug: string;
  name: string;
  symbol: string;
  category: Category;
  quantity: number;
  deliveryRequired: boolean;
  description: string;
  imageUrl: string;
  // Per-token list price (USDC) — used by the listing pass.
  listPriceUsdc: number;
  listQuantity: number;
};

// Curated Unsplash photos chosen for theme + free reuse rights.
const ASSETS: AssetSpec[] = [
  {
    slug: "organic-wheat-pannonia",
    name: "Organic Wheat Package — Pannonia",
    symbol: "OWP",
    category: "commodity",
    quantity: 50,
    deliveryRequired: true,
    description:
      "Certified organic winter wheat from Pannonian farms. Each token represents 1 tonne, delivered FOB Belgrade port.",
    imageUrl: "https://images.unsplash.com/photo-1574323347407-f5e1ad6d020b?w=900&q=80",
    listPriceUsdc: 220,
    listQuantity: 30,
  },
  {
    slug: "barley-harvest-23",
    name: "Pannonian Barley Harvest",
    symbol: "PBL",
    category: "commodity",
    quantity: 80,
    deliveryRequired: true,
    description:
      "Two-row malting barley, 11.5% protein, suitable for breweries. 1 token = 1 tonne.",
    imageUrl: "https://images.unsplash.com/photo-1601593768799-76e8261aa1be?w=900&q=80",
    listPriceUsdc: 180,
    listQuantity: 50,
  },
  {
    slug: "apple-orchard-yields",
    name: "Apple Orchard Yields",
    symbol: "APL",
    category: "commodity",
    quantity: 100,
    deliveryRequired: true,
    description:
      "Mixed-variety table apples (Idared, Granny Smith, Jonagold). 1 token = 1 crate (18 kg).",
    imageUrl: "https://images.unsplash.com/photo-1568702846914-96b305d2aaeb?w=900&q=80",
    listPriceUsdc: 22,
    listQuantity: 70,
  },
  {
    slug: "plum-crop-fruska-gora",
    name: "Plum Crop — Fruška Gora",
    symbol: "PLM",
    category: "commodity",
    quantity: 60,
    deliveryRequired: true,
    description:
      "Premium Pozegača plums for fresh and dried market. 1 token = 1 crate (10 kg).",
    imageUrl: "https://images.unsplash.com/photo-1500828060116-fb40c66898e6?w=900&q=80",
    listPriceUsdc: 18,
    listQuantity: 45,
  },
  {
    slug: "honey-cooperative",
    name: "Highland Honey Cooperative",
    symbol: "HNY",
    category: "commodity",
    quantity: 40,
    deliveryRequired: true,
    description:
      "Raw acacia honey from Tara mountain apiaries. 1 token = 1 kg jar with cooperative seal.",
    imageUrl: "https://images.unsplash.com/photo-1587049352846-4a222e784d38?w=900&q=80",
    listPriceUsdc: 14,
    listQuantity: 30,
  },
  {
    slug: "olive-oil-reserve",
    name: "Mediterranean Olive Oil Reserve",
    symbol: "OIL",
    category: "commodity",
    quantity: 30,
    deliveryRequired: true,
    description:
      "First cold pressed extra-virgin olive oil from Adriatic groves. 1 token = 1 L bottle.",
    imageUrl: "https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=900&q=80",
    listPriceUsdc: 16,
    listQuantity: 20,
  },
  {
    slug: "mountain-cheese-aged",
    name: "Mountain Cheese — 12-month Aged",
    symbol: "CHS",
    category: "commodity",
    quantity: 25,
    deliveryRequired: true,
    description:
      "Hard sheep cheese aged 12 months in Durmitor caves. 1 token = 1 kg wedge.",
    imageUrl: "https://images.unsplash.com/photo-1486297678162-eb2a19b0a32d?w=900&q=80",
    listPriceUsdc: 32,
    listQuantity: 18,
  },
  {
    slug: "vineyard-fruska-gora",
    name: "Vineyard Reserve — Fruška Gora",
    symbol: "VIN",
    category: "commodity",
    quantity: 40,
    deliveryRequired: true,
    description:
      "Bermet dessert wine from heritage Fruška Gora vineyards. 1 token = 1 bottle (0.5 L).",
    imageUrl: "https://images.unsplash.com/photo-1506377247377-2a5b3b417ebb?w=900&q=80",
    listPriceUsdc: 28,
    listQuantity: 25,
  },
  {
    slug: "festival-exit-2026",
    name: "Festival Pass — Summer 2026",
    symbol: "FST",
    category: "ticket",
    quantity: 200,
    deliveryRequired: false,
    description:
      "Three-day festival pass for the Summer 2026 edition. Includes camping access. Token = ticket.",
    imageUrl: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=900&q=80",
    listPriceUsdc: 95,
    listQuantity: 120,
  },
  {
    slug: "concert-philharmonic",
    name: "Belgrade Philharmonic — Spring Series",
    symbol: "PHI",
    category: "ticket",
    quantity: 80,
    deliveryRequired: false,
    description:
      "Single-ticket admission to the Spring Concert Series. Seat assigned at check-in.",
    imageUrl: "https://images.unsplash.com/photo-1465847899084-d164df4dedc6?w=900&q=80",
    listPriceUsdc: 35,
    listQuantity: 50,
  },
  {
    slug: "basketball-cup-final",
    name: "Basketball Cup — Final Four",
    symbol: "B4F",
    category: "ticket",
    quantity: 150,
    deliveryRequired: false,
    description:
      "Two-day Final Four pass at Štark Arena. Includes both semi-finals and final. 1 token = 1 ticket.",
    imageUrl: "https://images.unsplash.com/photo-1546519638-68e109498ffc?w=900&q=80",
    listPriceUsdc: 60,
    listQuantity: 80,
  },
  {
    slug: "theater-yugoslav-drama",
    name: "Yugoslav Drama Theatre — Premiere Night",
    symbol: "YDT",
    category: "ticket",
    quantity: 60,
    deliveryRequired: false,
    description:
      "Premiere night seat for the spring production. Champagne reception included.",
    imageUrl: "https://images.unsplash.com/photo-1503095396549-807759245b35?w=900&q=80",
    listPriceUsdc: 42,
    listQuantity: 40,
  },
  {
    slug: "apartment-belgrade-vracar",
    name: "Belgrade — Vračar Apartment Share",
    symbol: "VRC",
    category: "realEstate",
    quantity: 100,
    deliveryRequired: false,
    description:
      "1/100th fractional ownership of a 65 m² Vračar apartment, professionally managed for short-term rental.",
    imageUrl: "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=900&q=80",
    listPriceUsdc: 1500,
    listQuantity: 60,
  },
  {
    slug: "mountain-cabin-tara",
    name: "Mountain Cabin — Tara",
    symbol: "TARA",
    category: "realEstate",
    quantity: 50,
    deliveryRequired: false,
    description:
      "1/50th fractional ownership of a Tara mountain cabin (90 m²), revenue-managed.",
    imageUrl: "https://images.unsplash.com/photo-1518780664697-55e3ad937233?w=900&q=80",
    listPriceUsdc: 800,
    listQuantity: 30,
  },
  {
    slug: "farmland-vojvodina",
    name: "Vojvodina Farmland — 5 ha",
    symbol: "FRM",
    category: "realEstate",
    quantity: 50,
    deliveryRequired: false,
    description:
      "1/50th of 5 hectares of class-1 Vojvodina farmland; lease income distributed to holders.",
    imageUrl: "https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=900&q=80",
    listPriceUsdc: 600,
    listQuantity: 30,
  },
  {
    slug: "warehouse-port-bar",
    name: "Port of Bar Warehouse Slot",
    symbol: "WHB",
    category: "realEstate",
    quantity: 30,
    deliveryRequired: false,
    description:
      "1/30th of a 1 200 m² bonded warehouse slot at the Port of Bar; long-lease income.",
    imageUrl: "https://images.unsplash.com/photo-1553413077-190dd305871c?w=900&q=80",
    listPriceUsdc: 1200,
    listQuantity: 18,
  },
  {
    slug: "bond-balkan-infra-26",
    name: "Balkan Infrastructure Bond 2026",
    symbol: "BIB",
    category: "other",
    quantity: 200,
    deliveryRequired: false,
    description:
      "Tokenised tranche of a private infrastructure bond, 7% coupon, 24-month tenor.",
    imageUrl: "https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=900&q=80",
    listPriceUsdc: 100,
    listQuantity: 120,
  },
  {
    slug: "equity-ag-coop",
    name: "Pannonia Ag Cooperative Equity",
    symbol: "PAE",
    category: "other",
    quantity: 100,
    deliveryRequired: false,
    description:
      "Equity tranche in a 12-farm cooperative aggregating wheat, barley, and corn supply.",
    imageUrl: "https://images.unsplash.com/photo-1535398089889-dd807df1dfaa?w=900&q=80",
    listPriceUsdc: 85,
    listQuantity: 60,
  },
  {
    slug: "carbon-tara-reforestation",
    name: "Tara Reforestation Carbon Credit",
    symbol: "CO2",
    category: "other",
    quantity: 500,
    deliveryRequired: false,
    description:
      "VCS-verified 1 t CO₂ credits from Tara mountain reforestation programme.",
    imageUrl: "https://images.unsplash.com/photo-1511497584788-876760111969?w=900&q=80",
    listPriceUsdc: 18,
    listQuantity: 250,
  },
  {
    slug: "olive-oil-export-pool",
    name: "Olive Oil Export Pool — 2026",
    symbol: "OEP",
    category: "other",
    quantity: 80,
    deliveryRequired: false,
    description:
      "Pool exposure to the 2026 Adriatic olive oil export run. Settles in USDC at season close.",
    imageUrl: "https://images.unsplash.com/photo-1601000938259-9e92002320b2?w=900&q=80",
    listPriceUsdc: 140,
    listQuantity: 50,
  },
];

// Events — fewer because each Merkle tree is ~0.22 SOL of rent.
type EventSpec = {
  slug: string;
  name: string;
  symbol: string;
  capacity: number;
  priceUsdc: number;
  durationHours: number;
  imageUrl: string;
  description: string;
  initTree: boolean;
};

const EVENTS: EventSpec[] = [
  {
    slug: "exit-summer-2026",
    name: "Exit Festival 2026",
    symbol: "EXT",
    capacity: 500,
    priceUsdc: 95,
    durationHours: 24 * 30,
    imageUrl: "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=900&q=80",
    description: "Four-day flagship festival at Petrovaradin Fortress, Novi Sad.",
    initTree: true,
  },
  {
    slug: "sea-dance-2026",
    name: "Sea Dance Festival 2026",
    symbol: "SDC",
    capacity: 300,
    priceUsdc: 75,
    durationHours: 24 * 30,
    imageUrl: "https://images.unsplash.com/photo-1506157786151-b8491531f063?w=900&q=80",
    description: "Beachfront electronic music festival at Buljarica Bay.",
    initTree: true,
  },
  {
    slug: "philharmonic-spring",
    name: "Philharmonic Spring Series",
    symbol: "PSS",
    capacity: 100,
    priceUsdc: 35,
    durationHours: 24 * 14,
    imageUrl: "https://images.unsplash.com/photo-1465847899084-d164df4dedc6?w=900&q=80",
    description: "Five-concert spring series at Kolarac Hall.",
    initTree: true,
  },
  {
    slug: "basketball-final-four",
    name: "Basketball Cup — Final Four",
    symbol: "B4F",
    capacity: 200,
    priceUsdc: 60,
    durationHours: 24 * 7,
    imageUrl: "https://images.unsplash.com/photo-1546519638-68e109498ffc?w=900&q=80",
    description: "ABA League Final Four at Štark Arena.",
    initTree: true,
  },
  {
    slug: "volleyball-grand-prix",
    name: "Volleyball Grand Prix",
    symbol: "VGP",
    capacity: 150,
    priceUsdc: 25,
    durationHours: 24 * 5,
    imageUrl: "https://images.unsplash.com/photo-1612872087720-bb876e2e67d1?w=900&q=80",
    description: "International women's volleyball Grand Prix.",
    initTree: true,
  },
  {
    slug: "handball-cup-finale",
    name: "Handball Cup Finale",
    symbol: "HCF",
    capacity: 120,
    priceUsdc: 22,
    durationHours: 24 * 3,
    imageUrl: "https://images.unsplash.com/photo-1577962917302-cd874c4e31d2?w=900&q=80",
    description: "ARKUS Handball Cup final weekend.",
    initTree: true,
  },
  {
    slug: "theatre-premiere-night",
    name: "Drama Theatre Premiere Night",
    symbol: "DTH",
    capacity: 80,
    priceUsdc: 42,
    durationHours: 24,
    imageUrl: "https://images.unsplash.com/photo-1503095396549-807759245b35?w=900&q=80",
    description: "Yugoslav Drama Theatre season opener.",
    initTree: true,
  },
  {
    slug: "tech-conference-bg",
    name: "Belgrade Tech Conference 2026",
    symbol: "BTC",
    capacity: 250,
    priceUsdc: 120,
    durationHours: 24 * 60,
    imageUrl: "https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=900&q=80",
    description: "Two-day developer + founder conference at Sava Centar.",
    initTree: true,
  },
  {
    slug: "wine-fair-fruska",
    name: "Fruška Gora Wine Fair",
    symbol: "FWF",
    capacity: 180,
    priceUsdc: 30,
    durationHours: 24 * 14,
    imageUrl: "https://images.unsplash.com/photo-1506377247377-2a5b3b417ebb?w=900&q=80",
    description: "Annual Fruška Gora wine fair with 40 wineries.",
    initTree: true,
  },
  {
    slug: "exhibition-modern-art",
    name: "Museum of Contemporary Art — Spring Exhibit",
    symbol: "MCA",
    capacity: 220,
    priceUsdc: 18,
    durationHours: 24 * 90,
    imageUrl: "https://images.unsplash.com/photo-1577720580479-7d839d829c73?w=900&q=80",
    description: "90-day spring exhibition at MoCA Belgrade.",
    initTree: true,
  },
];

// --- Helpers --------------------------------------------------------------

function loadKeypair(path: string): Keypair {
  const raw = JSON.parse(readFileSync(path, "utf8"));
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

function categoryToAnchor(c: Category): Record<string, Record<string, never>> {
  return { [c]: {} };
}

function metadataUriFor(slug: string, isEvent: boolean): string {
  const key = isEvent ? `event-${slug}` : slug;
  return `${METADATA_BASE_URL}/${key}`;
}

function makeMetadataJson(spec: AssetSpec | EventSpec, opts: { isEvent: boolean }): unknown {
  if (opts.isEvent) {
    const e = spec as EventSpec;
    return {
      name: e.name,
      symbol: e.symbol,
      description: e.description,
      image: e.imageUrl,
      attributes: [
        { trait_type: "type", value: "event_ticket" },
        { trait_type: "capacity", value: e.capacity },
      ],
    };
  }
  const a = spec as AssetSpec;
  return {
    name: a.name,
    symbol: a.symbol,
    description: a.description,
    image: a.imageUrl,
    attributes: [
      { trait_type: "category", value: a.category },
      { trait_type: "delivery_required", value: a.deliveryRequired },
    ],
    properties: {
      category: a.category,
      delivery_required: a.deliveryRequired,
    },
  };
}

async function sendIxs(
  connection: Connection,
  payer: Keypair,
  ixs: Parameters<Transaction["add"]>[0][],
  signers: Keypair[] = []
): Promise<string> {
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  const tx = new Transaction({ feePayer: payer.publicKey, recentBlockhash: blockhash });
  for (const ix of ixs) tx.add(ix);
  tx.sign(payer, ...signers);
  const sig = await connection.sendRawTransaction(tx.serialize());
  await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
  return sig;
}

// --- Main -----------------------------------------------------------------

async function main() {
  const dev = loadKeypair(WALLET_PATH);
  const buyer = new PublicKey(PHANTOM_BUYER_PUBKEY);
  const connection = new Connection(RPC_URL, "confirmed");
  const wallet = new Wallet(dev);
  const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });

  console.log("Dev wallet:", dev.publicKey.toBase58());
  const balance = await connection.getBalance(dev.publicKey);
  console.log("Balance:", balance / web3.LAMPORTS_PER_SOL, "SOL");

  const rwaRegistry = new Program(rwaRegistryIdl as never, provider);
  const rwaMint = new Program(rwaMintIdl as never, provider);
  const marketplace = new Program(marketplaceIdl as never, provider);
  const otc = new Program(otcIdl as never, provider);
  const eventTickets = new Program(eventTicketsIdl as never, provider);

  const [issuerPda] = PublicKey.findProgramAddressSync(
    [ISSUER_SEED, dev.publicKey.toBuffer()],
    rwaRegistry.programId
  );
  const [marketplaceConfig] = PublicKey.findProgramAddressSync([CONFIG_SEED], marketplace.programId);
  const [otcConfig] = PublicKey.findProgramAddressSync([CONFIG_SEED], otc.programId);
  const [eventConfig] = PublicKey.findProgramAddressSync([CONFIG_SEED], eventTickets.programId);

  // Resolve mock USDC mint from previous init runs.
  const stateDoc = JSON.parse(
    readFileSync(`${import.meta.dirname}/devnet-state.json`, "utf8")
  );
  const usdcMint = new PublicKey(stateDoc.mint);
  console.log("USDC mint:", usdcMint.toBase58());

  // Treasury ATA from existing config.
  const cfgFetcher = (program: Program, name: string) =>
    (program.account as Record<string, { fetch: (a: PublicKey) => Promise<{ treasury: PublicKey }> }>)[name];

  const marketplaceCfg = await cfgFetcher(marketplace, "config").fetch(marketplaceConfig);
  const otcCfg = await cfgFetcher(otc, "config").fetch(otcConfig);
  const eventCfg = await cfgFetcher(eventTickets, "config").fetch(eventConfig);

  // --- Pass 1: tokenize 20 assets ---------------------------------------
  console.log("\n=== TOKENIZE 20 ASSETS ===");
  const assetMintByIndex = new Map<number, PublicKey>();
  for (let i = 0; i < ASSETS.length; i++) {
    const spec = ASSETS[i];
    const assetId = BigInt(1000 + i); // deterministic asset ids
    const [assetPda] = PublicKey.findProgramAddressSync(
      [ASSET_SEED, dev.publicKey.toBuffer(), Buffer.from(new BigUint64Array([assetId]).buffer)],
      rwaMint.programId
    );

    const existing = await connection.getAccountInfo(assetPda);
    if (existing) {
      const fetched = await (rwaMint.account as Record<string, { fetch: (a: PublicKey) => Promise<{ mint: PublicKey }> }>).asset.fetch(assetPda);
      console.log(`[${i + 1}/${ASSETS.length}] ${spec.symbol} already exists — mint ${fetched.mint.toBase58().slice(0, 8)}…`);
      assetMintByIndex.set(i, fetched.mint);
      continue;
    }

    // Generate Token-2022 mint, ATA, then call tokenize_asset.
    const mintKp = Keypair.generate();
    const mintLen = getMintLen([]);
    const mintRent = await connection.getMinimumBalanceForRentExemption(mintLen);
    const issuerAta = getAssociatedTokenAddressSync(mintKp.publicKey, dev.publicKey, false, TOKEN_2022_PROGRAM_ID);

    const metadataUrl = metadataUriFor(spec.slug, false);

    const tokenizeIx = await rwaMint.methods
      .tokenizeAsset(
        new BN(assetId.toString()),
        categoryToAnchor(spec.category),
        new BN(spec.quantity),
        spec.deliveryRequired,
        spec.name,
        spec.symbol,
        metadataUrl
      )
      .accounts({
        issuerOwner: dev.publicKey,
        issuer: issuerPda,
        asset: assetPda,
        mint: mintKp.publicKey,
        issuerTokenAccount: issuerAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .instruction();

    const sig = await sendIxs(
      connection,
      dev,
      [
        ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
        SystemProgram.createAccount({
          fromPubkey: dev.publicKey,
          newAccountPubkey: mintKp.publicKey,
          space: mintLen,
          lamports: mintRent,
          programId: TOKEN_2022_PROGRAM_ID,
        }),
        createInitializeMint2Instruction(mintKp.publicKey, 0, dev.publicKey, null, TOKEN_2022_PROGRAM_ID),
        createAssociatedTokenAccountInstruction(
          dev.publicKey,
          issuerAta,
          dev.publicKey,
          mintKp.publicKey,
          TOKEN_2022_PROGRAM_ID
        ),
        tokenizeIx,
      ],
      [mintKp]
    );
    console.log(`[${i + 1}/${ASSETS.length}] ${spec.symbol} tokenised — mint ${mintKp.publicKey.toBase58().slice(0, 8)}… sig ${sig.slice(0, 8)}…`);
    assetMintByIndex.set(i, mintKp.publicKey);
  }

  // --- Pass 2: marketplace listings -------------------------------------
  console.log("\n=== CREATE 20 LISTINGS ===");
  for (let i = 0; i < ASSETS.length; i++) {
    const spec = ASSETS[i];
    const mint = assetMintByIndex.get(i);
    if (!mint) continue;
    const [listing] = PublicKey.findProgramAddressSync(
      [LISTING_SEED, dev.publicKey.toBuffer(), mint.toBuffer()],
      marketplace.programId
    );
    const existing = await connection.getAccountInfo(listing);
    if (existing) {
      console.log(`[${i + 1}/${ASSETS.length}] ${spec.symbol} listing exists`);
      continue;
    }
    const [vault] = PublicKey.findProgramAddressSync(
      [VAULT_SEED, listing.toBuffer()],
      marketplace.programId
    );
    const sellerAta = getAssociatedTokenAddressSync(mint, dev.publicKey, false, TOKEN_2022_PROGRAM_ID);
    const priceBase = BigInt(Math.round(spec.listPriceUsdc * Number(USDC_UNIT)));
    const ix = await marketplace.methods
      .createListing(new BN(priceBase.toString()), new BN(spec.listQuantity))
      .accounts({
        seller: dev.publicKey,
        assetMint: mint,
        paymentMint: usdcMint,
        listing,
        vault,
        sellerAssetAccount: sellerAta,
        assetTokenProgram: TOKEN_2022_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .instruction();
    const sig = await sendIxs(connection, dev, [
      ComputeBudgetProgram.setComputeUnitLimit({ units: 300_000 }),
      ix,
    ]);
    console.log(`[${i + 1}/${ASSETS.length}] ${spec.symbol} listed @ $${spec.listPriceUsdc} × ${spec.listQuantity} — sig ${sig.slice(0, 8)}…`);
  }

  // --- Pass 3: OTC deals (dev → phantom buyer) --------------------------
  console.log("\n=== CREATE 20 OTC DEALS ===");
  for (let i = 0; i < 20; i++) {
    const spec = ASSETS[i];
    const mint = assetMintByIndex.get(i);
    if (!mint) continue;
    const dealId = BigInt(2000 + i);
    const [dealPda] = PublicKey.findProgramAddressSync(
      [
        DEAL_SEED,
        dev.publicKey.toBuffer(),
        buyer.toBuffer(),
        Buffer.from(new BigUint64Array([dealId]).buffer),
      ],
      otc.programId
    );
    const existing = await connection.getAccountInfo(dealPda);
    if (existing) {
      console.log(`[${i + 1}/20] OTC deal #${dealId} exists`);
      continue;
    }
    const [vault] = PublicKey.findProgramAddressSync(
      [VAULT_SEED, dealPda.toBuffer()],
      otc.programId
    );
    const sellerAta = getAssociatedTokenAddressSync(mint, dev.publicKey, false, TOKEN_2022_PROGRAM_ID);
    const quantity = Math.min(3, spec.quantity);
    const totalPrice = quantity * spec.listPriceUsdc * 0.92; // 8% off vs listing price
    const totalBase = BigInt(Math.round(totalPrice * Number(USDC_UNIT)));
    const expiresAt = Math.floor(Date.now() / 1000) + 86_400 * 7; // 7 days
    const memo = `Demo OTC for ${spec.name} (${quantity} units)`;
    const memoHash = Array.from(crypto.createHash("sha256").update(memo).digest());

    const ix = await otc.methods
      .proposeDeal(
        new BN(dealId.toString()),
        new BN(quantity),
        new BN(totalBase.toString()),
        new BN(expiresAt),
        memoHash
      )
      .accounts({
        seller: dev.publicKey,
        buyer,
        assetMint: mint,
        paymentMint: usdcMint,
        deal: dealPda,
        vault,
        sellerAssetAccount: sellerAta,
        assetTokenProgram: TOKEN_2022_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .instruction();
    try {
      const sig = await sendIxs(connection, dev, [
        ComputeBudgetProgram.setComputeUnitLimit({ units: 350_000 }),
        ix,
      ]);
      console.log(`[${i + 1}/20] OTC deal #${dealId} (${spec.symbol}) proposed — sig ${sig.slice(0, 8)}…`);
    } catch (err) {
      console.warn(`[${i + 1}/20] OTC deal #${dealId} failed:`, err instanceof Error ? err.message : err);
    }
  }

  // --- Pass 4: events with Merkle trees ---------------------------------
  console.log("\n=== CREATE 10 EVENTS (with Merkle trees) ===");
  for (let i = 0; i < EVENTS.length; i++) {
    const spec = EVENTS[i];
    const eventId = BigInt(3000 + i);
    const [eventPda] = PublicKey.findProgramAddressSync(
      [EVENT_SEED, dev.publicKey.toBuffer(), Buffer.from(new BigUint64Array([eventId]).buffer)],
      eventTickets.programId
    );
    const [vault] = PublicKey.findProgramAddressSync(
      [VAULT_SEED, eventPda.toBuffer()],
      eventTickets.programId
    );

    const existing = await connection.getAccountInfo(eventPda);
    if (existing) {
      console.log(`[${i + 1}/${EVENTS.length}] ${spec.symbol} event exists`);
      continue;
    }

    const metadataUrl = metadataUriFor(spec.slug, true);

    const startsAt = Math.floor(Date.now() / 1000);
    const endsAt = startsAt + spec.durationHours * 3600;
    const priceBase = BigInt(Math.round(spec.priceUsdc * Number(USDC_UNIT)));

    const createIx = await eventTickets.methods
      .createEvent(
        new BN(eventId.toString()),
        new BN(priceBase.toString()),
        new BN(spec.capacity),
        new BN(startsAt),
        new BN(endsAt),
        spec.name,
        spec.symbol,
        metadataUrl
      )
      .accounts({
        creator: dev.publicKey,
        paymentMint: usdcMint,
        event: eventPda,
        vault,
        paymentTokenProgram: TOKEN_2022_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .instruction();

    const sig = await sendIxs(connection, dev, [
      ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
      createIx,
    ]);
    console.log(`[${i + 1}/${EVENTS.length}] ${spec.symbol} event created — sig ${sig.slice(0, 8)}…`);

    if (spec.initTree) {
      const merkleTreeKp = Keypair.generate();
      const rent = await connection.getMinimumBalanceForRentExemption(MERKLE_TREE_ACCOUNT_SIZE);
      const [treeConfig] = PublicKey.findProgramAddressSync(
        [merkleTreeKp.publicKey.toBuffer()],
        BUBBLEGUM_PROGRAM_ID
      );
      const initTreeIx = await eventTickets.methods
        .initializeEventTree()
        .accounts({
          creator: dev.publicKey,
          event: eventPda,
          treeConfig,
          merkleTree: merkleTreeKp.publicKey,
          bubblegumProgram: BUBBLEGUM_PROGRAM_ID,
          compressionProgram: ACCOUNT_COMPRESSION_PROGRAM_ID,
          logWrapper: NOOP_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .instruction();
      try {
        const treeSig = await sendIxs(
          connection,
          dev,
          [
            ComputeBudgetProgram.setComputeUnitLimit({ units: 500_000 }),
            SystemProgram.createAccount({
              fromPubkey: dev.publicKey,
              newAccountPubkey: merkleTreeKp.publicKey,
              space: MERKLE_TREE_ACCOUNT_SIZE,
              lamports: rent,
              programId: ACCOUNT_COMPRESSION_PROGRAM_ID,
            }),
            initTreeIx,
          ],
          [merkleTreeKp]
        );
        console.log(`         tree initialised — sig ${treeSig.slice(0, 8)}…`);
      } catch (err) {
        console.warn(`         tree init failed:`, err instanceof Error ? err.message : err);
      }
    }
  }

  // Touch unused config refs so TS doesn't complain.
  void marketplaceCfg;
  void otcCfg;
  void eventCfg;

  console.log("\n✓ Seed complete. Refresh /marketplace, /marketplace/events, /marketplace/otc to see populated data.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
