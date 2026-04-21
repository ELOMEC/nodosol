"use client";

import { AnchorProvider, BN, Wallet } from "@coral-xyz/anchor";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { PublicKey } from "@solana/web3.js";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  CheckInDoc,
  extractAssetId,
  insertCheckIn,
  listCheckInsForEvent,
} from "@/lib/checkIns";
import {
  addScanner,
  EventScannerDoc,
  isWalletAuthorised,
  listScannersForEvent,
  removeScanner,
} from "@/lib/eventScanners";
import { eventTicketsProgram } from "@/lib/eventTickets";
import { getAsset } from "@/lib/helius";
import { parseSeatFromName, parseTierLabelFromName } from "@/lib/ticketName";

type EventMeta = {
  address: string;
  creator: string;
  name: string;
  symbol: string;
  merkleTree: string;
  capacity: number;
  sold: number;
};

type ScanResult = {
  kind: "success" | "duplicate" | "error";
  assetId: string;
  message: string;
  assetName: string | null;
  rowLabel: string | null;
  seatNumber: number | null;
  ownerPubkey: string | null;
  existingCheckIn?: CheckInDoc;
};

export function ScanView({ address }: { address: string }) {
  const { connection } = useConnection();
  const wallet = useWallet();
  const { publicKey, connected } = wallet;

  const [event, setEvent] = useState<EventMeta | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [scans, setScans] = useState<CheckInDoc[]>([]);
  const [scanners, setScanners] = useState<EventScannerDoc[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<ScanResult | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const loadEvent = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const provider = new AnchorProvider(
        connection,
        wallet as unknown as Wallet,
        { commitment: "confirmed" }
      );
      const program = eventTicketsProgram(provider);
      const api = (program.account as Record<string, {
        fetch: (addr: PublicKey) => Promise<{
          creator: PublicKey;
          eventId: BN;
          name: string;
          symbol: string;
          merkleTree: PublicKey;
          capacity: BN;
          sold: BN;
        }>;
      }>).event;
      const raw = await api.fetch(new PublicKey(address));
      setEvent({
        address,
        creator: raw.creator.toBase58(),
        name: raw.name,
        symbol: raw.symbol,
        merkleTree: raw.merkleTree.toBase58(),
        capacity: raw.capacity.toNumber(),
        sold: raw.sold.toNumber(),
      });
      const [rows, scannerRows] = await Promise.all([
        listCheckInsForEvent(address),
        listScannersForEvent(address),
      ]);
      setScans(rows);
      setScanners(scannerRows);
    } catch (err) {
      console.error(err);
      setLoadError(err instanceof Error ? err.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [address, connection, wallet]);

  useEffect(() => {
    if (connected) void loadEvent();
  }, [connected, loadEvent]);

  const walletStr = publicKey?.toBase58() ?? null;
  const isCreator = !!(event && walletStr && walletStr === event.creator);
  const isAuthorised = !!(
    event &&
    walletStr &&
    isWalletAuthorised(walletStr, event.creator, scanners)
  );

  async function handleScan(raw: string) {
    const assetId = extractAssetId(raw);
    if (!assetId) {
      setLast({
        kind: "error",
        assetId: raw.trim(),
        message: "That doesn't look like a cNFT asset ID or ticket URL.",
        assetName: null,
        rowLabel: null,
        seatNumber: null,
        ownerPubkey: null,
      });
      return;
    }
    if (!event || !publicKey) return;

    setBusy(true);
    setLast(null);
    try {
      const asset = await getAsset(assetId);
      if (!asset) {
        setLast({
          kind: "error",
          assetId,
          message: "Asset not found on Helius DAS. Is it a real cNFT?",
          assetName: null,
          rowLabel: null,
          seatNumber: null,
          ownerPubkey: null,
        });
        return;
      }
      const tree = asset.compression?.tree;
      if (!tree) {
        setLast({
          kind: "error",
          assetId,
          message: "Asset is not a compressed NFT.",
          assetName: asset.content?.metadata?.name ?? null,
          rowLabel: null,
          seatNumber: null,
          ownerPubkey: asset.ownership?.owner ?? null,
        });
        return;
      }
      if (tree !== event.merkleTree) {
        setLast({
          kind: "error",
          assetId,
          message: `Ticket belongs to a different event (tree ${tree.slice(0, 6)}…).`,
          assetName: asset.content?.metadata?.name ?? null,
          rowLabel: null,
          seatNumber: null,
          ownerPubkey: asset.ownership?.owner ?? null,
        });
        return;
      }

      const assetName = asset.content?.metadata?.name ?? null;
      const seat = assetName ? parseSeatFromName(assetName) : null;
      const tierLabel = assetName ? parseTierLabelFromName(assetName) : null;
      const ownerPubkey = asset.ownership?.owner ?? null;

      // Best-effort tier_id lookup — matches tier.name or section_code.
      let tierId: number | null = null;
      if (tierLabel) {
        try {
          const provider = new AnchorProvider(
            connection,
            wallet as unknown as Wallet,
            { commitment: "confirmed" }
          );
          const program = eventTicketsProgram(provider);
          const eventPk = new PublicKey(address);
          const api = (program.account as Record<string, {
            all: (filters: unknown[]) => Promise<Array<{
              account: {
                tierId: number;
                name: string;
                sectionCode: string;
              };
            }>>;
          }>).ticketTier;
          const tiers = await api.all([
            { memcmp: { offset: 8, bytes: eventPk.toBase58() } },
          ]);
          const hit = tiers.find(
            (t) => t.account.name === tierLabel || t.account.sectionCode === tierLabel
          );
          if (hit) tierId = hit.account.tierId;
        } catch {
          // ignore
        }
      }

      try {
        const checkIn = await insertCheckIn({
          eventPubkey: event.address,
          assetId,
          tierId,
          rowLabel: seat?.rowLabel ?? null,
          seatNumber: seat?.seatNumber ?? null,
          ownerPubkey,
          checkedInBy: publicKey.toBase58(),
        });
        setLast({
          kind: "success",
          assetId,
          message: "Admitted.",
          assetName,
          rowLabel: seat?.rowLabel ?? null,
          seatNumber: seat?.seatNumber ?? null,
          ownerPubkey,
        });
        setScans((prev) => [checkIn, ...prev]);
      } catch (err) {
        if (err instanceof Error && err.message === "DUPLICATE") {
          setLast({
            kind: "duplicate",
            assetId,
            message: "This ticket was already scanned earlier.",
            assetName,
            rowLabel: seat?.rowLabel ?? null,
            seatNumber: seat?.seatNumber ?? null,
            ownerPubkey,
          });
        } else {
          throw err;
        }
      }
      setInput("");
      inputRef.current?.focus();
    } catch (err) {
      console.error(err);
      setLast({
        kind: "error",
        assetId,
        message: err instanceof Error ? err.message : "Scan failed.",
        assetName: null,
        rowLabel: null,
        seatNumber: null,
        ownerPubkey: null,
      });
    } finally {
      setBusy(false);
    }
  }

  if (!connected) {
    return (
      <Shell title="Door scan">
        <Card>
          <Centered>
            <div style={{ fontWeight: 600, marginBottom: "0.4rem" }}>Connect wallet</div>
            <div style={{ fontSize: "0.88rem", color: "#6b7280", marginBottom: "1rem" }}>
              Only the event creator wallet can scan tickets.
            </div>
            <WalletMultiButton />
          </Centered>
        </Card>
      </Shell>
    );
  }

  if (loading) {
    return <Shell title="Door scan"><Card><Centered>Loading event…</Centered></Card></Shell>;
  }
  if (loadError || !event) {
    return (
      <Shell title="Door scan">
        <Card><Centered>Failed: {loadError ?? "event not found"}</Centered></Card>
      </Shell>
    );
  }

  if (!isAuthorised) {
    return (
      <Shell title={`Door scan — ${event.name}`}>
        <Card>
          <Centered>
            <div style={{ color: "#b91c1c", fontWeight: 600, marginBottom: "0.4rem" }}>
              Not authorised
            </div>
            <div style={{ fontSize: "0.85rem", color: "#6b7280" }}>
              This wallet isn&apos;t on the scanner roster for this event. Ask the creator ({event.creator.slice(0, 6)}…{event.creator.slice(-4)}) to add you.
            </div>
          </Centered>
        </Card>
      </Shell>
    );
  }

  return (
    <Shell
      title={`Door scan — ${event.name}`}
      subtitle={
        <>
          {event.symbol} · {scans.length} checked in / {event.sold} sold (capacity {event.capacity}) ·{" "}
          <Link href={`/creator/events`} style={{ color: "#4f46e5", textDecoration: "none" }}>
            ← All events
          </Link>
        </>
      }
    >
      <Card>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!busy && input.trim()) void handleScan(input);
          }}
          style={{ display: "flex", gap: "0.5rem", alignItems: "stretch", marginBottom: "0.75rem" }}
        >
          <input
            ref={inputRef}
            autoFocus
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Paste asset ID or ticket URL and press Enter"
            style={{
              flex: 1,
              padding: "0.65rem 0.85rem",
              fontSize: "0.95rem",
              borderRadius: 8,
              border: "1px solid var(--shell-border, #eef0f3)",
              background: "var(--shell-card, #fff)",
              color: "var(--shell-fg, #111827)",
            }}
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            style={{
              padding: "0.5rem 1.25rem",
              borderRadius: 8,
              border: "none",
              background: busy || !input.trim() ? "#c7d2fe" : "#4f46e5",
              color: "#fff",
              fontSize: "0.9rem",
              fontWeight: 600,
              cursor: busy || !input.trim() ? "not-allowed" : "pointer",
            }}
          >
            {busy ? "Verifying…" : "Scan"}
          </button>
        </form>
        <div style={{ fontSize: "0.75rem", color: "#6b7280" }}>
          Paste the ticket&apos;s cNFT asset ID, or paste the URL you get from{" "}
          <code>/marketplace/tickets/&lt;id&gt;</code>. The scanner verifies the
          ticket belongs to this event and records the check-in.
        </div>
        {last && <ResultBanner result={last} />}
      </Card>

      <div style={{ marginTop: "1rem" }}>
        <Card>
          <div style={{ fontSize: "0.82rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", color: "#6b7280", marginBottom: "0.6rem" }}>
            Recent check-ins ({scans.length})
          </div>
          {scans.length === 0 ? (
            <div style={{ fontSize: "0.85rem", color: "#6b7280", padding: "1rem 0" }}>
              No scans yet. Start by pasting a ticket URL above.
            </div>
          ) : (
            <div style={{ display: "grid", gap: "0.4rem" }}>
              {scans.map((s) => (
                <ScanRow
                  key={s.id}
                  scan={s}
                  scannerLabel={scannerLabelFor(s.checkedInBy, event.creator, scanners)}
                />
              ))}
            </div>
          )}
        </Card>
      </div>

      {isCreator && (
        <div style={{ marginTop: "1rem" }}>
          <StaffPanel
            eventPubkey={event.address}
            creatorPubkey={event.creator}
            scanners={scanners}
            onAdd={async (scannerPubkey, label) => {
              if (!publicKey) return;
              const doc = await addScanner({
                eventPubkey: event.address,
                scannerPubkey,
                label,
                addedBy: publicKey.toBase58(),
              });
              setScanners((prev) => [...prev, doc]);
            }}
            onRemove={async (id) => {
              await removeScanner(id);
              setScanners((prev) => prev.filter((s) => s.id !== id));
            }}
          />
        </div>
      )}
    </Shell>
  );
}

function scannerLabelFor(
  pubkey: string,
  creatorPubkey: string,
  scanners: EventScannerDoc[]
): string | null {
  if (pubkey === creatorPubkey) return "Creator";
  const hit = scanners.find((s) => s.scannerPubkey === pubkey);
  return hit?.label ?? null;
}

function StaffPanel({
  eventPubkey,
  creatorPubkey,
  scanners,
  onAdd,
  onRemove,
}: {
  eventPubkey: string;
  creatorPubkey: string;
  scanners: EventScannerDoc[];
  onAdd: (scannerPubkey: string, label: string | null) => Promise<void>;
  onRemove: (id: number) => Promise<void>;
}) {
  const [pubkey, setPubkey] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    const trimmed = pubkey.trim();
    if (!trimmed) return;
    if (trimmed === creatorPubkey) {
      setErr("Creator wallet already scans by default — no need to add.");
      return;
    }
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(trimmed)) {
      setErr("That doesn't look like a valid Solana pubkey.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await onAdd(trimmed, label.trim() || null);
      setPubkey("");
      setLabel("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Add failed.");
    } finally {
      setBusy(false);
    }
  }

  // keep eventPubkey linter-silent; it's in the interface for auditability
  void eventPubkey;

  return (
    <Card>
      <div style={{ fontSize: "0.82rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", color: "#6b7280", marginBottom: "0.65rem" }}>
        Staff scanners ({scanners.length})
      </div>
      <div style={{ fontSize: "0.78rem", color: "#6b7280", marginBottom: "0.75rem" }}>
        Add one wallet per entrance — door staff connects that wallet on this page to admit tickets. The creator wallet can always scan, even if not listed here.
      </div>

      {scanners.length > 0 ? (
        <div style={{ display: "grid", gap: "0.4rem", marginBottom: "0.9rem" }}>
          {scanners.map((s) => (
            <div
              key={s.id}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr auto",
                gap: "0.5rem",
                alignItems: "center",
                padding: "0.55rem 0.7rem",
                border: "1px solid var(--shell-border, #eef0f3)",
                borderRadius: 7,
              }}
            >
              <div>
                <div style={{ fontSize: "0.86rem", fontWeight: 600 }}>
                  {s.label || "(unnamed entrance)"}
                </div>
                <code style={{ fontSize: "0.7rem", color: "#9ca3af" }}>
                  {s.scannerPubkey.slice(0, 10)}…{s.scannerPubkey.slice(-6)}
                </code>
              </div>
              <button
                type="button"
                onClick={() => void onRemove(s.id)}
                style={{
                  padding: "0.35rem 0.7rem",
                  borderRadius: 5,
                  border: "1px solid #fecaca",
                  background: "transparent",
                  color: "#b91c1c",
                  fontSize: "0.76rem",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      ) : null}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!busy) void submit();
        }}
        style={{ display: "grid", gridTemplateColumns: "2fr 1fr auto", gap: "0.45rem" }}
      >
        <input
          type="text"
          value={pubkey}
          onChange={(e) => setPubkey(e.target.value)}
          placeholder="Scanner wallet pubkey"
          style={{
            padding: "0.5rem 0.65rem",
            borderRadius: 6,
            border: "1px solid var(--shell-border, #eef0f3)",
            background: "var(--shell-card, #fff)",
            color: "var(--shell-fg, #111827)",
            fontSize: "0.8rem",
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          }}
        />
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Entrance label (optional)"
          style={{
            padding: "0.5rem 0.65rem",
            borderRadius: 6,
            border: "1px solid var(--shell-border, #eef0f3)",
            background: "var(--shell-card, #fff)",
            color: "var(--shell-fg, #111827)",
            fontSize: "0.8rem",
          }}
        />
        <button
          type="submit"
          disabled={busy || !pubkey.trim()}
          style={{
            padding: "0.5rem 1rem",
            borderRadius: 6,
            border: "none",
            background: busy || !pubkey.trim() ? "#c7d2fe" : "#4f46e5",
            color: "#fff",
            fontSize: "0.8rem",
            fontWeight: 600,
            cursor: busy || !pubkey.trim() ? "not-allowed" : "pointer",
            whiteSpace: "nowrap",
          }}
        >
          {busy ? "Adding…" : "Add scanner"}
        </button>
      </form>
      {err && (
        <div style={{ marginTop: "0.5rem", fontSize: "0.75rem", color: "#b91c1c" }}>{err}</div>
      )}
    </Card>
  );
}

function ResultBanner({ result }: { result: ScanResult }) {
  const palette = (() => {
    if (result.kind === "success") return { bg: "#dcfce7", fg: "#166534", accent: "#14532d" };
    if (result.kind === "duplicate") return { bg: "#fef3c7", fg: "#92400e", accent: "#78350f" };
    return { bg: "#fef2f2", fg: "#b91c1c", accent: "#7f1d1d" };
  })();
  return (
    <div
      style={{
        marginTop: "0.85rem",
        background: palette.bg,
        color: palette.fg,
        border: `1px solid ${palette.accent}22`,
        borderRadius: 10,
        padding: "0.85rem 1rem",
      }}
    >
      <div style={{ fontSize: "1rem", fontWeight: 700, marginBottom: "0.3rem", textTransform: "uppercase", letterSpacing: "0.04em" }}>
        {result.kind === "success" ? "✓ Admit" : result.kind === "duplicate" ? "⚠ Already scanned" : "× Reject"}
      </div>
      <div style={{ fontSize: "0.85rem", marginBottom: result.assetName ? "0.4rem" : 0 }}>
        {result.message}
      </div>
      {result.assetName && (
        <div style={{ fontSize: "0.82rem", fontWeight: 600 }}>
          {result.assetName}
        </div>
      )}
      {result.rowLabel && result.seatNumber ? (
        <div style={{ fontSize: "0.82rem", marginTop: "0.2rem" }}>
          Row <strong>{result.rowLabel}</strong> · Seat <strong>{result.seatNumber}</strong>
        </div>
      ) : null}
      {result.ownerPubkey && (
        <div style={{ fontSize: "0.72rem", marginTop: "0.35rem", opacity: 0.85 }}>
          Holder: {result.ownerPubkey.slice(0, 6)}…{result.ownerPubkey.slice(-4)}
        </div>
      )}
    </div>
  );
}

function ScanRow({ scan, scannerLabel }: { scan: CheckInDoc; scannerLabel: string | null }) {
  const when = new Date(scan.checkedInAt);
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "auto 1fr auto",
        gap: "0.55rem",
        alignItems: "center",
        padding: "0.55rem 0.7rem",
        border: "1px solid var(--shell-border, #eef0f3)",
        borderRadius: 7,
        background: "var(--shell-card, #fff)",
      }}
    >
      <div
        style={{
          width: 34,
          height: 34,
          borderRadius: 8,
          background: scan.rowLabel ? "#4f46e5" : "#9ca3af",
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "0.75rem",
          fontWeight: 700,
        }}
      >
        {scan.rowLabel ? `${scan.rowLabel}${scan.seatNumber}` : "GA"}
      </div>
      <div>
        <div style={{ fontSize: "0.82rem", fontWeight: 600 }}>
          {scan.rowLabel && scan.seatNumber
            ? `Row ${scan.rowLabel}, Seat ${scan.seatNumber}`
            : "General admission"}
        </div>
        <div style={{ fontSize: "0.7rem", color: "#6b7280" }}>
          {scan.ownerPubkey
            ? `Holder ${scan.ownerPubkey.slice(0, 6)}…${scan.ownerPubkey.slice(-4)}`
            : "Holder unknown"}
          {" · "}
          <code style={{ fontSize: "0.68rem", color: "#9ca3af" }}>{scan.assetId.slice(0, 8)}…</code>
        </div>
      </div>
      <div style={{ fontSize: "0.72rem", color: "#6b7280", whiteSpace: "nowrap", textAlign: "right" }}>
        <div>{when.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
        {scannerLabel && (
          <div style={{ fontSize: "0.66rem", color: "#9ca3af", marginTop: "0.1rem" }}>
            via {scannerLabel}
          </div>
        )}
      </div>
    </div>
  );
}

function Shell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <>
      <header style={{ marginBottom: "1.25rem" }}>
        <h1 style={{ fontSize: "1.45rem", letterSpacing: "-0.02em", marginBottom: "0.25rem", fontWeight: 600 }}>
          {title}
        </h1>
        {subtitle && <div style={{ color: "#6b7280", fontSize: "0.85rem" }}>{subtitle}</div>}
      </header>
      {children}
    </>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: "var(--shell-card, #fff)",
        border: "1px solid var(--shell-border, #eef0f3)",
        borderRadius: 12,
        padding: "1rem 1.2rem",
      }}
    >
      {children}
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: "2rem 1rem", textAlign: "center", color: "#6b7280" }}>
      {children}
    </div>
  );
}
