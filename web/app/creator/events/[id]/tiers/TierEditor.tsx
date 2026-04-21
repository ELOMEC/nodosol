"use client";

import { AnchorProvider, BN, Program, Wallet } from "@coral-xyz/anchor";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import {
  ComputeBudgetProgram,
  PublicKey,
  Transaction,
} from "@solana/web3.js";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { USDC_UNIT } from "@/lib/constants";
import {
  eventTicketsProgram,
  fetchTiersForEvent,
  TicketTierDoc,
  TierStatusKey,
} from "@/lib/eventTickets";
import {
  buildCreateTierIx,
  buildUpdateTierCapacityIx,
  buildUpdateTierPriceIx,
  buildUpdateTierStatusIx,
} from "@/lib/tiers";
import {
  getVenueTemplate,
  VENUE_TEMPLATES,
  VenueRegion,
  VenueTemplate,
} from "@/lib/venue-templates";
import {
  getEventVenueMapping,
  getVenueLayout,
  layoutToTemplate,
  listVenueLayoutsByCreator,
  upsertEventVenueMapping,
  VenueLayoutDoc,
  VenueLayoutRegion,
} from "@/lib/venueLayouts";

type EventMeta = {
  address: string;
  creator: string;
  eventId: string;
  name: string;
  symbol: string;
  capacity: number;
  sold: number;
  price: number;
};

type TierFormState = {
  sectionCode: string;
  label: string;
  name: string;
  priceUsdc: string;
  capacity: string;
  colorHex: string;
  status: TierStatusKey;
  existing: TicketTierDoc | null;
};

type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; event: EventMeta; tiers: TicketTierDoc[] }
  | { kind: "error"; message: string };

const DEFAULT_COLORS = [
  "#DC2626", "#EA580C", "#F59E0B", "#EAB308",
  "#22C55E", "#10B981", "#14B8A6", "#0EA5E9",
  "#6366F1", "#A855F7", "#EC4899", "#F43F5E",
];

function sectionCodeMatchesTemplate(codes: string[], tpl: VenueTemplate): number {
  const tplCodes = new Set(tpl.regions.map((r) => r.tierRef));
  let hits = 0;
  for (const c of codes) if (tplCodes.has(c)) hits++;
  return hits;
}

function inferTemplate(tiers: TicketTierDoc[]): string | null {
  if (tiers.length === 0) return null;
  const codes = tiers.map((t) => t.sectionCode);
  let best: { id: string; hits: number } | null = null;
  for (const [id, tpl] of Object.entries(VENUE_TEMPLATES)) {
    const hits = sectionCodeMatchesTemplate(codes, tpl);
    if (!best || hits > best.hits) best = { id, hits };
  }
  return best && best.hits > 0 ? best.id : null;
}

export function TierEditor({ address }: { address: string }) {
  const { connection } = useConnection();
  const wallet = useWallet();
  const { publicKey, connected } = wallet;

  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [templateId, setTemplateId] = useState<string>("");
  const [customLayout, setCustomLayout] = useState<VenueLayoutDoc | null>(null);
  const [customLayouts, setCustomLayouts] = useState<VenueLayoutDoc[]>([]);
  const [forms, setForms] = useState<Record<string, TierFormState>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [nextTierId, setNextTierId] = useState(1);

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const provider = new AnchorProvider(
        connection,
        wallet as unknown as Wallet,
        { commitment: "confirmed" }
      );
      const program = eventTicketsProgram(provider);

      const eventPk = new PublicKey(address);
      const api = (program.account as Record<string, {
        fetch: (addr: PublicKey) => Promise<{
          creator: PublicKey;
          eventId: BN;
          name: string;
          symbol: string;
          capacity: BN;
          sold: BN;
          price: BN;
        }>;
      }>).event;
      const raw = await api.fetch(eventPk);
      const event: EventMeta = {
        address,
        creator: raw.creator.toBase58(),
        eventId: raw.eventId.toString(),
        name: raw.name,
        symbol: raw.symbol,
        capacity: raw.capacity.toNumber(),
        sold: raw.sold.toNumber(),
        price: Number(raw.price.toString()) / USDC_UNIT,
      };
      const tiers = await fetchTiersForEvent(program, eventPk);
      setState({ kind: "ready", event, tiers });

      // Prefer custom layout if one is linked; else infer from existing tiers
      // or leave unselected.
      let resolvedTemplate = "";
      let resolvedCustom: VenueLayoutDoc | null = null;
      try {
        const mapping = await getEventVenueMapping(address);
        if (mapping) {
          const layout = await getVenueLayout(mapping.layoutId);
          if (layout) {
            resolvedCustom = layout;
            resolvedTemplate = `custom:${layout.id}`;
          }
        }
      } catch (err) {
        console.warn("venue mapping lookup failed", err);
      }
      if (!resolvedTemplate) {
        const inferred = inferTemplate(tiers);
        if (inferred) resolvedTemplate = inferred;
      }
      setCustomLayout(resolvedCustom);
      setTemplateId(resolvedTemplate);

      if (publicKey) {
        try {
          const list = await listVenueLayoutsByCreator(publicKey.toBase58());
          setCustomLayouts(list);
        } catch (err) {
          console.warn("custom layouts list failed", err);
        }
      }

      const maxTierId = tiers.reduce((m, t) => Math.max(m, t.tierId), 0);
      setNextTierId(maxTierId + 1);
    } catch (err) {
      console.error(err);
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : "Load failed",
      });
    }
  }, [address, connection, wallet, publicKey]);

  useEffect(() => {
    if (connected) void load();
  }, [connected, load]);

  const template: VenueTemplate | null = templateId
    ? templateId.startsWith("custom:") && customLayout
      ? layoutToTemplate(customLayout)
      : getVenueTemplate(templateId)
    : null;

  const pickTemplate = useCallback(
    async (next: string) => {
      setTemplateId(next);
      if (!next.startsWith("custom:")) {
        setCustomLayout(null);
        return;
      }
      const id = next.slice("custom:".length);
      const layout = customLayouts.find((l) => l.id === id) ?? (await getVenueLayout(id));
      setCustomLayout(layout);
      if (publicKey && layout) {
        try {
          await upsertEventVenueMapping(address, layout.id, publicKey.toBase58());
        } catch (err) {
          console.error("save mapping failed", err);
          window.alert(
            err instanceof Error ? err.message : "Could not save venue selection."
          );
        }
      }
    },
    [address, customLayouts, publicKey]
  );

  useEffect(() => {
    if (state.kind !== "ready" || !template) return;
    const next: Record<string, TierFormState> = {};
    let colorCursor = 0;
    for (const region of template.regions) {
      const seated = regionIsSeated(region);
      const computedCapacity = seated
        ? (region as VenueLayoutRegion).rows! * (region as VenueLayoutRegion).seatsPerRow!
        : null;
      const existing = state.tiers.find((t) => t.sectionCode === region.tierRef);
      next[region.tierRef] = {
        sectionCode: region.tierRef,
        label: region.label,
        name: existing?.name ?? region.label,
        priceUsdc: existing ? (existing.price / USDC_UNIT).toString() : "",
        capacity: existing
          ? existing.capacity.toString()
          : computedCapacity !== null
          ? computedCapacity.toString()
          : "",
        colorHex: existing?.colorHex ?? DEFAULT_COLORS[colorCursor % DEFAULT_COLORS.length],
        status: existing?.status ?? "active",
        existing: existing ?? null,
      };
      colorCursor++;
    }
    setForms(next);
  }, [state, template]);

  async function saveRegion(region: VenueRegion) {
    if (!publicKey || state.kind !== "ready" || !template) return;
    const form = forms[region.tierRef];
    if (!form) return;

    setBusy(region.tierRef);
    try {
      const provider = new AnchorProvider(
        connection,
        wallet as unknown as Wallet,
        { commitment: "confirmed" }
      );
      const program = eventTicketsProgram(provider);
      const eventPk = new PublicKey(address);
      const ixs = [];

      const priceUsdc = parseFloat(form.priceUsdc);
      const capacity = parseInt(form.capacity, 10);
      if (!Number.isFinite(priceUsdc) || priceUsdc < 0) {
        throw new Error("Price must be a non-negative number.");
      }
      if (!Number.isInteger(capacity) || capacity <= 0) {
        throw new Error("Capacity must be a positive integer.");
      }
      const priceBase = BigInt(Math.round(priceUsdc * USDC_UNIT));

      if (!form.existing) {
        const tierId = assignTierId(template, region.tierRef, state.tiers);
        ixs.push(
          await buildCreateTierIx(
            program,
            publicKey,
            eventPk,
            tierId,
            form.name.trim() || region.label,
            region.tierRef,
            priceBase,
            capacity,
            form.colorHex
          )
        );
      } else {
        const existing = form.existing;
        if (Number(existing.price) !== Number(priceBase)) {
          ixs.push(
            await buildUpdateTierPriceIx(program, publicKey, eventPk, existing.tierId, priceBase)
          );
        }
        if (existing.capacity !== capacity) {
          ixs.push(
            await buildUpdateTierCapacityIx(program, publicKey, eventPk, existing.tierId, capacity)
          );
        }
        if (existing.status !== form.status) {
          ixs.push(
            await buildUpdateTierStatusIx(program, publicKey, eventPk, existing.tierId, form.status)
          );
        }
      }

      if (ixs.length === 0) {
        setBusy(null);
        return;
      }

      await sendIxs(program, publicKey, wallet, ixs);
      await load();
    } catch (err) {
      console.error(err);
      window.alert(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(null);
    }
  }

  async function saveAllNew() {
    if (!publicKey || state.kind !== "ready" || !template) return;
    const toCreate = template.regions.filter(
      (r) => forms[r.tierRef] && !forms[r.tierRef].existing &&
      forms[r.tierRef].priceUsdc.trim() !== "" &&
      forms[r.tierRef].capacity.trim() !== ""
    );
    if (toCreate.length === 0) {
      window.alert("Nothing to save — fill in price and capacity for new tiers first.");
      return;
    }
    setBusy("__all__");
    try {
      const provider = new AnchorProvider(
        connection,
        wallet as unknown as Wallet,
        { commitment: "confirmed" }
      );
      const program = eventTicketsProgram(provider);
      const eventPk = new PublicKey(address);
      const ixs = [];
      let tierCursor = nextTierId;
      for (const region of toCreate) {
        const form = forms[region.tierRef];
        const priceUsdc = parseFloat(form.priceUsdc);
        const capacity = parseInt(form.capacity, 10);
        if (!Number.isFinite(priceUsdc) || priceUsdc < 0) continue;
        if (!Number.isInteger(capacity) || capacity <= 0) continue;
        const priceBase = BigInt(Math.round(priceUsdc * USDC_UNIT));
        ixs.push(
          await buildCreateTierIx(
            program,
            publicKey,
            eventPk,
            tierCursor,
            form.name.trim() || region.label,
            region.tierRef,
            priceBase,
            capacity,
            form.colorHex
          )
        );
        tierCursor++;
      }
      // Split into batches of ~4 ixs per tx to stay under compute + size limits.
      for (let i = 0; i < ixs.length; i += 4) {
        await sendIxs(program, publicKey, wallet, ixs.slice(i, i + 4));
      }
      await load();
    } catch (err) {
      console.error(err);
      window.alert(err instanceof Error ? err.message : "Batch save failed");
    } finally {
      setBusy(null);
    }
  }

  if (!connected) {
    return (
      <Shell title="Tier editor">
        <Card>
          <Centered>
            <div style={{ fontWeight: 600, marginBottom: "0.4rem" }}>Connect wallet</div>
            <div style={{ fontSize: "0.88rem", color: "#6b7280", marginBottom: "1rem" }}>
              Connect the creator wallet that owns this event.
            </div>
            <WalletMultiButton />
          </Centered>
        </Card>
      </Shell>
    );
  }

  if (state.kind === "loading") {
    return <Shell title="Tier editor"><Card><Centered>Loading event…</Centered></Card></Shell>;
  }
  if (state.kind === "error") {
    return <Shell title="Tier editor"><Card><Centered>Failed: {state.message}</Centered></Card></Shell>;
  }

  const { event, tiers } = state;
  const isOwner = publicKey?.toBase58() === event.creator;

  return (
    <Shell
      title={`Tiers — ${event.name}`}
      subtitle={
        <>
          Event {event.symbol} · id {event.eventId} ·{" "}
          <Link
            href={`/marketplace/events/v/${event.address}`}
            style={{ color: "#4f46e5", textDecoration: "none" }}
          >
            Preview on marketplace →
          </Link>
        </>
      }
    >
      {!isOwner ? (
        <Card>
          <Centered>
            <div style={{ color: "#b91c1c", fontWeight: 600, marginBottom: "0.4rem" }}>
              Not your event
            </div>
            <div style={{ fontSize: "0.85rem", color: "#6b7280" }}>
              This event belongs to {event.creator.slice(0, 6)}…{event.creator.slice(-4)}. Only the creator wallet can edit tiers.
            </div>
          </Centered>
        </Card>
      ) : (
        <>
          <TemplatePicker
            value={templateId}
            onChange={(next) => void pickTemplate(next)}
            disabled={tiers.length > 0 && !templateId.startsWith("custom:")}
            customLayouts={customLayouts}
            hint={
              tiers.length > 0 && !templateId.startsWith("custom:")
                ? `Built-in template is locked because tiers already exist for this event. Custom layouts can still be switched.`
                : undefined
            }
          />

          {template ? (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1.2fr)",
                gap: "1rem",
                marginTop: "1rem",
              }}
            >
              <Card>
                <SectionTitle>Venue map</SectionTitle>
                <VenueMiniMap template={template} forms={forms} />
              </Card>
              <Card>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem", gap: "0.5rem" }}>
                  <SectionTitle>Tiers ({template.regions.length} zones)</SectionTitle>
                  {template.regions.some((r) => forms[r.tierRef] && !forms[r.tierRef].existing) && (
                    <button
                      type="button"
                      onClick={() => void saveAllNew()}
                      disabled={busy !== null}
                      style={primaryBtn(busy !== null)}
                    >
                      {busy === "__all__" ? "Saving…" : "Save all new tiers"}
                    </button>
                  )}
                </div>
                <div style={{ display: "grid", gap: "0.55rem" }}>
                  {template.regions.map((region) => (
                    <TierRow
                      key={region.tierRef}
                      region={region}
                      form={forms[region.tierRef]}
                      sold={
                        tiers.find((t) => t.sectionCode === region.tierRef)?.sold ?? 0
                      }
                      busy={busy === region.tierRef}
                      anyBusy={busy !== null}
                      onChange={(patch) =>
                        setForms((prev) => ({
                          ...prev,
                          [region.tierRef]: { ...prev[region.tierRef], ...patch },
                        }))
                      }
                      onSave={() => void saveRegion(region)}
                    />
                  ))}
                </div>
              </Card>
            </div>
          ) : (
            <Card>
              <Centered>
                <div style={{ fontWeight: 600, marginBottom: "0.4rem" }}>Pick a venue template</div>
                <div style={{ fontSize: "0.85rem", color: "#6b7280" }}>
                  Templates define the zones you can price. Choose the one that best matches your venue; custom venues come in Phase B.
                </div>
              </Centered>
            </Card>
          )}
        </>
      )}
    </Shell>
  );
}

function regionIsSeated(region: VenueRegion | VenueLayoutRegion): boolean {
  const r = region as VenueLayoutRegion;
  return (r.rows ?? 0) > 0 && (r.seatsPerRow ?? 0) > 0;
}

function assignTierId(
  template: VenueTemplate,
  sectionCode: string,
  existing: TicketTierDoc[]
): number {
  const used = new Set(existing.map((t) => t.tierId));
  const idx = template.regions.findIndex((r) => r.tierRef === sectionCode);
  let candidate = idx + 1;
  while (used.has(candidate)) candidate++;
  return candidate;
}

async function sendIxs(
  program: Program,
  payer: PublicKey,
  wallet: ReturnType<typeof useWallet>,
  ixs: Awaited<ReturnType<typeof buildCreateTierIx>>[]
): Promise<string> {
  const connection = program.provider.connection;
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  const tx = new Transaction({ feePayer: payer, recentBlockhash: blockhash });
  tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }));
  for (const ix of ixs) tx.add(ix);
  const sig = await wallet.sendTransaction(tx, connection);
  await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
  return sig;
}

function TemplatePicker({
  value,
  onChange,
  disabled,
  customLayouts,
  hint,
}: {
  value: string;
  onChange: (id: string) => void;
  disabled: boolean;
  customLayouts: VenueLayoutDoc[];
  hint?: string;
}) {
  return (
    <Card>
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
        <label style={{ fontSize: "0.82rem", color: "var(--shell-fg, #111827)", fontWeight: 600 }}>
          Venue
        </label>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          style={{
            padding: "0.45rem 0.7rem",
            borderRadius: 7,
            border: "1px solid var(--shell-border, #eef0f3)",
            fontSize: "0.85rem",
            background: "var(--shell-card, #fff)",
            color: "var(--shell-fg, #111827)",
          }}
        >
          <option value="">— pick a venue —</option>
          <optgroup label="Built-in templates">
            {Object.entries(VENUE_TEMPLATES).map(([id, tpl]) => (
              <option key={id} value={id}>{tpl.name} ({tpl.regions.length} zones)</option>
            ))}
          </optgroup>
          {customLayouts.length > 0 && (
            <optgroup label="My custom layouts">
              {customLayouts.map((l) => (
                <option key={l.id} value={`custom:${l.id}`}>
                  {l.name} ({l.regions.length} zones)
                </option>
              ))}
            </optgroup>
          )}
        </select>
        <Link
          href="/creator/venues/new"
          style={{
            fontSize: "0.78rem",
            color: "#4f46e5",
            textDecoration: "none",
            fontWeight: 600,
          }}
        >
          + Draw custom →
        </Link>
        {hint && <span style={{ fontSize: "0.78rem", color: "#9ca3af" }}>{hint}</span>}
      </div>
    </Card>
  );
}

function VenueMiniMap({
  template,
  forms,
}: {
  template: VenueTemplate;
  forms: Record<string, TierFormState>;
}) {
  return (
    <svg
      viewBox={template.viewBox}
      style={{ width: "100%", height: "auto", background: "var(--shell-pill-bg, #f7f8fa)", borderRadius: 8 }}
    >
      {template.stage && (
        <g>
          <path d={template.stage.d} fill="#1f2937" opacity={0.8} />
          <text
            x={(template.stage.d.match(/M\s*([\d.]+)/)?.[1] ?? "0")}
            y={(template.stage.d.match(/([\d.]+)\s*Z$/)?.[1] ?? "0")}
            fill="#fff"
            fontSize={18}
            fontWeight={600}
            textAnchor="start"
          >
            {template.stage.label}
          </text>
        </g>
      )}
      {template.regions.map((r) => {
        const form = forms[r.tierRef];
        const filled = form && form.existing !== null;
        const color = form?.colorHex ?? "#9ca3af";
        return (
          <g key={r.tierRef}>
            <path
              d={r.d}
              fill={color}
              fillOpacity={filled ? 0.55 : 0.25}
              stroke={color}
              strokeWidth={2}
            />
            {r.labelAnchor && (
              <text
                x={r.labelAnchor.x}
                y={r.labelAnchor.y}
                textAnchor="middle"
                fontSize={16}
                fontWeight={600}
                fill={filled ? "#fff" : "#374151"}
              >
                {r.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function TierRow({
  region,
  form,
  sold,
  busy,
  anyBusy,
  onChange,
  onSave,
}: {
  region: VenueRegion;
  form: TierFormState | undefined;
  sold: number;
  busy: boolean;
  anyBusy: boolean;
  onChange: (patch: Partial<TierFormState>) => void;
  onSave: () => void;
}) {
  if (!form) return null;
  const isNew = !form.existing;
  const seated = regionIsSeated(region);
  const r = region as VenueLayoutRegion;
  const seatedCapacity = seated ? (r.rows ?? 0) * (r.seatsPerRow ?? 0) : null;
  return (
    <div
      style={{
        border: "1px solid var(--shell-border, #eef0f3)",
        borderRadius: 9,
        padding: "0.7rem 0.85rem",
        background: isNew ? "var(--shell-pill-bg, #f9fafb)" : "var(--shell-card, #fff)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem", flexWrap: "wrap" }}>
        <div
          style={{
            width: 14,
            height: 14,
            background: form.colorHex,
            borderRadius: 4,
            border: "1px solid rgba(0,0,0,0.15)",
          }}
        />
        <div style={{ fontWeight: 600, fontSize: "0.88rem" }}>{region.label}</div>
        <code style={{ fontSize: "0.72rem", color: "#9ca3af" }}>{region.tierRef}</code>
        {r.category && (
          <span
            style={{
              fontSize: "0.66rem",
              padding: "0.1rem 0.5rem",
              borderRadius: 999,
              background: "#fef3c7",
              color: "#92400e",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.04em",
            }}
          >
            {r.category}
          </span>
        )}
        {seated && (
          <span
            style={{
              fontSize: "0.66rem",
              padding: "0.1rem 0.5rem",
              borderRadius: 999,
              background: "#dbeafe",
              color: "#1e40af",
              fontWeight: 600,
            }}
          >
            {r.rows}R × {r.seatsPerRow}S = {seatedCapacity} seats
          </span>
        )}
        {!isNew && (
          <span
            style={{
              fontSize: "0.68rem",
              padding: "0.1rem 0.45rem",
              borderRadius: 999,
              background: "#e0e7ff",
              color: "#3730a3",
              fontWeight: 600,
            }}
          >
            #{form.existing?.tierId} · {sold} sold
          </span>
        )}
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "2fr 1fr 1fr auto auto",
          gap: "0.45rem",
          alignItems: "center",
        }}
      >
        <input
          type="text"
          placeholder="Tier name (e.g. Floor VIP)"
          value={form.name}
          onChange={(e) => onChange({ name: e.target.value })}
          disabled={!isNew}
          style={inputStyle(!isNew)}
        />
        <input
          type="number"
          inputMode="decimal"
          placeholder="Price USDC"
          value={form.priceUsdc}
          onChange={(e) => onChange({ priceUsdc: e.target.value })}
          style={inputStyle(false)}
        />
        <input
          type="number"
          inputMode="numeric"
          placeholder="Capacity"
          value={seated && seatedCapacity !== null ? seatedCapacity.toString() : form.capacity}
          onChange={(e) => onChange({ capacity: e.target.value })}
          disabled={seated}
          title={seated ? "Capacity is derived from rows × seats per row in the venue layout" : undefined}
          style={inputStyle(seated)}
        />
        {isNew ? (
          <input
            type="color"
            value={form.colorHex}
            onChange={(e) => onChange({ colorHex: e.target.value.toUpperCase() })}
            style={{ width: 36, height: 32, border: "none", background: "transparent", cursor: "pointer", padding: 0 }}
          />
        ) : (
          <select
            value={form.status}
            onChange={(e) => onChange({ status: e.target.value as TierStatusKey })}
            style={inputStyle(false)}
          >
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="closed">Closed</option>
          </select>
        )}
        <button
          type="button"
          onClick={onSave}
          disabled={anyBusy}
          style={primaryBtn(anyBusy)}
        >
          {busy ? "Saving…" : isNew ? "Create" : "Update"}
        </button>
      </div>
    </div>
  );
}

function Shell({ title, subtitle, children }: { title: string; subtitle?: React.ReactNode; children: React.ReactNode }) {
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

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--shell-fg, #111827)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
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

function inputStyle(disabled: boolean): React.CSSProperties {
  return {
    padding: "0.4rem 0.55rem",
    borderRadius: 6,
    border: "1px solid var(--shell-border, #eef0f3)",
    background: disabled ? "var(--shell-pill-bg, #f3f4f6)" : "var(--shell-card, #fff)",
    color: "var(--shell-fg, #111827)",
    fontSize: "0.82rem",
    minWidth: 0,
  };
}

function primaryBtn(disabled: boolean): React.CSSProperties {
  return {
    padding: "0.4rem 0.85rem",
    borderRadius: 7,
    border: "none",
    background: disabled ? "#c7d2fe" : "#4f46e5",
    color: "#fff",
    fontSize: "0.8rem",
    fontWeight: 600,
    cursor: disabled ? "not-allowed" : "pointer",
    whiteSpace: "nowrap",
  };
}
