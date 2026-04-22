import { AnchorProvider, BN, Program, Wallet } from "@coral-xyz/anchor";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import {
  AccountMeta,
  ComputeBudgetProgram,
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import bs58 from "bs58";

type SendableWallet = {
  publicKey: PublicKey | null;
  sendTransaction: (tx: Transaction, connection: Connection) => Promise<string>;
};

import { USDC_UNIT } from "./constants";
import {
  ACCOUNT_COMPRESSION_PROGRAM_ID,
  BUBBLEGUM_PROGRAM_ID,
  EVENT_TICKETS_PROGRAM_ID,
  eventTicketsProgram,
  fetchEventTicketsConfig,
  NOOP_PROGRAM_ID,
  treeConfigPda,
} from "./eventTickets";
import {
  getAssetCompressionDetails,
  getAssetProof,
  HeliusCompressionDetails,
} from "./helius";
import { simulateAndSend } from "./tx";

const RESALE_SEED = Buffer.from("resale");
const ZERO_COMMIT = "0".repeat(64);

function commitToHex(bytes: number[] | Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export type OnChainResaleListing = {
  address: string;
  seller: string;
  event: string;
  merkleTree: string;
  paymentMint: string;
  leafIndex: number;
  nonce: string;
  priceBase: bigint;
  priceUsdc: number;
  /**
   * 32-byte keccak256 commit of (price, nonce). All zeroes when the
   * listing uses plain public pricing.
   */
  priceCommitHex: string;
  isPrivate: boolean;
  createdAt: number;
  expiresAt: number;
};

export function resaleListingPda(
  merkleTree: PublicKey,
  leafIndex: number
): [PublicKey, number] {
  const idxBuf = Buffer.alloc(4);
  idxBuf.writeUInt32LE(leafIndex);
  return PublicKey.findProgramAddressSync(
    [RESALE_SEED, merkleTree.toBuffer(), idxBuf],
    EVENT_TICKETS_PROGRAM_ID
  );
}

export async function fetchAllActiveListings(
  program: Program
): Promise<OnChainResaleListing[]> {
  const api = (program.account as Record<string, {
    all: () => Promise<Array<{
      publicKey: PublicKey;
      account: {
        seller: PublicKey;
        event: PublicKey;
        merkleTree: PublicKey;
        paymentMint: PublicKey;
        leafIndex: number;
        nonce: BN;
        price: BN;
        createdAt: BN;
        priceCommit: number[];
        expiresAt: BN;
      };
    }>>;
  }>).ticketResaleListing;
  const items = await api.all();
  return items.map(({ publicKey, account }) => ({
    address: publicKey.toBase58(),
    seller: account.seller.toBase58(),
    event: account.event.toBase58(),
    merkleTree: account.merkleTree.toBase58(),
    paymentMint: account.paymentMint.toBase58(),
    leafIndex: account.leafIndex,
    nonce: account.nonce.toString(),
    priceBase: BigInt(account.price.toString()),
    priceUsdc: Number(account.price.toString()) / USDC_UNIT,
    priceCommitHex: commitToHex(account.priceCommit),
    isPrivate: commitToHex(account.priceCommit) !== ZERO_COMMIT,
    createdAt: account.createdAt.toNumber(),
    expiresAt: account.expiresAt.toNumber(),
  }));
}

export async function fetchListingsBySeller(
  program: Program,
  seller: PublicKey
): Promise<OnChainResaleListing[]> {
  const api = (program.account as Record<string, {
    all: (filters: unknown[]) => Promise<Array<{
      publicKey: PublicKey;
      account: {
        seller: PublicKey;
        event: PublicKey;
        merkleTree: PublicKey;
        paymentMint: PublicKey;
        leafIndex: number;
        nonce: BN;
        price: BN;
        createdAt: BN;
        priceCommit: number[];
        expiresAt: BN;
      };
    }>>;
  }>).ticketResaleListing;
  const items = await api.all([
    { memcmp: { offset: 8, bytes: seller.toBase58() } },
  ]);
  return items.map(({ publicKey, account }) => ({
    address: publicKey.toBase58(),
    seller: account.seller.toBase58(),
    event: account.event.toBase58(),
    merkleTree: account.merkleTree.toBase58(),
    paymentMint: account.paymentMint.toBase58(),
    leafIndex: account.leafIndex,
    nonce: account.nonce.toString(),
    priceBase: BigInt(account.price.toString()),
    priceUsdc: Number(account.price.toString()) / USDC_UNIT,
    priceCommitHex: commitToHex(account.priceCommit),
    isPrivate: commitToHex(account.priceCommit) !== ZERO_COMMIT,
    createdAt: account.createdAt.toNumber(),
    expiresAt: account.expiresAt.toNumber(),
  }));
}

export async function fetchListingForAsset(
  program: Program,
  merkleTree: PublicKey,
  leafIndex: number
): Promise<OnChainResaleListing | null> {
  const [listingPda] = resaleListingPda(merkleTree, leafIndex);
  const api = (program.account as Record<string, {
    fetchNullable: (addr: PublicKey) => Promise<{
      seller: PublicKey;
      event: PublicKey;
      merkleTree: PublicKey;
      paymentMint: PublicKey;
      leafIndex: number;
      nonce: BN;
      price: BN;
      createdAt: BN;
      priceCommit: number[];
      expiresAt: BN;
    } | null>;
  }>).ticketResaleListing;
  const account = await api.fetchNullable(listingPda);
  if (!account) return null;
  return {
    address: listingPda.toBase58(),
    seller: account.seller.toBase58(),
    event: account.event.toBase58(),
    merkleTree: account.merkleTree.toBase58(),
    paymentMint: account.paymentMint.toBase58(),
    leafIndex: account.leafIndex,
    nonce: account.nonce.toString(),
    priceBase: BigInt(account.price.toString()),
    priceUsdc: Number(account.price.toString()) / USDC_UNIT,
    priceCommitHex: commitToHex(account.priceCommit),
    isPrivate: commitToHex(account.priceCommit) !== ZERO_COMMIT,
    createdAt: account.createdAt.toNumber(),
    expiresAt: account.expiresAt.toNumber(),
  };
}

type BubblegumProofBundle = {
  root: number[];
  dataHash: number[];
  creatorHash: number[];
  nonce: BN;
  leafIndex: number;
  proofAccounts: AccountMeta[];
};

/**
 * Pulls the full Bubblegum proof bundle an ix needs for a given cNFT
 * asset. Caller passes this to the program instruction as the three
 * hash args + remaining_accounts (proofAccounts).
 */
export async function buildProofBundle(assetId: string): Promise<BubblegumProofBundle> {
  const [proof, details] = await Promise.all([
    getAssetProof(assetId),
    getAssetCompressionDetails(assetId),
  ]);
  if (!details) throw new Error("Asset has no compression details — not a cNFT?");
  const root = Array.from(bs58.decode(proof.root));
  const dataHash = Array.from(bs58.decode(details.dataHashBase58));
  const creatorHash = Array.from(bs58.decode(details.creatorHashBase58));
  if (root.length !== 32 || dataHash.length !== 32 || creatorHash.length !== 32) {
    throw new Error("Unexpected hash length from Helius");
  }
  const proofAccounts: AccountMeta[] = proof.proof.map((pubkey) => ({
    pubkey: new PublicKey(pubkey),
    isSigner: false,
    isWritable: false,
  }));
  return {
    root,
    dataHash,
    creatorHash,
    nonce: new BN(details.nonce.toString()),
    leafIndex: details.leafId,
    proofAccounts,
  };
}

export async function listTicketResaleTx(input: {
  connection: Connection;
  wallet: SendableWallet;
  event: PublicKey;
  merkleTree: PublicKey;
  assetId: string;
  priceUsdc: number;
  expiresAt: number | null; // unix seconds, 0 / null for no expiry
}): Promise<string> {
  const { connection, wallet, event, merkleTree, assetId, priceUsdc, expiresAt } = input;
  if (!wallet.publicKey) throw new Error("Wallet not connected");
  const sellerPk = wallet.publicKey;
  const provider = new AnchorProvider(connection, wallet as unknown as Wallet, {
    commitment: "confirmed",
  });
  const program = eventTicketsProgram(provider);

  const bundle = await buildProofBundle(assetId);
  const [listingPda] = resaleListingPda(merkleTree, bundle.leafIndex);
  const [tc] = treeConfigPda(merkleTree);

  const ix = await program.methods
    .listTicketResale(
      bundle.leafIndex,
      bundle.nonce,
      bundle.root,
      bundle.dataHash,
      bundle.creatorHash,
      new BN(Math.round(priceUsdc * USDC_UNIT)),
      new BN(expiresAt ?? 0)
    )
    .accounts({
      seller: sellerPk,
      event,
      listing: listingPda,
      treeConfig: tc,
      merkleTree,
      bubblegumProgram: BUBBLEGUM_PROGRAM_ID,
      logWrapper: NOOP_PROGRAM_ID,
      compressionProgram: ACCOUNT_COMPRESSION_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    } as never)
    .remainingAccounts(bundle.proofAccounts)
    .instruction();

  return simulateAndSend(connection, wallet, {
    feePayer: sellerPk,
    instructions: [
      ComputeBudgetProgram.setComputeUnitLimit({ units: 800_000 }),
      ix,
    ],
  });
}

export async function cancelTicketResaleTx(input: {
  connection: Connection;
  wallet: SendableWallet;
  listing: OnChainResaleListing;
  assetId: string;
}): Promise<string> {
  const { connection, wallet, listing, assetId } = input;
  if (!wallet.publicKey) throw new Error("Wallet not connected");
  const sellerPk = wallet.publicKey;
  const provider = new AnchorProvider(connection, wallet as unknown as Wallet, {
    commitment: "confirmed",
  });
  const program = eventTicketsProgram(provider);

  const merkleTree = new PublicKey(listing.merkleTree);
  const bundle = await buildProofBundle(assetId);
  const [tc] = treeConfigPda(merkleTree);

  const ix = await program.methods
    .cancelTicketResale(bundle.root, bundle.dataHash, bundle.creatorHash)
    .accounts({
      seller: sellerPk,
      listing: new PublicKey(listing.address),
      treeConfig: tc,
      merkleTree,
      bubblegumProgram: BUBBLEGUM_PROGRAM_ID,
      logWrapper: NOOP_PROGRAM_ID,
      compressionProgram: ACCOUNT_COMPRESSION_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    } as never)
    .remainingAccounts(bundle.proofAccounts)
    .instruction();

  return simulateAndSend(connection, wallet, {
    feePayer: sellerPk,
    instructions: [
      ComputeBudgetProgram.setComputeUnitLimit({ units: 700_000 }),
      ix,
    ],
  });
}

export async function buyTicketResaleTx(input: {
  connection: Connection;
  wallet: SendableWallet;
  listing: OnChainResaleListing;
  assetId: string;
}): Promise<string> {
  const { connection, wallet, listing, assetId } = input;
  if (!wallet.publicKey) throw new Error("Wallet not connected");
  const buyerPk = wallet.publicKey;
  const provider = new AnchorProvider(connection, wallet as unknown as Wallet, {
    commitment: "confirmed",
  });
  const program = eventTicketsProgram(provider);

  const merkleTree = new PublicKey(listing.merkleTree);
  const paymentMint = new PublicKey(listing.paymentMint);
  const seller = new PublicKey(listing.seller);
  const bundle = await buildProofBundle(assetId);
  const [tc] = treeConfigPda(merkleTree);

  const buyerAta = getAssociatedTokenAddressSync(
    paymentMint,
    buyerPk,
    false,
    TOKEN_2022_PROGRAM_ID
  );
  const sellerAta = getAssociatedTokenAddressSync(
    paymentMint,
    seller,
    false,
    TOKEN_2022_PROGRAM_ID
  );

  const ixs = [];
  const sellerAtaInfo = await connection.getAccountInfo(sellerAta);
  if (!sellerAtaInfo) {
    ixs.push(
      createAssociatedTokenAccountInstruction(
        buyerPk,
        sellerAta,
        seller,
        paymentMint,
        TOKEN_2022_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      )
    );
  }

  const cfg = await fetchEventTicketsConfig(program);

  const ix = await program.methods
    .buyTicketResale(bundle.root, bundle.dataHash, bundle.creatorHash)
    .accounts({
      buyer: buyerPk,
      seller,
      listing: new PublicKey(listing.address),
      paymentMint,
      buyerPaymentAccount: buyerAta,
      sellerPaymentAccount: sellerAta,
      config: cfg.address,
      treasury: cfg.treasury,
      paymentTokenProgram: TOKEN_2022_PROGRAM_ID,
      treeConfig: tc,
      merkleTree,
      bubblegumProgram: BUBBLEGUM_PROGRAM_ID,
      logWrapper: NOOP_PROGRAM_ID,
      compressionProgram: ACCOUNT_COMPRESSION_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    } as never)
    .remainingAccounts(bundle.proofAccounts)
    .instruction();
  ixs.push(ix);

  return simulateAndSend(connection, wallet, {
    feePayer: buyerPk,
    instructions: [
      ComputeBudgetProgram.setComputeUnitLimit({ units: 900_000 }),
      ...ixs,
    ],
  });
}

/**
 * Permissionless reclaim of an expired listing. Anyone can call — the
 * cNFT + rent go to the original seller. Useful when the seller goes
 * offline and a community member wants to clean up the listing PDA.
 */
export async function closeExpiredResaleTx(input: {
  connection: Connection;
  wallet: SendableWallet;
  listing: OnChainResaleListing;
  assetId: string;
}): Promise<string> {
  const { connection, wallet, listing, assetId } = input;
  if (!wallet.publicKey) throw new Error("Wallet not connected");
  const callerPk = wallet.publicKey;
  const provider = new AnchorProvider(connection, wallet as unknown as Wallet, {
    commitment: "confirmed",
  });
  const program = eventTicketsProgram(provider);

  const merkleTree = new PublicKey(listing.merkleTree);
  const seller = new PublicKey(listing.seller);
  const bundle = await buildProofBundle(assetId);
  const [tc] = treeConfigPda(merkleTree);

  const ix = await program.methods
    .closeExpiredResale(bundle.root, bundle.dataHash, bundle.creatorHash)
    .accounts({
      caller: callerPk,
      seller,
      listing: new PublicKey(listing.address),
      treeConfig: tc,
      merkleTree,
      bubblegumProgram: BUBBLEGUM_PROGRAM_ID,
      logWrapper: NOOP_PROGRAM_ID,
      compressionProgram: ACCOUNT_COMPRESSION_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    } as never)
    .remainingAccounts(bundle.proofAccounts)
    .instruction();

  return simulateAndSend(connection, wallet, {
    feePayer: callerPk,
    instructions: [
      ComputeBudgetProgram.setComputeUnitLimit({ units: 700_000 }),
      ix,
    ],
  });
}

// ---- Private-price (commit/reveal) helpers ----

/**
 * Generates 32 cryptographically random bytes for the seller's price
 * nonce. Stored locally by the seller and shared off-chain with the
 * buyer alongside the plain price.
 */
export function generatePriceNonce(): Uint8Array {
  const out = new Uint8Array(32);
  crypto.getRandomValues(out);
  return out;
}

/**
 * Computes keccak256(price_le_bytes || nonce) to match the on-chain
 * verification in `buy_ticket_resale_private`.
 */
export function computePriceCommit(priceBase: bigint, nonce: Uint8Array): number[] {
  // Lazy-require so bundlers don't pull the lib into shared chunks it
  // isn't needed by.
  const { keccak_256 } = require("js-sha3");
  const priceBuf = new Uint8Array(8);
  const view = new DataView(priceBuf.buffer);
  view.setBigUint64(0, priceBase, true);
  const combined = new Uint8Array(40);
  combined.set(priceBuf, 0);
  combined.set(nonce, 8);
  const hash: Uint8Array = keccak_256.arrayBuffer(combined) as unknown as Uint8Array;
  return Array.from(new Uint8Array(hash as unknown as ArrayBuffer));
}

/**
 * Encode (price, nonce) as a base64 "envelope" the seller shares off-chain
 * with the buyer (e.g. via DM, email, or a claim-link URL fragment).
 */
export function encodePriceEnvelope(priceBase: bigint, nonce: Uint8Array): string {
  const priceBuf = new Uint8Array(8);
  new DataView(priceBuf.buffer).setBigUint64(0, priceBase, true);
  const combined = new Uint8Array(40);
  combined.set(priceBuf, 0);
  combined.set(nonce, 8);
  // btoa wants a string of char codes
  let binary = "";
  for (let i = 0; i < combined.length; i++) binary += String.fromCharCode(combined[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodePriceEnvelope(input: string): { priceBase: bigint; nonce: Uint8Array } | null {
  try {
    const normal = input.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normal + "===".slice(0, (4 - (normal.length % 4)) % 4);
    const binary = atob(padded);
    if (binary.length !== 40) return null;
    const bytes = new Uint8Array(40);
    for (let i = 0; i < 40; i++) bytes[i] = binary.charCodeAt(i);
    const priceBase = new DataView(bytes.buffer).getBigUint64(0, true);
    const nonce = bytes.slice(8);
    return { priceBase, nonce };
  } catch {
    return null;
  }
}

export async function listTicketResalePrivateTx(input: {
  connection: Connection;
  wallet: SendableWallet;
  event: PublicKey;
  merkleTree: PublicKey;
  assetId: string;
  priceUsdc: number;
  nonce: Uint8Array; // 32 bytes, caller-generated via generatePriceNonce()
  expiresAt: number | null;
}): Promise<string> {
  const { connection, wallet, event, merkleTree, assetId, priceUsdc, nonce, expiresAt } = input;
  if (!wallet.publicKey) throw new Error("Wallet not connected");
  if (nonce.length !== 32) throw new Error("nonce must be 32 bytes");
  const sellerPk = wallet.publicKey;
  const provider = new AnchorProvider(connection, wallet as unknown as Wallet, {
    commitment: "confirmed",
  });
  const program = eventTicketsProgram(provider);

  const priceBase = BigInt(Math.round(priceUsdc * USDC_UNIT));
  const priceCommit = computePriceCommit(priceBase, nonce);

  const bundle = await buildProofBundle(assetId);
  const [listingPda] = resaleListingPda(merkleTree, bundle.leafIndex);
  const [tc] = treeConfigPda(merkleTree);

  const ix = await program.methods
    .listTicketResalePrivate(
      bundle.leafIndex,
      bundle.nonce,
      bundle.root,
      bundle.dataHash,
      bundle.creatorHash,
      priceCommit,
      new BN(expiresAt ?? 0)
    )
    .accounts({
      seller: sellerPk,
      event,
      listing: listingPda,
      treeConfig: tc,
      merkleTree,
      bubblegumProgram: BUBBLEGUM_PROGRAM_ID,
      logWrapper: NOOP_PROGRAM_ID,
      compressionProgram: ACCOUNT_COMPRESSION_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    } as never)
    .remainingAccounts(bundle.proofAccounts)
    .instruction();

  return simulateAndSend(connection, wallet, {
    feePayer: sellerPk,
    instructions: [
      ComputeBudgetProgram.setComputeUnitLimit({ units: 800_000 }),
      ix,
    ],
  });
}

export async function buyTicketResalePrivateTx(input: {
  connection: Connection;
  wallet: SendableWallet;
  listing: OnChainResaleListing;
  assetId: string;
  priceBase: bigint;
  nonce: Uint8Array;
}): Promise<string> {
  const { connection, wallet, listing, assetId, priceBase, nonce } = input;
  if (!wallet.publicKey) throw new Error("Wallet not connected");
  if (nonce.length !== 32) throw new Error("nonce must be 32 bytes");
  const buyerPk = wallet.publicKey;
  const provider = new AnchorProvider(connection, wallet as unknown as Wallet, {
    commitment: "confirmed",
  });
  const program = eventTicketsProgram(provider);

  // Local sanity: verify our hash matches the on-chain commit before
  // bothering with Merkle proof fetch / tx build.
  const computed = computePriceCommit(priceBase, nonce);
  const computedHex = commitToHex(computed);
  if (computedHex !== listing.priceCommitHex) {
    throw new Error("Price + nonce do not match the listing commit. Double-check the envelope.");
  }

  const merkleTree = new PublicKey(listing.merkleTree);
  const paymentMint = new PublicKey(listing.paymentMint);
  const seller = new PublicKey(listing.seller);
  const bundle = await buildProofBundle(assetId);
  const [tc] = treeConfigPda(merkleTree);

  const buyerAta = getAssociatedTokenAddressSync(paymentMint, buyerPk, false, TOKEN_2022_PROGRAM_ID);
  const sellerAta = getAssociatedTokenAddressSync(paymentMint, seller, false, TOKEN_2022_PROGRAM_ID);

  const ixs = [];
  const sellerAtaInfo = await connection.getAccountInfo(sellerAta);
  if (!sellerAtaInfo) {
    ixs.push(
      createAssociatedTokenAccountInstruction(
        buyerPk,
        sellerAta,
        seller,
        paymentMint,
        TOKEN_2022_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      )
    );
  }

  const cfg = await fetchEventTicketsConfig(program);

  const ix = await program.methods
    .buyTicketResalePrivate(
      bundle.root,
      bundle.dataHash,
      bundle.creatorHash,
      new BN(priceBase.toString()),
      Array.from(nonce)
    )
    .accounts({
      buyer: buyerPk,
      seller,
      listing: new PublicKey(listing.address),
      paymentMint,
      buyerPaymentAccount: buyerAta,
      sellerPaymentAccount: sellerAta,
      config: cfg.address,
      treasury: cfg.treasury,
      paymentTokenProgram: TOKEN_2022_PROGRAM_ID,
      treeConfig: tc,
      merkleTree,
      bubblegumProgram: BUBBLEGUM_PROGRAM_ID,
      logWrapper: NOOP_PROGRAM_ID,
      compressionProgram: ACCOUNT_COMPRESSION_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    } as never)
    .remainingAccounts(bundle.proofAccounts)
    .instruction();
  ixs.push(ix);

  return simulateAndSend(connection, wallet, {
    feePayer: buyerPk,
    instructions: [
      ComputeBudgetProgram.setComputeUnitLimit({ units: 900_000 }),
      ...ixs,
    ],
  });
}
