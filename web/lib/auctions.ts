import { AnchorProvider, BN, Idl, Program, Wallet } from "@coral-xyz/anchor";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import {
  ComputeBudgetProgram,
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";

import auctionsIdl from "../idl/auctions.json";
import { USDC_UNIT, getUsdcMint } from "./constants";

export const AUCTIONS_PROGRAM_ID = new PublicKey(
  (auctionsIdl as { address: string }).address
);

const CONFIG_SEED = Buffer.from("config");
const AUCTION_SEED = Buffer.from("auction");
const VAULT_SEED = Buffer.from("vault");
const BID_SEED = Buffer.from("bid");

type SendableWallet = {
  publicKey: PublicKey | null;
  sendTransaction: (tx: Transaction, connection: Connection) => Promise<string>;
};

export function auctionsProgram(provider: AnchorProvider): Program {
  return new Program(auctionsIdl as Idl, provider);
}

export function auctionConfigPda(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([CONFIG_SEED], AUCTIONS_PROGRAM_ID);
}

export function auctionPda(seller: PublicKey, auctionId: bigint): [PublicKey, number] {
  const idBuf = Buffer.alloc(8);
  idBuf.writeBigUInt64LE(auctionId);
  return PublicKey.findProgramAddressSync(
    [AUCTION_SEED, seller.toBuffer(), idBuf],
    AUCTIONS_PROGRAM_ID
  );
}

export function auctionVaultPda(auction: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [VAULT_SEED, auction.toBuffer()],
    AUCTIONS_PROGRAM_ID
  );
}

export function sealedBidPda(auction: PublicKey, bidder: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [BID_SEED, auction.toBuffer(), bidder.toBuffer()],
    AUCTIONS_PROGRAM_ID
  );
}

// ---------- Types ----------

export type AuctionStatusKey = "commitPhase" | "revealPhase" | "settled" | "cancelled";
export type BidStatusKey = "committed" | "revealed" | "refunded" | "won";

export function decodeAuctionStatus(raw: Record<string, unknown>): AuctionStatusKey {
  if ("commitPhase" in raw) return "commitPhase";
  if ("revealPhase" in raw) return "revealPhase";
  if ("settled" in raw) return "settled";
  if ("cancelled" in raw) return "cancelled";
  return "commitPhase";
}

export function decodeBidStatus(raw: Record<string, unknown>): BidStatusKey {
  if ("committed" in raw) return "committed";
  if ("revealed" in raw) return "revealed";
  if ("refunded" in raw) return "refunded";
  if ("won" in raw) return "won";
  return "committed";
}

export type OnChainAuction = {
  address: string;
  seller: string;
  auctionId: string;
  paymentMint: string;
  vault: string;
  startPriceBase: bigint;
  startPriceUsdc: number;
  minDepositBase: bigint;
  minDepositUsdc: number;
  createdAt: number;
  commitEndsAt: number;
  revealEndsAt: number;
  status: AuctionStatusKey;
  bidCount: number;
  revealedCount: number;
  highestBidBase: bigint;
  highestBidUsdc: number;
  highestBidder: string;
  settledAt: number;
  memo: string;
  metadataUri: string;
};

export type OnChainSealedBid = {
  address: string;
  auction: string;
  bidder: string;
  commitHex: string;
  escrowBase: bigint;
  escrowUsdc: number;
  revealedBidBase: bigint;
  revealedBidUsdc: number;
  committedAt: number;
  revealedAt: number;
  status: BidStatusKey;
};

function commitToHex(bytes: number[] | Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function rowToAuction(publicKey: PublicKey, account: {
  seller: PublicKey;
  auctionId: BN;
  paymentMint: PublicKey;
  vault: PublicKey;
  startPrice: BN;
  minDeposit: BN;
  createdAt: BN;
  commitEndsAt: BN;
  revealEndsAt: BN;
  status: Record<string, unknown>;
  bidCount: number;
  revealedCount: number;
  highestBid: BN;
  highestBidder: PublicKey;
  settledAt: BN;
  memo: string;
  metadataUri: string;
}): OnChainAuction {
  return {
    address: publicKey.toBase58(),
    seller: account.seller.toBase58(),
    auctionId: account.auctionId.toString(),
    paymentMint: account.paymentMint.toBase58(),
    vault: account.vault.toBase58(),
    startPriceBase: BigInt(account.startPrice.toString()),
    startPriceUsdc: Number(account.startPrice.toString()) / USDC_UNIT,
    minDepositBase: BigInt(account.minDeposit.toString()),
    minDepositUsdc: Number(account.minDeposit.toString()) / USDC_UNIT,
    createdAt: account.createdAt.toNumber(),
    commitEndsAt: account.commitEndsAt.toNumber(),
    revealEndsAt: account.revealEndsAt.toNumber(),
    status: decodeAuctionStatus(account.status),
    bidCount: account.bidCount,
    revealedCount: account.revealedCount,
    highestBidBase: BigInt(account.highestBid.toString()),
    highestBidUsdc: Number(account.highestBid.toString()) / USDC_UNIT,
    highestBidder: account.highestBidder.toBase58(),
    settledAt: account.settledAt.toNumber(),
    memo: account.memo,
    metadataUri: account.metadataUri,
  };
}

function rowToBid(publicKey: PublicKey, account: {
  auction: PublicKey;
  bidder: PublicKey;
  commit: number[];
  escrow: BN;
  revealedBid: BN;
  committedAt: BN;
  revealedAt: BN;
  status: Record<string, unknown>;
}): OnChainSealedBid {
  return {
    address: publicKey.toBase58(),
    auction: account.auction.toBase58(),
    bidder: account.bidder.toBase58(),
    commitHex: commitToHex(account.commit),
    escrowBase: BigInt(account.escrow.toString()),
    escrowUsdc: Number(account.escrow.toString()) / USDC_UNIT,
    revealedBidBase: BigInt(account.revealedBid.toString()),
    revealedBidUsdc: Number(account.revealedBid.toString()) / USDC_UNIT,
    committedAt: account.committedAt.toNumber(),
    revealedAt: account.revealedAt.toNumber(),
    status: decodeBidStatus(account.status),
  };
}

// ---------- Fetch ----------

export async function fetchAllAuctions(program: Program): Promise<OnChainAuction[]> {
  const api = (program.account as Record<string, {
    all: () => Promise<Array<{ publicKey: PublicKey; account: Parameters<typeof rowToAuction>[1] }>>;
  }>).auction;
  const items = await api.all();
  return items.map(({ publicKey, account }) => rowToAuction(publicKey, account));
}

export async function fetchAuction(
  program: Program,
  address: PublicKey
): Promise<OnChainAuction | null> {
  const api = (program.account as Record<string, {
    fetchNullable: (addr: PublicKey) => Promise<Parameters<typeof rowToAuction>[1] | null>;
  }>).auction;
  const account = await api.fetchNullable(address);
  if (!account) return null;
  return rowToAuction(address, account);
}

export async function fetchBidsForAuction(
  program: Program,
  auction: PublicKey
): Promise<OnChainSealedBid[]> {
  const api = (program.account as Record<string, {
    all: (filters: unknown[]) => Promise<Array<{ publicKey: PublicKey; account: Parameters<typeof rowToBid>[1] }>>;
  }>).sealedBid;
  const items = await api.all([
    { memcmp: { offset: 8, bytes: auction.toBase58() } },
  ]);
  return items.map(({ publicKey, account }) => rowToBid(publicKey, account));
}

export async function fetchMyBid(
  program: Program,
  auction: PublicKey,
  bidder: PublicKey
): Promise<OnChainSealedBid | null> {
  const [pda] = sealedBidPda(auction, bidder);
  const api = (program.account as Record<string, {
    fetchNullable: (addr: PublicKey) => Promise<Parameters<typeof rowToBid>[1] | null>;
  }>).sealedBid;
  const account = await api.fetchNullable(pda);
  if (!account) return null;
  return rowToBid(pda, account);
}

export async function fetchAuctionConfig(program: Program): Promise<{
  address: PublicKey;
  authority: PublicKey;
  treasury: PublicKey;
  feeBps: number;
} | null> {
  const [address] = auctionConfigPda();
  const api = (program.account as Record<string, {
    fetchNullable: (addr: PublicKey) => Promise<{
      authority: PublicKey;
      treasury: PublicKey;
      feeBps: number;
    } | null>;
  }>).auctionConfig;
  const account = await api.fetchNullable(address);
  if (!account) return null;
  return {
    address,
    authority: account.authority,
    treasury: account.treasury,
    feeBps: account.feeBps,
  };
}

// ---------- Commit helpers ----------

export function generateBidNonce(): Uint8Array {
  const out = new Uint8Array(32);
  crypto.getRandomValues(out);
  return out;
}

export function computeBidCommit(bidBase: bigint, nonce: Uint8Array): number[] {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
  const { keccak_256 } = require("js-sha3");
  const bidBuf = new Uint8Array(8);
  new DataView(bidBuf.buffer).setBigUint64(0, bidBase, true);
  const combined = new Uint8Array(40);
  combined.set(bidBuf, 0);
  combined.set(nonce, 8);
  const hash: unknown = keccak_256.arrayBuffer(combined);
  return Array.from(new Uint8Array(hash as ArrayBuffer));
}

export function encodeBidEnvelope(bidBase: bigint, nonce: Uint8Array): string {
  const bidBuf = new Uint8Array(8);
  new DataView(bidBuf.buffer).setBigUint64(0, bidBase, true);
  const combined = new Uint8Array(40);
  combined.set(bidBuf, 0);
  combined.set(nonce, 8);
  let binary = "";
  for (let i = 0; i < combined.length; i++) binary += String.fromCharCode(combined[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeBidEnvelope(input: string): { bidBase: bigint; nonce: Uint8Array } | null {
  try {
    const normal = input.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normal + "===".slice(0, (4 - (normal.length % 4)) % 4);
    const binary = atob(padded);
    if (binary.length !== 40) return null;
    const bytes = new Uint8Array(40);
    for (let i = 0; i < 40; i++) bytes[i] = binary.charCodeAt(i);
    const bidBase = new DataView(bytes.buffer).getBigUint64(0, true);
    const nonce = bytes.slice(8);
    return { bidBase, nonce };
  } catch {
    return null;
  }
}

// localStorage convenience: cache (bid, nonce) for this wallet so
// returning to reveal doesn't need manual entry.
function localStorageKey(auction: string, bidder: string): string {
  return `nodosol:bid:${auction}:${bidder}`;
}
export function cacheBidEnvelope(auction: string, bidder: string, envelope: string): void {
  try {
    localStorage.setItem(localStorageKey(auction, bidder), envelope);
  } catch {
    // ignore storage errors (private mode, etc.)
  }
}
export function readCachedBidEnvelope(auction: string, bidder: string): string | null {
  try {
    return localStorage.getItem(localStorageKey(auction, bidder));
  } catch {
    return null;
  }
}
export function clearCachedBidEnvelope(auction: string, bidder: string): void {
  try {
    localStorage.removeItem(localStorageKey(auction, bidder));
  } catch {
    // ignore
  }
}

// ---------- Tx helpers ----------

export async function initAuctionConfigTx(input: {
  connection: Connection;
  wallet: SendableWallet;
  feeBps: number;
  treasury: PublicKey; // USDC ATA
}): Promise<string> {
  const { connection, wallet, feeBps, treasury } = input;
  if (!wallet.publicKey) throw new Error("Wallet not connected");
  const authorityPk = wallet.publicKey;
  const provider = new AnchorProvider(connection, wallet as unknown as Wallet, {
    commitment: "confirmed",
  });
  const program = auctionsProgram(provider);

  const [configPda] = auctionConfigPda();
  const ix = await program.methods
    .initializeAuctionConfig(feeBps)
    .accounts({
      authority: authorityPk,
      config: configPda,
      paymentMint: getUsdcMint(),
      treasury,
      systemProgram: SystemProgram.programId,
    } as never)
    .instruction();

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  const tx = new Transaction({ feePayer: authorityPk, recentBlockhash: blockhash });
  tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 300_000 }));
  tx.add(ix);
  const sig = await wallet.sendTransaction(tx, connection);
  await connection.confirmTransaction(
    { signature: sig, blockhash, lastValidBlockHeight },
    "confirmed"
  );
  return sig;
}

export async function createAuctionTx(input: {
  connection: Connection;
  wallet: SendableWallet;
  startPriceUsdc: number;
  minDepositUsdc: number;
  commitEndsAt: number; // unix seconds
  revealEndsAt: number; // unix seconds
  memo: string;
  metadataUri: string;
}): Promise<{ sig: string; auctionAddress: string; auctionId: bigint }> {
  const { connection, wallet, startPriceUsdc, minDepositUsdc, commitEndsAt, revealEndsAt, memo, metadataUri } = input;
  if (!wallet.publicKey) throw new Error("Wallet not connected");
  const sellerPk = wallet.publicKey;
  const provider = new AnchorProvider(connection, wallet as unknown as Wallet, {
    commitment: "confirmed",
  });
  const program = auctionsProgram(provider);

  const auctionId = BigInt(Math.floor(Date.now() / 1000));
  const [auction] = auctionPda(sellerPk, auctionId);
  const [vault] = auctionVaultPda(auction);

  const ix = await program.methods
    .createAuction(
      new BN(auctionId.toString()),
      new BN(Math.round(startPriceUsdc * USDC_UNIT)),
      new BN(Math.round(minDepositUsdc * USDC_UNIT)),
      new BN(commitEndsAt),
      new BN(revealEndsAt),
      memo,
      metadataUri
    )
    .accounts({
      seller: sellerPk,
      auction,
      paymentMint: getUsdcMint(),
      vault,
      paymentTokenProgram: TOKEN_2022_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    } as never)
    .instruction();

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  const tx = new Transaction({ feePayer: sellerPk, recentBlockhash: blockhash });
  tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }));
  tx.add(ix);
  const sig = await wallet.sendTransaction(tx, connection);
  await connection.confirmTransaction(
    { signature: sig, blockhash, lastValidBlockHeight },
    "confirmed"
  );
  return { sig, auctionAddress: auction.toBase58(), auctionId };
}

export async function cancelAuctionTx(input: {
  connection: Connection;
  wallet: SendableWallet;
  auction: OnChainAuction;
}): Promise<string> {
  const { connection, wallet, auction } = input;
  if (!wallet.publicKey) throw new Error("Wallet not connected");
  const sellerPk = wallet.publicKey;
  const provider = new AnchorProvider(connection, wallet as unknown as Wallet, {
    commitment: "confirmed",
  });
  const program = auctionsProgram(provider);

  const auctionPk = new PublicKey(auction.address);
  const vaultPk = new PublicKey(auction.vault);

  const ix = await program.methods
    .cancelAuction()
    .accounts({
      seller: sellerPk,
      auction: auctionPk,
      vault: vaultPk,
      paymentTokenProgram: TOKEN_2022_PROGRAM_ID,
    } as never)
    .instruction();

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  const tx = new Transaction({ feePayer: sellerPk, recentBlockhash: blockhash });
  tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }));
  tx.add(ix);
  const sig = await wallet.sendTransaction(tx, connection);
  await connection.confirmTransaction(
    { signature: sig, blockhash, lastValidBlockHeight },
    "confirmed"
  );
  return sig;
}

export async function commitBidTx(input: {
  connection: Connection;
  wallet: SendableWallet;
  auction: OnChainAuction;
  bidBase: bigint;
  nonce: Uint8Array;
  escrowBase: bigint;
}): Promise<string> {
  const { connection, wallet, auction, bidBase, nonce, escrowBase } = input;
  if (!wallet.publicKey) throw new Error("Wallet not connected");
  const bidderPk = wallet.publicKey;
  const provider = new AnchorProvider(connection, wallet as unknown as Wallet, {
    commitment: "confirmed",
  });
  const program = auctionsProgram(provider);

  const auctionPk = new PublicKey(auction.address);
  const paymentMint = new PublicKey(auction.paymentMint);
  const [bid] = sealedBidPda(auctionPk, bidderPk);
  const bidderAta = getAssociatedTokenAddressSync(
    paymentMint,
    bidderPk,
    false,
    TOKEN_2022_PROGRAM_ID
  );

  const commit = computeBidCommit(bidBase, nonce);

  const ix = await program.methods
    .commitBid(commit, new BN(escrowBase.toString()))
    .accounts({
      bidder: bidderPk,
      auction: auctionPk,
      bid,
      paymentMint,
      bidderPaymentAccount: bidderAta,
      vault: new PublicKey(auction.vault),
      paymentTokenProgram: TOKEN_2022_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    } as never)
    .instruction();

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  const tx = new Transaction({ feePayer: bidderPk, recentBlockhash: blockhash });
  tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 300_000 }));
  tx.add(ix);
  const sig = await wallet.sendTransaction(tx, connection);
  await connection.confirmTransaction(
    { signature: sig, blockhash, lastValidBlockHeight },
    "confirmed"
  );
  return sig;
}

export async function revealBidTx(input: {
  connection: Connection;
  wallet: SendableWallet;
  auction: OnChainAuction;
  bidBase: bigint;
  nonce: Uint8Array;
}): Promise<string> {
  const { connection, wallet, auction, bidBase, nonce } = input;
  if (!wallet.publicKey) throw new Error("Wallet not connected");
  const bidderPk = wallet.publicKey;
  const provider = new AnchorProvider(connection, wallet as unknown as Wallet, {
    commitment: "confirmed",
  });
  const program = auctionsProgram(provider);

  const auctionPk = new PublicKey(auction.address);
  const [bid] = sealedBidPda(auctionPk, bidderPk);

  const ix = await program.methods
    .revealBid(new BN(bidBase.toString()), Array.from(nonce))
    .accounts({
      bidder: bidderPk,
      auction: auctionPk,
      bid,
    } as never)
    .instruction();

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  const tx = new Transaction({ feePayer: bidderPk, recentBlockhash: blockhash });
  tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }));
  tx.add(ix);
  const sig = await wallet.sendTransaction(tx, connection);
  await connection.confirmTransaction(
    { signature: sig, blockhash, lastValidBlockHeight },
    "confirmed"
  );
  return sig;
}

export async function settleAuctionTx(input: {
  connection: Connection;
  wallet: SendableWallet;
  auction: OnChainAuction;
}): Promise<string> {
  const { connection, wallet, auction } = input;
  if (!wallet.publicKey) throw new Error("Wallet not connected");
  const callerPk = wallet.publicKey;
  const provider = new AnchorProvider(connection, wallet as unknown as Wallet, {
    commitment: "confirmed",
  });
  const program = auctionsProgram(provider);

  const cfg = await fetchAuctionConfig(program);
  if (!cfg) throw new Error("Auction config not initialized");

  const auctionPk = new PublicKey(auction.address);
  const seller = new PublicKey(auction.seller);
  const paymentMint = new PublicKey(auction.paymentMint);
  const vault = new PublicKey(auction.vault);
  const winner = new PublicKey(auction.highestBidder);
  const [winnerBid] = sealedBidPda(auctionPk, winner);
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
        callerPk,
        sellerAta,
        seller,
        paymentMint,
        TOKEN_2022_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      )
    );
  }

  const ix = await program.methods
    .settleAuction()
    .accounts({
      caller: callerPk,
      auction: auctionPk,
      winnerBid,
      config: cfg.address,
      paymentMint,
      vault,
      sellerPaymentAccount: sellerAta,
      seller,
      treasury: cfg.treasury,
      paymentTokenProgram: TOKEN_2022_PROGRAM_ID,
    } as never)
    .instruction();
  ixs.push(ix);

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  const tx = new Transaction({ feePayer: callerPk, recentBlockhash: blockhash });
  tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }));
  for (const i of ixs) tx.add(i);
  const sig = await wallet.sendTransaction(tx, connection);
  await connection.confirmTransaction(
    { signature: sig, blockhash, lastValidBlockHeight },
    "confirmed"
  );
  return sig;
}

export async function refundBidTx(input: {
  connection: Connection;
  wallet: SendableWallet;
  auction: OnChainAuction;
}): Promise<string> {
  const { connection, wallet, auction } = input;
  if (!wallet.publicKey) throw new Error("Wallet not connected");
  const bidderPk = wallet.publicKey;
  const provider = new AnchorProvider(connection, wallet as unknown as Wallet, {
    commitment: "confirmed",
  });
  const program = auctionsProgram(provider);

  const auctionPk = new PublicKey(auction.address);
  const paymentMint = new PublicKey(auction.paymentMint);
  const vault = new PublicKey(auction.vault);
  const [bid] = sealedBidPda(auctionPk, bidderPk);
  const bidderAta = getAssociatedTokenAddressSync(
    paymentMint,
    bidderPk,
    false,
    TOKEN_2022_PROGRAM_ID
  );

  const ix = await program.methods
    .refundBid()
    .accounts({
      bidder: bidderPk,
      auction: auctionPk,
      bid,
      paymentMint,
      vault,
      bidderPaymentAccount: bidderAta,
      paymentTokenProgram: TOKEN_2022_PROGRAM_ID,
    } as never)
    .instruction();

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  const tx = new Transaction({ feePayer: bidderPk, recentBlockhash: blockhash });
  tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }));
  tx.add(ix);
  const sig = await wallet.sendTransaction(tx, connection);
  await connection.confirmTransaction(
    { signature: sig, blockhash, lastValidBlockHeight },
    "confirmed"
  );
  return sig;
}
