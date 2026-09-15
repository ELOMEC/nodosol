"use client";

import { useConnection } from "@solana/wallet-adapter-react";
import {
  AccountInfo,
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
} from "@solana/web3.js";
import bs58 from "bs58";
import { useCallback, useState } from "react";

import auctionsIdl from "@/idl/auctions.json";
import eventTicketsIdl from "@/idl/event_tickets.json";
import eventsIdl from "@/idl/events.json";
import marketplaceIdl from "@/idl/marketplace.json";
import otcIdl from "@/idl/otc_deals.json";
import subscriptionIdl from "@/idl/subscription.json";
import tipJarIdl from "@/idl/tip_jar.json";

import { configPdaFor } from "@/lib/admin";
import { useToast } from "@/components/ToastProvider";

type PauseTarget = { label: string; programId: PublicKey };

const PAUSE_TARGETS: PauseTarget[] = [
  { label: "tip_jar", programId: new PublicKey((tipJarIdl as { address: string }).address) },
  { label: "subscription", programId: new PublicKey((subscriptionIdl as { address: string }).address) },
  { label: "events", programId: new PublicKey((eventsIdl as { address: string }).address) },
  { label: "event_tickets", programId: new PublicKey((eventTicketsIdl as { address: string }).address) },
  { label: "marketplace", programId: new PublicKey((marketplaceIdl as { address: string }).address) },
  { label: "otc_deals", programId: new PublicKey((otcIdl as { address: string }).address) },
  { label: "auctions", programId: new PublicKey((auctionsIdl as { address: string }).address) },
];

// Anchor sighash for `global:update_pause` — identical across all 7 programs
// since the instruction name is the same.
const UPDATE_PAUSE_DISCRIMINATOR = Buffer.from([6, 56, 103, 134, 181, 122, 69, 108]);

// All 7 Config structs share the same prefix layout: 8-byte discriminator,
// then `authority: Pubkey` (32 bytes). We slice raw account data instead of
// instantiating an Anchor Program per IDL because auctions uses a different
// account name (`AuctionConfig` vs `Config`).
const AUTHORITY_OFFSET = 8;
const PUBKEY_BYTES = 32;

type Resolved = {
  target: PauseTarget;
  configPda: PublicKey;
  authority: PublicKey | null;
  missing: boolean;
  error: string | null;
};

type PayloadState =
  | { kind: "idle" }
  | { kind: "loading" }
  | {
      kind: "ready";
      payload: string;
      authority: PublicKey;
      resolved: Resolved[];
      mismatched: Resolved[];
      missing: Resolved[];
      blockhash: string;
    }
  | { kind: "error"; message: string };

function parseAuthority(info: AccountInfo<Buffer> | null): PublicKey | null {
  if (!info || info.data.length < AUTHORITY_OFFSET + PUBKEY_BYTES) return null;
  const slice = info.data.subarray(AUTHORITY_OFFSET, AUTHORITY_OFFSET + PUBKEY_BYTES);
  return new PublicKey(slice);
}

function buildPauseIx(
  programId: PublicKey,
  configPda: PublicKey,
  authority: PublicKey,
  paused: boolean
): TransactionInstruction {
  const data = Buffer.concat([UPDATE_PAUSE_DISCRIMINATOR, Buffer.from([paused ? 1 : 0])]);
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: authority, isSigner: true, isWritable: false },
      { pubkey: configPda, isSigner: false, isWritable: true },
    ],
    data,
  });
}

export function AdminPanicButton() {
  const { connection } = useConnection();
  const toast = useToast();
  const [state, setState] = useState<PayloadState>({ kind: "idle" });
  const [copied, setCopied] = useState(false);

  const buildPayload = useCallback(async () => {
    setState({ kind: "loading" });
    setCopied(false);
    try {
      const configs = PAUSE_TARGETS.map((target) => {
        const [configPda] = configPdaFor(target.programId);
        return { target, configPda };
      });
      const infos = await connection.getMultipleAccountsInfo(
        configs.map((c) => c.configPda),
        "confirmed"
      );
      const resolved: Resolved[] = configs.map((c, i) => {
        const info = infos[i];
        if (!info) {
          return {
            target: c.target,
            configPda: c.configPda,
            authority: null,
            missing: true,
            error: "config PDA not found",
          };
        }
        const authority = parseAuthority(info as AccountInfo<Buffer>);
        if (!authority) {
          return {
            target: c.target,
            configPda: c.configPda,
            authority: null,
            missing: false,
            error: "could not parse authority",
          };
        }
        return {
          target: c.target,
          configPda: c.configPda,
          authority,
          missing: false,
          error: null,
        };
      });

      const live = resolved.filter((r) => r.authority !== null);
      const missing = resolved.filter((r) => r.missing || r.error !== null);
      if (live.length === 0) {
        setState({
          kind: "error",
          message: "No deployed configs found — cannot build pause payload.",
        });
        return;
      }

      const firstAuthority = live[0].authority!;
      const mismatched = live.filter(
        (r) => r.authority !== null && !r.authority.equals(firstAuthority)
      );

      const ixs = live.map((r) =>
        buildPauseIx(r.target.programId, r.configPda, r.authority!, true)
      );

      const { blockhash } = await connection.getLatestBlockhash("finalized");
      const message = new TransactionMessage({
        payerKey: firstAuthority,
        recentBlockhash: blockhash,
        instructions: ixs,
      }).compileToLegacyMessage();
      const payload = bs58.encode(message.serialize());

      setState({
        kind: "ready",
        payload,
        authority: firstAuthority,
        resolved,
        mismatched,
        missing,
        blockhash,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Build failed";
      setState({ kind: "error", message: msg });
    }
  }, [connection]);

  const onCopy = useCallback(async () => {
    if (state.kind !== "ready") return;
    try {
      await navigator.clipboard.writeText(state.payload);
      setCopied(true);
      toast.success("Pause payload copied — paste into Squads UI");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Clipboard write failed");
    }
  }, [state, toast]);

  return (
    <section
      style={{
        background: "var(--shell-card)",
        border: "1px solid #b91c1c",
        borderLeft: "4px solid #b91c1c",
        borderRadius: 12,
        padding: "1.1rem 1.3rem",
        marginBottom: "1.5rem",
      }}
    >
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: "1rem",
          marginBottom: "0.75rem",
        }}
      >
        <div>
          <h2 style={{ fontSize: "1.05rem", fontWeight: 600, marginBottom: "0.2rem", color: "#dc2626" }}>
            Panic — pause all fund-moving programs
          </h2>
          <p style={{ fontSize: "0.8rem", color: "var(--shell-muted)", maxWidth: 640 }}>
            Builds <code>update_pause(true)</code> for the 7 paused programs (tip_jar, subscription, events,
            event_tickets, marketplace, otc_deals, auctions) bundled into one transaction message. The button
            never sends — it only emits a base58 payload to paste into the Squads UI as a vault transaction
            proposal. Squads remains the security gate.
          </p>
        </div>
        <button
          onClick={() => void buildPayload()}
          disabled={state.kind === "loading"}
          style={btnDestructive}
        >
          {state.kind === "loading" ? "Building…" : "Build pause payload"}
        </button>
      </header>

      {state.kind === "error" ? (
        <div style={{ fontSize: "0.85rem", color: "#b91c1c" }}>Failed: {state.message}</div>
      ) : null}

      {state.kind === "ready" ? (
        <div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: "0.5rem",
              marginBottom: "0.85rem",
            }}
          >
            <Tile label="Pause ixs" value={String(state.resolved.filter((r) => r.authority !== null).length)} />
            <Tile label="Authority" value={shorten(state.authority.toBase58())} mono copy={state.authority.toBase58()} />
            <Tile label="Recent blockhash" value={shorten(state.blockhash)} mono />
            <Tile label="Payload bytes" value={String(state.payload.length)} />
          </div>

          {state.missing.length > 0 ? (
            <Notice tone="warn">
              Skipped {state.missing.length} program(s) without a deployed config:{" "}
              {state.missing.map((m) => m.target.label).join(", ")}
            </Notice>
          ) : null}

          {state.mismatched.length > 0 ? (
            <Notice tone="error">
              Authority mismatch: {state.mismatched.map((m) => m.target.label).join(", ")} use a different
              authority than {shorten(state.authority.toBase58())}. Squads can only sign for one vault — pause
              those programs in a separate proposal.
            </Notice>
          ) : null}

          <textarea
            readOnly
            value={state.payload}
            style={{
              width: "100%",
              minHeight: 110,
              fontFamily: "'SF Mono', Menlo, monospace",
              fontSize: "0.74rem",
              background: "var(--shell-pill-bg)",
              color: "var(--shell-fg)",
              border: "1px solid var(--shell-border)",
              borderRadius: 8,
              padding: "0.6rem 0.75rem",
              resize: "vertical",
              wordBreak: "break-all",
            }}
            onFocus={(e) => e.currentTarget.select()}
          />
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "0.6rem",
              marginTop: "0.6rem",
            }}
          >
            <div style={{ fontSize: "0.78rem", color: "var(--shell-muted)" }}>
              Paste this into Squads → Build Transaction → Import (base58 message). Two signers must approve
              before the pause executes.
            </div>
            <button onClick={() => void onCopy()} style={btnSecondary}>
              {copied ? "Copied ✓" : "Copy payload"}
            </button>
          </div>
        </div>
      ) : null}

      {state.kind === "idle" ? (
        <div style={{ fontSize: "0.78rem", color: "var(--shell-muted)" }}>
          Click to fetch each program&apos;s authority and assemble the payload. Nothing is signed or sent.
        </div>
      ) : null}
    </section>
  );
}

function Tile({
  label,
  value,
  mono,
  copy,
}: {
  label: string;
  value: string;
  mono?: boolean;
  copy?: string;
}) {
  const [tileCopied, setTileCopied] = useState(false);
  return (
    <div
      style={{
        background: "var(--shell-pill-bg)",
        border: "1px solid var(--shell-border)",
        borderRadius: 8,
        padding: "0.55rem 0.75rem",
      }}
    >
      <div
        style={{
          fontSize: "0.66rem",
          color: "var(--shell-muted)",
          marginBottom: "0.2rem",
          letterSpacing: 0.5,
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.4rem" }}>
        <div
          style={{
            fontSize: mono ? "0.8rem" : "0.95rem",
            fontWeight: 600,
            color: "var(--shell-fg)",
            fontFamily: mono ? "'SF Mono', Menlo, monospace" : "inherit",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {value}
        </div>
        {copy ? (
          <button
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(copy);
                setTileCopied(true);
                setTimeout(() => setTileCopied(false), 1200);
              } catch {
                // ignore
              }
            }}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--shell-muted)",
              cursor: "pointer",
              fontSize: "0.7rem",
              padding: "0.15rem 0.3rem",
            }}
          >
            {tileCopied ? "✓" : "Copy"}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function Notice({ tone, children }: { tone: "warn" | "error"; children: React.ReactNode }) {
  const palette =
    tone === "error"
      ? { bg: "rgba(239,68,68,0.1)", fg: "#b91c1c", border: "rgba(239,68,68,0.35)" }
      : { bg: "rgba(245,158,11,0.12)", fg: "#b45309", border: "rgba(245,158,11,0.35)" };
  return (
    <div
      style={{
        background: palette.bg,
        color: palette.fg,
        border: `1px solid ${palette.border}`,
        borderRadius: 8,
        padding: "0.5rem 0.75rem",
        fontSize: "0.78rem",
        marginBottom: "0.75rem",
      }}
    >
      {children}
    </div>
  );
}

function shorten(s: string): string {
  return s.length > 12 ? `${s.slice(0, 6)}…${s.slice(-6)}` : s;
}

const btnDestructive: React.CSSProperties = {
  background: "#dc2626",
  color: "#fff",
  border: "none",
  padding: "0.55rem 1.2rem",
  borderRadius: 8,
  fontSize: "0.84rem",
  fontWeight: 600,
  cursor: "pointer",
};

const btnSecondary: React.CSSProperties = {
  background: "var(--shell-card)",
  color: "var(--shell-fg)",
  border: "1px solid var(--shell-border-strong)",
  padding: "0.45rem 0.95rem",
  borderRadius: 8,
  fontSize: "0.8rem",
  fontWeight: 600,
  cursor: "pointer",
};
