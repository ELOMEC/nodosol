"use client";

import { AnchorProvider, BN, Wallet } from "@coral-xyz/anchor";
import {
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import {
  ComputeBudgetProgram,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { getUsdcMint, USDC_UNIT } from "@/lib/constants";
import {
  ACCOUNT_COMPRESSION_PROGRAM_ID,
  BUBBLEGUM_PROGRAM_ID,
  buildCreateMerkleTreeAccountIx,
  eventPda as deriveEventPda,
  eventTicketsProgram,
  eventVaultPda as deriveVaultPda,
  MERKLE_TREE_ACCOUNT_SIZE,
  NOOP_PROGRAM_ID,
  treeConfigPda,
} from "@/lib/eventTickets";
import {
  EventMetadata,
  uploadEventMetadata,
  uploadEventPoster,
} from "@/lib/eventUploads";
import { VENUE_TEMPLATES } from "@/lib/venue-templates";
import {
  listVenueLayoutsByCreator,
  upsertEventVenueMapping,
  VenueLayoutDoc,
} from "@/lib/venueLayouts";
import { simulateAndSend } from "@/lib/tx";

type Basics = {
  name: string;
  symbol: string;
  description: string;
  durationHours: string;
  priceUsdc: string;
  capacity: string;
  posterFile: File | null;
  posterPreviewUrl: string | null;
};

type VenueChoice =
  | { kind: "none" }
  | { kind: "builtin"; id: string }
  | { kind: "custom"; id: string };

type Step = 1 | 2 | 3;

export function NewEventWizard() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const { publicKey, connected } = wallet;
  const router = useRouter();

  const [step, setStep] = useState<Step>(1);
  const [basics, setBasics] = useState<Basics>({
    name: "",
    symbol: "",
    description: "",
    durationHours: "72",
    priceUsdc: "25",
    capacity: "100",
    posterFile: null,
    posterPreviewUrl: null,
  });
  const [venue, setVenue] = useState<VenueChoice>({ kind: "none" });
  const [customLayouts, setCustomLayouts] = useState<VenueLayoutDoc[]>([]);
  const [loadingLayouts, setLoadingLayouts] = useState(false);
  const [publishing, setPublishing] = useState<{
    stage:
      | "idle"
      | "uploadingPoster"
      | "uploadingMetadata"
      | "createEvent"
      | "initTree"
      | "bindVenue"
      | "done";
    message?: string;
  }>({ stage: "idle" });

  const loadLayouts = useCallback(async () => {
    if (!publicKey) return;
    setLoadingLayouts(true);
    try {
      const list = await listVenueLayoutsByCreator(publicKey.toBase58());
      setCustomLayouts(list);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingLayouts(false);
    }
  }, [publicKey]);

  useEffect(() => {
    if (connected && publicKey) void loadLayouts();
  }, [connected, publicKey, loadLayouts]);

  function onPoster(file: File | null) {
    setBasics((prev) => {
      if (prev.posterPreviewUrl) URL.revokeObjectURL(prev.posterPreviewUrl);
      return {
        ...prev,
        posterFile: file,
        posterPreviewUrl: file ? URL.createObjectURL(file) : null,
      };
    });
  }

  function basicsValid(): boolean {
    if (!basics.name.trim()) return false;
    if (!basics.symbol.trim()) return false;
    const dh = parseFloat(basics.durationHours);
    if (!Number.isFinite(dh) || dh <= 0) return false;
    const p = parseFloat(basics.priceUsdc);
    if (!Number.isFinite(p) || p < 0) return false;
    const c = parseInt(basics.capacity, 10);
    if (!Number.isInteger(c) || c <= 0) return false;
    return true;
  }

  async function publish() {
    if (!publicKey) return;
    if (!basicsValid()) {
      window.alert("Please fill all basics before publishing.");
      return;
    }
    const eventId = BigInt(Math.floor(Date.now() / 1000));
    const creator = publicKey;
    const [event] = deriveEventPda(creator, eventId);
    const [vault] = deriveVaultPda(event);

    try {
      // 1. Upload the poster (if provided) — becomes the cNFT image.
      let imageUrl = "";
      if (basics.posterFile) {
        setPublishing({ stage: "uploadingPoster" });
        imageUrl = await uploadEventPoster(creator.toBase58(), basics.posterFile);
      }

      // 2. Build + upload the Metaplex metadata JSON.
      setPublishing({ stage: "uploadingMetadata" });
      const metadata: EventMetadata = {
        name: basics.name.trim(),
        symbol: basics.symbol.trim().toUpperCase(),
        description: basics.description.trim(),
        image: imageUrl,
      };
      if (venue.kind === "builtin") metadata.venueTemplate = venue.id;
      const metadataUri = await uploadEventMetadata(
        creator.toBase58(),
        eventId,
        metadata
      );

      // 3. create_event instruction.
      setPublishing({ stage: "createEvent" });
      const provider = new AnchorProvider(
        connection,
        wallet as unknown as Wallet,
        { commitment: "confirmed" }
      );
      const program = eventTicketsProgram(provider);

      const durationHours = parseFloat(basics.durationHours);
      const priceUsdc = parseFloat(basics.priceUsdc);
      const capacity = parseInt(basics.capacity, 10);
      const startsAt = Math.floor(Date.now() / 1000);
      const endsAt = startsAt + Math.round(durationHours * 3600);
      const priceBase = BigInt(Math.round(priceUsdc * USDC_UNIT));

      const createIx = await program.methods
        .createEvent(
          new BN(eventId.toString()),
          new BN(priceBase.toString()),
          new BN(capacity),
          new BN(startsAt),
          new BN(endsAt),
          basics.name.trim(),
          basics.symbol.trim().toUpperCase(),
          metadataUri
        )
        .accounts({
          creator,
          paymentMint: getUsdcMint(),
          event,
          vault,
          paymentTokenProgram: TOKEN_2022_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        } as never)
        .instruction();

      {
        const sig = await simulateAndSend(connection, wallet, {
          feePayer: creator,
          instructions: [
          ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
          createIx,
        ],
        });
      }

      // 4. initialize_event_tree — allocates Merkle tree account + Bubblegum config.
      setPublishing({ stage: "initTree" });
      const merkleTreeKp = Keypair.generate();
      const rent = await connection.getMinimumBalanceForRentExemption(
        MERKLE_TREE_ACCOUNT_SIZE
      );
      const createAccIx = buildCreateMerkleTreeAccountIx(
        creator,
        merkleTreeKp.publicKey,
        rent
      );
      const [tc] = treeConfigPda(merkleTreeKp.publicKey);
      const initIx = await program.methods
        .initializeEventTree()
        .accounts({
          creator,
          event,
          treeConfig: tc,
          merkleTree: merkleTreeKp.publicKey,
          bubblegumProgram: BUBBLEGUM_PROGRAM_ID,
          compressionProgram: ACCOUNT_COMPRESSION_PROGRAM_ID,
          logWrapper: NOOP_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        } as never)
        .instruction();
      await simulateAndSend(connection, wallet, {
        feePayer: creator,
        instructions: [
          ComputeBudgetProgram.setComputeUnitLimit({ units: 500_000 }),
          createAccIx,
          initIx,
        ],
        signers: [merkleTreeKp],
      });

      // 5. Bind custom venue (off-chain Supabase record).
      if (venue.kind === "custom") {
        setPublishing({ stage: "bindVenue" });
        try {
          await upsertEventVenueMapping(
            event.toBase58(),
            venue.id,
            creator.toBase58()
          );
        } catch (err) {
          console.warn("venue binding failed — event still usable", err);
        }
      }

      setPublishing({ stage: "done" });
      router.push(`/creator/events/${event.toBase58()}/tiers`);
    } catch (err) {
      console.error(err);
      window.alert(err instanceof Error ? err.message : "Publish failed.");
      setPublishing({ stage: "idle" });
    }
  }

  if (!connected) {
    return (
      <Shell title="New event">
        <Card>
          <Centered>
            <div style={{ fontWeight: 600, marginBottom: "0.4rem" }}>Connect wallet</div>
            <div style={{ fontSize: "0.88rem", color: "#6b7280", marginBottom: "1rem" }}>
              Create events under your creator wallet.
            </div>
            <WalletMultiButton />
          </Centered>
        </Card>
      </Shell>
    );
  }

  const isPublishing = publishing.stage !== "idle" && publishing.stage !== "done";

  return (
    <Shell
      title="New event"
      subtitle={
        <Link href="/creator/events" style={{ color: "#6b7280", textDecoration: "none" }}>
          ← All events
        </Link>
      }
    >
      <Stepper current={step} />

      {step === 1 && (
        <BasicsStep
          basics={basics}
          onChange={setBasics}
          onPoster={onPoster}
          onNext={() => {
            if (!basicsValid()) {
              window.alert("Fill all basics — name, symbol, duration, price, capacity.");
              return;
            }
            setStep(2);
          }}
        />
      )}

      {step === 2 && (
        <VenueStep
          venue={venue}
          onVenue={setVenue}
          customLayouts={customLayouts}
          loadingLayouts={loadingLayouts}
          onBack={() => setStep(1)}
          onNext={() => setStep(3)}
        />
      )}

      {step === 3 && (
        <ReviewStep
          basics={basics}
          venue={venue}
          customLayouts={customLayouts}
          publishing={publishing}
          disabled={isPublishing}
          onBack={() => setStep(2)}
          onPublish={() => void publish()}
        />
      )}
    </Shell>
  );
}

function Stepper({ current }: { current: Step }) {
  const steps: Array<{ n: Step; label: string }> = [
    { n: 1, label: "Basics" },
    { n: 2, label: "Venue" },
    { n: 3, label: "Review + publish" },
  ];
  return (
    <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.25rem" }}>
      {steps.map((s, i) => (
        <div
          key={s.n}
          style={{
            flex: 1,
            padding: "0.65rem 0.9rem",
            borderRadius: 8,
            border: "1px solid",
            borderColor: s.n === current ? "#4f46e5" : "var(--shell-border, #eef0f3)",
            background: s.n === current ? "#eef2ff" : "var(--shell-card, #fff)",
            color: s.n === current ? "#3730a3" : s.n < current ? "#111827" : "#6b7280",
          }}
        >
          <div style={{ fontSize: "0.7rem", fontWeight: 600, letterSpacing: "0.04em" }}>
            STEP {i + 1}
          </div>
          <div style={{ fontSize: "0.9rem", fontWeight: 600 }}>
            {s.n < current ? "✓ " : ""}{s.label}
          </div>
        </div>
      ))}
    </div>
  );
}

function BasicsStep({
  basics,
  onChange,
  onPoster,
  onNext,
}: {
  basics: Basics;
  onChange: (b: Basics) => void;
  onPoster: (f: File | null) => void;
  onNext: () => void;
}) {
  return (
    <Card>
      <SectionTitle>Event basics</SectionTitle>
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "0.75rem", marginBottom: "0.75rem" }}>
        <Field label="Event name">
          <input
            type="text"
            value={basics.name}
            onChange={(e) => onChange({ ...basics, name: e.target.value })}
            placeholder="e.g. Basketball Cup — Final Four"
            style={inputStyle}
          />
        </Field>
        <Field label="Symbol (2–16 chars)">
          <input
            type="text"
            value={basics.symbol}
            onChange={(e) => onChange({ ...basics, symbol: e.target.value.toUpperCase().slice(0, 16) })}
            placeholder="B4F"
            style={{ ...inputStyle, fontFamily: "ui-monospace, Menlo, monospace" }}
          />
        </Field>
      </div>

      <Field label="Description (shown on the event detail page)">
        <textarea
          value={basics.description}
          onChange={(e) => onChange({ ...basics, description: e.target.value })}
          placeholder="Two-line pitch, venue context, headliners…"
          rows={3}
          style={{ ...inputStyle, resize: "vertical", minHeight: 70 }}
        />
      </Field>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: "0.75rem",
          marginTop: "0.75rem",
        }}
      >
        <Field label="Sale window (hours)">
          <input
            type="number"
            min={1}
            value={basics.durationHours}
            onChange={(e) => onChange({ ...basics, durationHours: e.target.value })}
            style={inputStyle}
          />
        </Field>
        <Field label="Base price (USDC)">
          <input
            type="number"
            min={0}
            step="0.01"
            value={basics.priceUsdc}
            onChange={(e) => onChange({ ...basics, priceUsdc: e.target.value })}
            style={inputStyle}
          />
        </Field>
        <Field label="Total capacity (tickets)">
          <input
            type="number"
            min={1}
            value={basics.capacity}
            onChange={(e) => onChange({ ...basics, capacity: e.target.value })}
            style={inputStyle}
          />
        </Field>
      </div>

      <div style={{ marginTop: "1rem" }}>
        <SectionTitle>Poster (optional)</SectionTitle>
        <PosterPicker
          previewUrl={basics.posterPreviewUrl}
          onFile={onPoster}
        />
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "1rem" }}>
        <button
          type="button"
          onClick={onNext}
          style={primaryBtn(false)}
        >
          Next: pick a venue →
        </button>
      </div>
    </Card>
  );
}

function VenueStep({
  venue,
  onVenue,
  customLayouts,
  loadingLayouts,
  onBack,
  onNext,
}: {
  venue: VenueChoice;
  onVenue: (v: VenueChoice) => void;
  customLayouts: VenueLayoutDoc[];
  loadingLayouts: boolean;
  onBack: () => void;
  onNext: () => void;
}) {
  return (
    <Card>
      <SectionTitle>Pick a venue layout</SectionTitle>
      <div style={{ fontSize: "0.82rem", color: "#6b7280", marginBottom: "0.9rem" }}>
        The venue defines which zones buyers see and which tiers you can price. You can skip and pick later.
      </div>

      <div style={{ display: "grid", gap: "0.55rem", marginBottom: "1rem" }}>
        <VenueOption
          selected={venue.kind === "none"}
          onClick={() => onVenue({ kind: "none" })}
          title="No venue yet"
          subtitle="Publish without a layout — you can assign one on the tiers page later."
        />
      </div>

      <SubTitle>My custom layouts {loadingLayouts ? "(loading…)" : `(${customLayouts.length})`}</SubTitle>
      {customLayouts.length === 0 ? (
        <div
          style={{
            padding: "0.85rem 1rem",
            border: "1px dashed var(--shell-border, #eef0f3)",
            borderRadius: 8,
            color: "#6b7280",
            fontSize: "0.85rem",
          }}
        >
          No custom layouts yet.{" "}
          <Link href="/creator/venues/new" style={{ color: "#4f46e5", fontWeight: 600 }}>
            Draw one →
          </Link>
        </div>
      ) : (
        <div style={{ display: "grid", gap: "0.55rem", marginBottom: "1rem" }}>
          {customLayouts.map((l) => (
            <VenueOption
              key={l.id}
              selected={venue.kind === "custom" && venue.id === l.id}
              onClick={() => onVenue({ kind: "custom", id: l.id })}
              title={l.name}
              subtitle={`${l.regions.length} zones · ${new Date(l.updatedAt).toLocaleDateString()}`}
              thumbnail={
                <svg viewBox={l.viewBox} preserveAspectRatio="xMidYMid meet" style={{ width: "100%", height: "100%" }}>
                  {l.backgroundUrl && (
                    <image
                      href={l.backgroundUrl}
                      x={0}
                      y={0}
                      width={parseViewBoxWidth(l.viewBox)}
                      height={parseViewBoxHeight(l.viewBox)}
                      opacity={0.5}
                      preserveAspectRatio="xMidYMid meet"
                    />
                  )}
                  {l.regions.map((r, i) => (
                    <path
                      key={i}
                      d={r.d}
                      fill={r.defaultColor ?? "#4f46e5"}
                      fillOpacity={0.45}
                      stroke={r.defaultColor ?? "#4f46e5"}
                      strokeWidth={2}
                    />
                  ))}
                </svg>
              }
            />
          ))}
        </div>
      )}

      <SubTitle>Built-in templates</SubTitle>
      <div style={{ display: "grid", gap: "0.55rem" }}>
        {Object.entries(VENUE_TEMPLATES).map(([id, tpl]) => (
          <VenueOption
            key={id}
            selected={venue.kind === "builtin" && venue.id === id}
            onClick={() => onVenue({ kind: "builtin", id })}
            title={tpl.name}
            subtitle={`${tpl.regions.length} predefined zones`}
            thumbnail={
              <svg viewBox={tpl.viewBox} preserveAspectRatio="xMidYMid meet" style={{ width: "100%", height: "100%" }}>
                {tpl.stage && <path d={tpl.stage.d} fill="#1f2937" opacity={0.75} />}
                {tpl.regions.map((r, i) => (
                  <path
                    key={i}
                    d={r.d}
                    fill="#6366f1"
                    fillOpacity={0.35}
                    stroke="#4338ca"
                    strokeWidth={2}
                  />
                ))}
              </svg>
            }
          />
        ))}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", marginTop: "1.25rem" }}>
        <button type="button" onClick={onBack} style={secondaryBtn}>
          ← Back
        </button>
        <button type="button" onClick={onNext} style={primaryBtn(false)}>
          Next: review →
        </button>
      </div>
    </Card>
  );
}

function VenueOption({
  selected,
  onClick,
  title,
  subtitle,
  thumbnail,
}: {
  selected: boolean;
  onClick: () => void;
  title: string;
  subtitle: string;
  thumbnail?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "grid",
        gridTemplateColumns: thumbnail ? "70px 1fr auto" : "1fr auto",
        gap: "0.75rem",
        alignItems: "center",
        padding: "0.7rem 0.9rem",
        background: selected ? "#eef2ff" : "var(--shell-card, #fff)",
        border: selected ? "2px solid #4f46e5" : "1px solid var(--shell-border, #eef0f3)",
        borderRadius: 9,
        cursor: "pointer",
        textAlign: "left",
        width: "100%",
      }}
    >
      {thumbnail && (
        <div style={{ width: 70, height: 52, background: "var(--shell-pill-bg, #f7f8fa)", borderRadius: 6, overflow: "hidden" }}>
          {thumbnail}
        </div>
      )}
      <div>
        <div style={{ fontSize: "0.92rem", fontWeight: 600, color: "var(--shell-fg, #111827)" }}>{title}</div>
        <div style={{ fontSize: "0.76rem", color: "#6b7280" }}>{subtitle}</div>
      </div>
      <div
        style={{
          width: 18,
          height: 18,
          borderRadius: "50%",
          border: selected ? "2px solid #4f46e5" : "1.5px solid #cbd5e1",
          background: selected ? "#4f46e5" : "transparent",
        }}
      />
    </button>
  );
}

function parseViewBoxWidth(vb: string): number {
  const p = vb.split(/\s+/).map(Number);
  return p[2] || 1000;
}
function parseViewBoxHeight(vb: string): number {
  const p = vb.split(/\s+/).map(Number);
  return p[3] || 700;
}

function ReviewStep({
  basics,
  venue,
  customLayouts,
  publishing,
  disabled,
  onBack,
  onPublish,
}: {
  basics: Basics;
  venue: VenueChoice;
  customLayouts: VenueLayoutDoc[];
  publishing: { stage: string; message?: string };
  disabled: boolean;
  onBack: () => void;
  onPublish: () => void;
}) {
  const venueLabel =
    venue.kind === "none"
      ? "None — will assign later"
      : venue.kind === "builtin"
      ? `Built-in: ${VENUE_TEMPLATES[venue.id]?.name ?? venue.id}`
      : `Custom: ${customLayouts.find((l) => l.id === venue.id)?.name ?? venue.id}`;

  const stageLabels: Record<string, string> = {
    uploadingPoster: "Uploading poster…",
    uploadingMetadata: "Uploading metadata JSON…",
    createEvent: "Signing create_event transaction…",
    initTree: "Signing initialize_event_tree transaction…",
    bindVenue: "Binding venue layout…",
    done: "Done — redirecting to tier editor…",
  };

  return (
    <Card>
      <SectionTitle>Review + publish</SectionTitle>
      <div style={{ display: "grid", gap: "0.55rem", marginBottom: "1rem" }}>
        <KV k="Name" v={basics.name || "(unset)"} />
        <KV k="Symbol" v={basics.symbol || "(unset)"} />
        <KV k="Description" v={basics.description || "—"} />
        <KV k="Sale window" v={`${basics.durationHours} h`} />
        <KV k="Base price" v={`$${basics.priceUsdc} USDC`} />
        <KV k="Capacity" v={basics.capacity} />
        <KV k="Poster" v={basics.posterFile ? basics.posterFile.name : "(no upload)"} />
        <KV k="Venue" v={venueLabel} />
      </div>

      <div
        style={{
          padding: "0.75rem 0.9rem",
          background: "#fef3c7",
          color: "#92400e",
          borderRadius: 8,
          fontSize: "0.78rem",
          marginBottom: "1rem",
        }}
      >
        Publishing will send <strong>2 on-chain transactions</strong> (create_event + initialize_event_tree) and upload
        poster + metadata to Supabase. Expected cost: ~0.23 SOL for the Merkle tree + rent.
      </div>

      {publishing.stage !== "idle" && (
        <div
          style={{
            padding: "0.75rem 0.9rem",
            background: publishing.stage === "done" ? "#dcfce7" : "#eef2ff",
            color: publishing.stage === "done" ? "#166534" : "#3730a3",
            borderRadius: 8,
            fontSize: "0.85rem",
            fontWeight: 600,
            marginBottom: "1rem",
          }}
        >
          {stageLabels[publishing.stage] ?? publishing.stage}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <button type="button" onClick={onBack} disabled={disabled} style={secondaryBtn}>
          ← Back
        </button>
        <button
          type="button"
          onClick={onPublish}
          disabled={disabled}
          style={primaryBtn(disabled)}
        >
          {disabled ? "Publishing…" : "Publish event"}
        </button>
      </div>
    </Card>
  );
}

function PosterPicker({
  previewUrl,
  onFile,
}: {
  previewUrl: string | null;
  onFile: (f: File | null) => void;
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: "0.75rem", alignItems: "center" }}>
      <div
        style={{
          width: 120,
          height: 90,
          background: previewUrl ? `center / cover no-repeat url(${previewUrl})` : "var(--shell-pill-bg, #f7f8fa)",
          border: "1px dashed var(--shell-border, #eef0f3)",
          borderRadius: 8,
        }}
      />
      <div>
        <input
          type="file"
          accept="image/png,image/jpeg,image/svg+xml,image/webp"
          onChange={(e) => onFile(e.target.files?.[0] ?? null)}
          style={{ fontSize: "0.8rem" }}
        />
        {previewUrl && (
          <button
            type="button"
            onClick={() => onFile(null)}
            style={{
              marginTop: "0.4rem",
              padding: "0.25rem 0.6rem",
              borderRadius: 5,
              border: "1px solid #fecaca",
              background: "transparent",
              color: "#b91c1c",
              fontSize: "0.74rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Clear poster
          </button>
        )}
      </div>
    </div>
  );
}

function Shell({ title, subtitle, children }: { title: string; subtitle?: React.ReactNode; children: React.ReactNode }) {
  return (
    <>
      <header style={{ marginBottom: "1.25rem" }}>
        <h1 style={{ fontSize: "1.55rem", letterSpacing: "-0.02em", marginBottom: "0.25rem", fontWeight: 600 }}>
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

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--shell-fg, #111827)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "0.65rem" }}>
      {children}
    </div>
  );
}

function SubTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: "0.72rem", fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.4rem", marginTop: "0.75rem" }}>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
      <span style={{ fontSize: "0.72rem", color: "#6b7280", fontWeight: 600, letterSpacing: "0.03em", textTransform: "uppercase" }}>
        {label}
      </span>
      {children}
    </label>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: "0.5rem", fontSize: "0.85rem" }}>
      <div style={{ color: "#6b7280", fontWeight: 600 }}>{k}</div>
      <div style={{ color: "var(--shell-fg, #111827)", wordBreak: "break-word" }}>{v}</div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  padding: "0.5rem 0.65rem",
  borderRadius: 6,
  border: "1px solid var(--shell-border, #eef0f3)",
  background: "var(--shell-card, #fff)",
  color: "var(--shell-fg, #111827)",
  fontSize: "0.85rem",
  width: "100%",
};

function primaryBtn(disabled: boolean): React.CSSProperties {
  return {
    padding: "0.55rem 1.2rem",
    borderRadius: 7,
    border: "none",
    background: disabled ? "#c7d2fe" : "#4f46e5",
    color: "#fff",
    fontSize: "0.85rem",
    fontWeight: 600,
    cursor: disabled ? "not-allowed" : "pointer",
  };
}

const secondaryBtn: React.CSSProperties = {
  padding: "0.55rem 1.1rem",
  borderRadius: 7,
  border: "1px solid var(--shell-border, #eef0f3)",
  background: "var(--shell-card, #fff)",
  color: "var(--shell-fg, #111827)",
  fontSize: "0.85rem",
  fontWeight: 600,
  cursor: "pointer",
};
