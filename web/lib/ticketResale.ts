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
  NOOP_PROGRAM_ID,
  treeConfigPda,
} from "./eventTickets";
import {
  getAssetCompressionDetails,
  getAssetProof,
  HeliusCompressionDetails,
} from "./helius";

const RESALE_SEED = Buffer.from("resale");

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

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  const tx = new Transaction({ feePayer: sellerPk, recentBlockhash: blockhash });
  tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 800_000 }));
  tx.add(ix);
  const sig = await wallet.sendTransaction(tx, connection);
  await connection.confirmTransaction(
    { signature: sig, blockhash, lastValidBlockHeight },
    "confirmed"
  );
  return sig;
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

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  const tx = new Transaction({ feePayer: sellerPk, recentBlockhash: blockhash });
  tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 700_000 }));
  tx.add(ix);
  const sig = await wallet.sendTransaction(tx, connection);
  await connection.confirmTransaction(
    { signature: sig, blockhash, lastValidBlockHeight },
    "confirmed"
  );
  return sig;
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

  const ix = await program.methods
    .buyTicketResale(bundle.root, bundle.dataHash, bundle.creatorHash)
    .accounts({
      buyer: buyerPk,
      seller,
      listing: new PublicKey(listing.address),
      paymentMint,
      buyerPaymentAccount: buyerAta,
      sellerPaymentAccount: sellerAta,
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

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  const tx = new Transaction({ feePayer: buyerPk, recentBlockhash: blockhash });
  tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 900_000 }));
  for (const i of ixs) tx.add(i);
  const sig = await wallet.sendTransaction(tx, connection);
  await connection.confirmTransaction(
    { signature: sig, blockhash, lastValidBlockHeight },
    "confirmed"
  );
  return sig;
}
