/**
 * One-off: widen dev + phantom issuer authorisation to ALL asset classes
 * so the seed script can tokenise commodity/ticket/realEstate/other assets.
 */

import pkg from "@coral-xyz/anchor";
const { AnchorProvider, Program, Wallet } = pkg;
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";

import registryIdl from "../web/idl/rwa_registry.json" with { type: "json" };

const RPC_URL = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
const WALLET_PATH =
  process.env.SOLANA_WALLET_PATH ?? `${homedir()}/.config/solana/id-devnet.json`;

const ISSUER_SEED = Buffer.from("issuer");
const ASSET_CLASSES_ALL = 0x7f; // all 7 bits

const OWNERS = [
  // dev wallet — resolved below
  "6AnFbinF7X12mACTVEGfjWZyzYGAShEscAB5UgV3vHsP",
];

async function main() {
  const kp = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(readFileSync(WALLET_PATH, "utf8")))
  );
  const connection = new Connection(RPC_URL, "confirmed");
  const provider = new AnchorProvider(connection, new Wallet(kp), {
    commitment: "confirmed",
  });
  const registry = new Program(registryIdl as never, provider);
  const programId = new PublicKey((registryIdl as { address: string }).address);

  const owners = [kp.publicKey, ...OWNERS.map((k) => new PublicKey(k))];
  for (const owner of owners) {
    const [issuerPda] = PublicKey.findProgramAddressSync(
      [ISSUER_SEED, owner.toBuffer()],
      programId
    );
    const info = await connection.getAccountInfo(issuerPda);
    if (!info) {
      console.log(`Issuer for ${owner.toBase58().slice(0, 8)}… not found — skip`);
      continue;
    }
    const sig = await registry.methods
      .updateIssuerMetadata(
        [Array.from(Buffer.from("SRB")), Array.from(Buffer.from("ARE"))],
        ASSET_CLASSES_ALL,
        `DEMO-KYC-${owner.toBase58().slice(0, 4)}`
      )
      .accounts({
        authority: kp.publicKey,
        issuer: issuerPda,
      } as never)
      .rpc();
    console.log(`Widened ${owner.toBase58().slice(0, 8)}… sig ${sig}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
