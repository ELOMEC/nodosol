import { AnchorProvider, Program, Idl } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";

import registryIdl from "../idl/rwa_registry.json";
import mintIdl from "../idl/rwa_mint.json";

export const REGISTRY_PROGRAM_ID = new PublicKey(
  (registryIdl as { address: string }).address
);
export const MINT_PROGRAM_ID = new PublicKey(
  (mintIdl as { address: string }).address
);

const CONFIG_SEED = Buffer.from("config");
const ISSUER_SEED = Buffer.from("issuer");
const ASSET_SEED = Buffer.from("asset");

export function registryConfigPda(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([CONFIG_SEED], REGISTRY_PROGRAM_ID);
}

export function issuerPda(owner: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [ISSUER_SEED, owner.toBuffer()],
    REGISTRY_PROGRAM_ID
  );
}

export function assetPda(
  issuerOwner: PublicKey,
  assetId: bigint
): [PublicKey, number] {
  const idBuf = Buffer.alloc(8);
  idBuf.writeBigUInt64LE(assetId);
  return PublicKey.findProgramAddressSync(
    [ASSET_SEED, issuerOwner.toBuffer(), idBuf],
    MINT_PROGRAM_ID
  );
}

export function registryProgram(provider: AnchorProvider): Program {
  return new Program(registryIdl as Idl, provider);
}

export function mintProgram(provider: AnchorProvider): Program {
  return new Program(mintIdl as Idl, provider);
}

export type IssuerStatusKey = "pending" | "active" | "suspended" | "revoked";

export type IssuerAccount = {
  address: PublicKey;
  owner: PublicKey;
  status: IssuerStatusKey;
  jurisdictions: number[][]; // each inner array is 3 bytes ASCII
  assetClasses: number;
  kycRef: string;
  registeredAt: number;
  updatedAt: number;
};

export const ASSET_CLASS_FLAGS = {
  commodity: 1 << 0,
  realEstate: 1 << 1,
  debt: 1 << 2,
  equity: 1 << 3,
  ticket: 1 << 4,
  carbon: 1 << 5,
  other: 1 << 6,
} as const;

export type AssetCategoryKey =
  | "commodity"
  | "realEstate"
  | "debt"
  | "equity"
  | "ticket"
  | "carbon"
  | "other";

export function categoryToAnchor(key: AssetCategoryKey): Record<string, Record<string, never>> {
  return { [key]: {} };
}

export function categoryFlag(key: AssetCategoryKey): number {
  return ASSET_CLASS_FLAGS[key];
}

export function decodeIssuerStatus(
  anchorStatus: Record<string, unknown>
): IssuerStatusKey {
  if ("active" in anchorStatus) return "active";
  if ("pending" in anchorStatus) return "pending";
  if ("suspended" in anchorStatus) return "suspended";
  if ("revoked" in anchorStatus) return "revoked";
  throw new Error("Unknown issuer status variant");
}

export function jurisdictionsToString(codes: number[][]): string[] {
  return codes.map((c) =>
    String.fromCharCode(...c.filter((b) => b !== 0))
  );
}

export function assetClassLabels(bitmap: number): string[] {
  const labels: string[] = [];
  if (bitmap & ASSET_CLASS_FLAGS.commodity) labels.push("Commodity");
  if (bitmap & ASSET_CLASS_FLAGS.realEstate) labels.push("Real Estate");
  if (bitmap & ASSET_CLASS_FLAGS.debt) labels.push("Debt");
  if (bitmap & ASSET_CLASS_FLAGS.equity) labels.push("Equity");
  if (bitmap & ASSET_CLASS_FLAGS.ticket) labels.push("Ticket");
  if (bitmap & ASSET_CLASS_FLAGS.carbon) labels.push("Carbon Credit");
  if (bitmap & ASSET_CLASS_FLAGS.other) labels.push("Other");
  return labels;
}
