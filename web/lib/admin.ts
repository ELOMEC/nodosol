import { AnchorProvider, Idl, Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";

import tipJarIdl from "../idl/tip_jar.json";
import subscriptionIdl from "../idl/subscription.json";
import eventsIdl from "../idl/events.json";
import registryIdl from "../idl/rwa_registry.json";
import marketplaceIdl from "../idl/marketplace.json";
import otcIdl from "../idl/otc_deals.json";
import eventTicketsIdl from "../idl/event_tickets.json";

const CONFIG_SEED = Buffer.from("config");

export type ProgramDescriptor = {
  key: string;
  label: string;
  blurb: string;
  idl: Idl;
  programId: PublicKey;
  /**
   * Account name on the program used for the Config PDA.
   * All eight programs settled on "config".
   */
  configAccount: "config";
  /**
   * Whether fee_bps + treasury are part of the Config PDA (rwa_registry is
   * the exception — it just has an authority and issuer_count).
   */
  hasFee: boolean;
};

export const PROGRAMS: ProgramDescriptor[] = [
  {
    key: "tip_jar",
    label: "Tip jar",
    blurb: "Direct fan-to-creator USDC tips.",
    idl: tipJarIdl as Idl,
    programId: new PublicKey((tipJarIdl as { address: string }).address),
    configAccount: "config",
    hasFee: true,
  },
  {
    key: "subscription",
    label: "Subscriptions",
    blurb: "Recurring billing via SPL token delegate.",
    idl: subscriptionIdl as Idl,
    programId: new PublicKey((subscriptionIdl as { address: string }).address),
    configAccount: "config",
    hasFee: true,
  },
  {
    key: "events",
    label: "Events (legacy)",
    blurb: "Non-transferable PDA tickets. Superseded by event_tickets.",
    idl: eventsIdl as Idl,
    programId: new PublicKey((eventsIdl as { address: string }).address),
    configAccount: "config",
    hasFee: true,
  },
  {
    key: "rwa_registry",
    label: "RWA issuer registry",
    blurb: "Whitelists licenced issuers — no platform fee layer.",
    idl: registryIdl as Idl,
    programId: new PublicKey((registryIdl as { address: string }).address),
    configAccount: "config",
    hasFee: false,
  },
  {
    key: "marketplace",
    label: "Marketplace",
    blurb: "Public listings + escrow + atomic buy.",
    idl: marketplaceIdl as Idl,
    programId: new PublicKey((marketplaceIdl as { address: string }).address),
    configAccount: "config",
    hasFee: true,
  },
  {
    key: "otc_deals",
    label: "OTC deals",
    blurb: "Bilateral negotiated escrow with expiry.",
    idl: otcIdl as Idl,
    programId: new PublicKey((otcIdl as { address: string }).address),
    configAccount: "config",
    hasFee: true,
  },
  {
    key: "event_tickets",
    label: "Event tickets (cNFT)",
    blurb: "Compressed NFT tickets via Metaplex Bubblegum.",
    idl: eventTicketsIdl as Idl,
    programId: new PublicKey((eventTicketsIdl as { address: string }).address),
    configAccount: "config",
    hasFee: true,
  },
];

export function configPdaFor(programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([CONFIG_SEED], programId);
}

export function loadProgram(descriptor: ProgramDescriptor, provider: AnchorProvider): Program {
  return new Program(descriptor.idl, provider);
}

export type AdminProgramSnapshot = {
  key: string;
  label: string;
  blurb: string;
  programId: string;
  configAddress: string;
  deployed: boolean; // program exists + config initialised
  authority: string | null;
  treasury: string | null; // null for programs without fee layer (rwa_registry)
  feeBps: number | null;
  treasuryBalanceUsdc: number | null;
  issuerCount: number | null; // rwa_registry only
};
