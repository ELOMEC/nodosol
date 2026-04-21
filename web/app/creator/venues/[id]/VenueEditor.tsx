"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  getVenueLayout,
  saveVenueLayout,
  VenueLayoutDoc,
  VenueLayoutRegion,
} from "@/lib/venueLayouts";

const DEFAULT_VIEW_BOX = "0 0 1000 700";
const GRID_SIZE = 25;

const DEFAULT_COLORS = [
  "#DC2626", "#EA580C", "#F59E0B", "#EAB308",
  "#22C55E", "#10B981", "#14B8A6", "#0EA5E9",
  "#6366F1", "#A855F7", "#EC4899", "#F43F5E",
];

type Tool = "select" | "rect" | "polygon" | "stage";
type DraftRect = { x1: number; y1: number; x2: number; y2: number };
type DraftPolygon = { points: Array<{ x: number; y: number }> };

type EditorRegion = VenueLayoutRegion;

type State =
  | { kind: "new" }
  | { kind: "loading" }
  | { kind: "ready"; layout: VenueLayoutDoc | null }
  | { kind: "error"; message: string };

export function VenueEditor({ id }: { id: string }) {
  const router = useRouter();
  const { publicKey, connected } = useWallet();

  const [state, setState] = useState<State>(id === "new" ? { kind: "new" } : { kind: "loading" });

  // Editable draft state — seeded from loaded layout or blank.
  const [name, setName] = useState("");
  const [viewBox, setViewBox] = useState(DEFAULT_VIEW_BOX);
  const [stageD, setStageD] = useState<string | null>(null);
  const [stageLabel, setStageLabel] = useState("STAGE");
  const [regions, setRegions] = useState<EditorRegion[]>([]);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  const [tool, setTool] = useState<Tool>("rect");
  const [draftRect, setDraftRect] = useState<DraftRect | null>(null);
  const [draftPoly, setDraftPoly] = useState<DraftPolygon | null>(null);
  const [snap, setSnap] = useState(true);
  const [saving, setSaving] = useState(false);

  const svgRef = useRef<SVGSVGElement | null>(null);

  const load = useCallback(async () => {
    if (id === "new") return;
    setState({ kind: "loading" });
    try {
      const layout = await getVenueLayout(id);
      if (!layout) {
        setState({ kind: "error", message: "Layout not found." });
        return;
      }
      setName(layout.name);
      setViewBox(layout.viewBox);
      setStageD(layout.stageD);
      setStageLabel(layout.stageLabel ?? "STAGE");
      setRegions(layout.regions);
      setState({ kind: "ready", layout });
    } catch (err) {
      console.error(err);
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : "Load failed",
      });
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const isNew = state.kind === "new";
  const loadedLayout = state.kind === "ready" ? state.layout : null;
  const isOwner = !loadedLayout || loadedLayout.creatorPubkey === publicKey?.toBase58();

  const nextColor = useMemo(
    () => DEFAULT_COLORS[regions.length % DEFAULT_COLORS.length],
    [regions.length]
  );

  function toSvgCoords(evt: React.MouseEvent<SVGSVGElement>): { x: number; y: number } {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = evt.clientX;
    pt.y = evt.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const p = pt.matrixTransform(ctm.inverse());
    const x = snap ? Math.round(p.x / GRID_SIZE) * GRID_SIZE : Math.round(p.x);
    const y = snap ? Math.round(p.y / GRID_SIZE) * GRID_SIZE : Math.round(p.y);
    return { x, y };
  }

  function onMouseDown(evt: React.MouseEvent<SVGSVGElement>) {
    if (!isOwner || saving) return;
    const pt = toSvgCoords(evt);
    if (tool === "rect") {
      setDraftRect({ x1: pt.x, y1: pt.y, x2: pt.x, y2: pt.y });
    } else if (tool === "stage") {
      setDraftRect({ x1: pt.x, y1: pt.y, x2: pt.x, y2: pt.y });
    } else if (tool === "polygon") {
      if (evt.detail === 2 && draftPoly && draftPoly.points.length >= 3) {
        // Double-click closes polygon.
        commitPolygon();
        return;
      }
      const prev = draftPoly?.points ?? [];
      setDraftPoly({ points: [...prev, pt] });
    } else if (tool === "select") {
      setSelectedIdx(null);
    }
  }

  function onMouseMove(evt: React.MouseEvent<SVGSVGElement>) {
    if (!isOwner) return;
    if ((tool === "rect" || tool === "stage") && draftRect) {
      const pt = toSvgCoords(evt);
      setDraftRect((prev) => (prev ? { ...prev, x2: pt.x, y2: pt.y } : null));
    }
  }

  function onMouseUp() {
    if (!isOwner) return;
    if (tool === "rect" && draftRect) {
      commitRect();
    } else if (tool === "stage" && draftRect) {
      commitStage();
    }
  }

  function commitRect() {
    if (!draftRect) return;
    const { x1, y1, x2, y2 } = draftRect;
    const xa = Math.min(x1, x2);
    const xb = Math.max(x1, x2);
    const ya = Math.min(y1, y2);
    const yb = Math.max(y1, y2);
    if (xb - xa < 20 || yb - ya < 20) {
      setDraftRect(null);
      return;
    }
    const d = `M ${xa} ${ya} L ${xb} ${ya} L ${xb} ${yb} L ${xa} ${yb} Z`;
    const tierRef = nextSectionCode(regions);
    const region: EditorRegion = {
      tierRef,
      label: tierRef,
      d,
      labelAnchor: { x: Math.round((xa + xb) / 2), y: Math.round((ya + yb) / 2) },
      defaultColor: nextColor,
    };
    setRegions((prev) => [...prev, region]);
    setSelectedIdx(regions.length);
    setDraftRect(null);
  }

  function commitStage() {
    if (!draftRect) return;
    const { x1, y1, x2, y2 } = draftRect;
    const xa = Math.min(x1, x2);
    const xb = Math.max(x1, x2);
    const ya = Math.min(y1, y2);
    const yb = Math.max(y1, y2);
    if (xb - xa < 20 || yb - ya < 20) {
      setDraftRect(null);
      return;
    }
    setStageD(`M ${xa} ${ya} L ${xb} ${ya} L ${xb} ${yb} L ${xa} ${yb} Z`);
    setDraftRect(null);
  }

  function commitPolygon() {
    if (!draftPoly || draftPoly.points.length < 3) return;
    const d =
      "M " +
      draftPoly.points.map((p) => `${p.x} ${p.y}`).join(" L ") +
      " Z";
    const cx = Math.round(draftPoly.points.reduce((s, p) => s + p.x, 0) / draftPoly.points.length);
    const cy = Math.round(draftPoly.points.reduce((s, p) => s + p.y, 0) / draftPoly.points.length);
    const tierRef = nextSectionCode(regions);
    const region: EditorRegion = {
      tierRef,
      label: tierRef,
      d,
      labelAnchor: { x: cx, y: cy },
      defaultColor: nextColor,
    };
    setRegions((prev) => [...prev, region]);
    setSelectedIdx(regions.length);
    setDraftPoly(null);
  }

  function deleteRegion(idx: number) {
    setRegions((prev) => prev.filter((_, i) => i !== idx));
    if (selectedIdx === idx) setSelectedIdx(null);
    else if (selectedIdx !== null && idx < selectedIdx) setSelectedIdx(selectedIdx - 1);
  }

  function updateRegion(idx: number, patch: Partial<EditorRegion>) {
    setRegions((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  async function save() {
    if (!publicKey) return;
    if (!name.trim()) {
      window.alert("Give your layout a name first.");
      return;
    }
    if (regions.length === 0) {
      window.alert("Add at least one zone before saving.");
      return;
    }
    // Ensure tierRefs are unique.
    const seen = new Set<string>();
    for (const r of regions) {
      if (seen.has(r.tierRef)) {
        window.alert(`Duplicate section code "${r.tierRef}" — each zone needs a unique code.`);
        return;
      }
      seen.add(r.tierRef);
    }
    setSaving(true);
    try {
      const saved = await saveVenueLayout({
        id: loadedLayout?.id,
        creatorPubkey: publicKey.toBase58(),
        name: name.trim(),
        viewBox,
        stageD,
        stageLabel: stageD ? stageLabel : null,
        backgroundUrl: null,
        regions,
      });
      router.replace(`/creator/venues/${saved.id}`);
      await load();
    } catch (err) {
      console.error(err);
      window.alert(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (!connected) {
    return (
      <Shell title="Venue editor">
        <Card>
          <div style={{ padding: "2rem 1rem", textAlign: "center", color: "#6b7280" }}>
            <div style={{ fontWeight: 600, marginBottom: "0.4rem" }}>Connect wallet</div>
            <div style={{ fontSize: "0.88rem", marginBottom: "1rem" }}>
              Connect a Solana wallet to save layouts.
            </div>
            <WalletMultiButton />
          </div>
        </Card>
      </Shell>
    );
  }

  if (state.kind === "loading") {
    return <Shell title="Venue editor"><Card><Placeholder>Loading…</Placeholder></Card></Shell>;
  }
  if (state.kind === "error") {
    return <Shell title="Venue editor"><Card><Placeholder>{state.message}</Placeholder></Card></Shell>;
  }
  if (!isOwner) {
    return (
      <Shell title="Venue editor">
        <Card>
          <Placeholder>
            This layout belongs to another creator. You can view it, but not edit.
          </Placeholder>
        </Card>
      </Shell>
    );
  }

  return (
    <Shell
      title={isNew ? "New venue layout" : `Edit venue — ${loadedLayout?.name}`}
      subtitle={
        <Link href="/creator/venues" style={{ color: "#4f46e5", textDecoration: "none" }}>
          ← Back to layouts
        </Link>
      }
    >
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.2fr) minmax(0, 1fr)", gap: "1rem" }}>
        <Card>
          <Toolbar
            name={name}
            onName={setName}
            tool={tool}
            onTool={setTool}
            snap={snap}
            onSnap={setSnap}
            viewBox={viewBox}
            onViewBox={setViewBox}
            onClearPolygon={() => setDraftPoly(null)}
            polygonInProgress={draftPoly !== null}
            saving={saving}
            onSave={() => void save()}
          />
          <div style={{ marginTop: "0.75rem", position: "relative" }}>
            <svg
              ref={svgRef}
              viewBox={viewBox}
              style={{
                width: "100%",
                height: "auto",
                background: "var(--shell-pill-bg, #f7f8fa)",
                borderRadius: 8,
                cursor:
                  tool === "select" ? "pointer" : tool === "polygon" ? "crosshair" : "crosshair",
                userSelect: "none",
              }}
              onMouseDown={onMouseDown}
              onMouseMove={onMouseMove}
              onMouseUp={onMouseUp}
            >
              <GridPattern viewBox={viewBox} />
              {stageD && (
                <g>
                  <path d={stageD} fill="#1f2937" opacity={0.85} />
                </g>
              )}
              {regions.map((r, idx) => (
                <g
                  key={idx}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (tool === "select") setSelectedIdx(idx);
                  }}
                  style={{ cursor: tool === "select" ? "pointer" : undefined }}
                >
                  <path
                    d={r.d}
                    fill={r.defaultColor ?? "#4f46e5"}
                    fillOpacity={selectedIdx === idx ? 0.65 : 0.4}
                    stroke={selectedIdx === idx ? "#111827" : (r.defaultColor ?? "#4f46e5")}
                    strokeWidth={selectedIdx === idx ? 3 : 2}
                  />
                  {r.labelAnchor && (
                    <text
                      x={r.labelAnchor.x}
                      y={r.labelAnchor.y}
                      textAnchor="middle"
                      fontSize={18}
                      fontWeight={600}
                      fill="#111827"
                      pointerEvents="none"
                    >
                      {r.label}
                    </text>
                  )}
                </g>
              ))}
              {draftRect && (
                <rect
                  x={Math.min(draftRect.x1, draftRect.x2)}
                  y={Math.min(draftRect.y1, draftRect.y2)}
                  width={Math.abs(draftRect.x2 - draftRect.x1)}
                  height={Math.abs(draftRect.y2 - draftRect.y1)}
                  fill={tool === "stage" ? "#1f2937" : "#4f46e5"}
                  fillOpacity={0.35}
                  stroke={tool === "stage" ? "#1f2937" : "#4f46e5"}
                  strokeDasharray="6 4"
                  strokeWidth={2}
                />
              )}
              {draftPoly && draftPoly.points.length > 0 && (
                <g>
                  <polyline
                    points={draftPoly.points.map((p) => `${p.x},${p.y}`).join(" ")}
                    fill="none"
                    stroke="#4f46e5"
                    strokeWidth={2}
                    strokeDasharray="6 4"
                  />
                  {draftPoly.points.map((p, i) => (
                    <circle key={i} cx={p.x} cy={p.y} r={5} fill="#4f46e5" />
                  ))}
                </g>
              )}
            </svg>
            <HelpOverlay tool={tool} polygonPoints={draftPoly?.points.length ?? 0} />
          </div>
        </Card>

        <Card>
          <SectionTitle>Zones ({regions.length})</SectionTitle>
          {stageD && (
            <div
              style={{
                margin: "0.5rem 0 0.75rem",
                padding: "0.6rem 0.75rem",
                background: "#1f2937",
                color: "#fff",
                borderRadius: 8,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                fontSize: "0.82rem",
              }}
            >
              <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                <input
                  value={stageLabel}
                  onChange={(e) => setStageLabel(e.target.value)}
                  placeholder="STAGE"
                  style={{
                    background: "rgba(255,255,255,0.1)",
                    border: "1px solid rgba(255,255,255,0.3)",
                    color: "#fff",
                    borderRadius: 4,
                    padding: "0.15rem 0.4rem",
                    fontSize: "0.78rem",
                  }}
                />
              </div>
              <button
                type="button"
                onClick={() => { setStageD(null); }}
                style={{
                  background: "transparent",
                  border: "1px solid rgba(255,255,255,0.3)",
                  color: "#fff",
                  borderRadius: 4,
                  padding: "0.2rem 0.55rem",
                  fontSize: "0.72rem",
                  cursor: "pointer",
                }}
              >
                Remove stage
              </button>
            </div>
          )}
          {regions.length === 0 ? (
            <Placeholder>Draw your first zone using the rectangle or polygon tool.</Placeholder>
          ) : (
            <div style={{ display: "grid", gap: "0.35rem" }}>
              {regions.map((r, idx) => (
                <RegionRow
                  key={idx}
                  region={r}
                  selected={selectedIdx === idx}
                  onSelect={() => setSelectedIdx(idx)}
                  onChange={(patch) => updateRegion(idx, patch)}
                  onDelete={() => deleteRegion(idx)}
                />
              ))}
            </div>
          )}
        </Card>
      </div>
    </Shell>
  );
}

function nextSectionCode(regions: EditorRegion[]): string {
  const used = new Set(regions.map((r) => r.tierRef));
  let i = 1;
  while (used.has(`Z${i}`)) i++;
  return `Z${i}`;
}

function GridPattern({ viewBox }: { viewBox: string }) {
  const parts = viewBox.split(/\s+/).map(Number);
  const w = parts[2] || 1000;
  const h = parts[3] || 700;
  return (
    <g>
      <defs>
        <pattern id="grid" width={GRID_SIZE} height={GRID_SIZE} patternUnits="userSpaceOnUse">
          <path
            d={`M ${GRID_SIZE} 0 L 0 0 0 ${GRID_SIZE}`}
            fill="none"
            stroke="rgba(148,163,184,0.25)"
            strokeWidth={1}
          />
        </pattern>
      </defs>
      <rect x={0} y={0} width={w} height={h} fill="url(#grid)" />
    </g>
  );
}

function Toolbar({
  name,
  onName,
  tool,
  onTool,
  snap,
  onSnap,
  viewBox,
  onViewBox,
  onClearPolygon,
  polygonInProgress,
  saving,
  onSave,
}: {
  name: string;
  onName: (v: string) => void;
  tool: Tool;
  onTool: (t: Tool) => void;
  snap: boolean;
  onSnap: (v: boolean) => void;
  viewBox: string;
  onViewBox: (v: string) => void;
  onClearPolygon: () => void;
  polygonInProgress: boolean;
  saving: boolean;
  onSave: () => void;
}) {
  return (
    <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap", alignItems: "center" }}>
      <input
        type="text"
        placeholder="Layout name"
        value={name}
        onChange={(e) => onName(e.target.value)}
        style={{
          padding: "0.4rem 0.6rem",
          borderRadius: 6,
          border: "1px solid var(--shell-border, #eef0f3)",
          fontSize: "0.85rem",
          minWidth: 180,
          background: "var(--shell-card, #fff)",
          color: "var(--shell-fg, #111827)",
        }}
      />
      <ToolBtn active={tool === "select"} onClick={() => onTool("select")}>Select</ToolBtn>
      <ToolBtn active={tool === "rect"} onClick={() => onTool("rect")}>▭ Rect</ToolBtn>
      <ToolBtn active={tool === "polygon"} onClick={() => onTool("polygon")}>⬡ Polygon</ToolBtn>
      <ToolBtn active={tool === "stage"} onClick={() => onTool("stage")}>◼ Stage</ToolBtn>
      {polygonInProgress && (
        <button
          type="button"
          onClick={onClearPolygon}
          style={{
            padding: "0.4rem 0.7rem",
            borderRadius: 6,
            border: "1px solid #fecaca",
            background: "transparent",
            color: "#b91c1c",
            fontSize: "0.78rem",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Cancel polygon
        </button>
      )}
      <label style={{ fontSize: "0.78rem", color: "#6b7280", display: "flex", alignItems: "center", gap: "0.3rem", marginLeft: "0.3rem" }}>
        <input type="checkbox" checked={snap} onChange={(e) => onSnap(e.target.checked)} />
        Snap to 25
      </label>
      <select
        value={viewBox}
        onChange={(e) => onViewBox(e.target.value)}
        style={{
          padding: "0.4rem 0.55rem",
          borderRadius: 6,
          border: "1px solid var(--shell-border, #eef0f3)",
          fontSize: "0.78rem",
          background: "var(--shell-card, #fff)",
          color: "var(--shell-fg, #111827)",
        }}
      >
        <option value="0 0 1000 700">Landscape 1000×700</option>
        <option value="0 0 1000 600">Landscape 1000×600</option>
        <option value="0 0 700 1000">Portrait 700×1000</option>
        <option value="0 0 1200 800">Wide 1200×800</option>
      </select>
      <div style={{ flex: 1 }} />
      <button
        type="button"
        onClick={onSave}
        disabled={saving}
        style={{
          padding: "0.45rem 1.05rem",
          borderRadius: 7,
          border: "none",
          background: saving ? "#c7d2fe" : "#4f46e5",
          color: "#fff",
          fontSize: "0.82rem",
          fontWeight: 600,
          cursor: saving ? "not-allowed" : "pointer",
        }}
      >
        {saving ? "Saving…" : "Save layout"}
      </button>
    </div>
  );
}

function ToolBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "0.4rem 0.8rem",
        borderRadius: 6,
        border: active ? "1px solid #4f46e5" : "1px solid var(--shell-border, #eef0f3)",
        background: active ? "#eef2ff" : "var(--shell-card, #fff)",
        color: active ? "#4338ca" : "var(--shell-fg, #111827)",
        fontSize: "0.8rem",
        fontWeight: 600,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

function HelpOverlay({ tool, polygonPoints }: { tool: Tool; polygonPoints: number }) {
  const hint =
    tool === "rect"
      ? "Click + drag to draw a rectangular zone."
      : tool === "polygon"
      ? `Click to drop vertices (${polygonPoints} placed). Double-click to close the shape.`
      : tool === "stage"
      ? "Click + drag to mark the stage / focus area (dark rectangle)."
      : "Click a zone to select. Use the right panel to rename, recolor, or delete.";
  return (
    <div
      style={{
        position: "absolute",
        left: 12,
        bottom: 12,
        background: "rgba(17,24,39,0.85)",
        color: "#fff",
        borderRadius: 6,
        padding: "0.35rem 0.65rem",
        fontSize: "0.72rem",
        maxWidth: "70%",
        pointerEvents: "none",
      }}
    >
      {hint}
    </div>
  );
}

function RegionRow({
  region,
  selected,
  onSelect,
  onChange,
  onDelete,
}: {
  region: EditorRegion;
  selected: boolean;
  onSelect: () => void;
  onChange: (patch: Partial<EditorRegion>) => void;
  onDelete: () => void;
}) {
  return (
    <div
      onClick={onSelect}
      style={{
        border: selected ? "2px solid #4f46e5" : "1px solid var(--shell-border, #eef0f3)",
        borderRadius: 7,
        padding: "0.5rem 0.65rem",
        display: "grid",
        gridTemplateColumns: "auto 1fr 1fr auto auto",
        gap: "0.4rem",
        alignItems: "center",
        cursor: "pointer",
        background: selected ? "#eef2ff" : "var(--shell-card, #fff)",
      }}
    >
      <input
        type="color"
        value={region.defaultColor ?? "#4f46e5"}
        onChange={(e) => {
          e.stopPropagation();
          onChange({ defaultColor: e.target.value.toUpperCase() });
        }}
        onClick={(e) => e.stopPropagation()}
        style={{ width: 28, height: 24, border: "none", background: "transparent", cursor: "pointer", padding: 0 }}
      />
      <input
        type="text"
        value={region.label}
        onChange={(e) => {
          e.stopPropagation();
          onChange({ label: e.target.value });
        }}
        onClick={(e) => e.stopPropagation()}
        placeholder="Zone label"
        style={{
          padding: "0.3rem 0.5rem",
          borderRadius: 5,
          border: "1px solid var(--shell-border, #eef0f3)",
          fontSize: "0.8rem",
          minWidth: 0,
          background: "var(--shell-card, #fff)",
          color: "var(--shell-fg, #111827)",
        }}
      />
      <input
        type="text"
        value={region.tierRef}
        onChange={(e) => {
          e.stopPropagation();
          onChange({ tierRef: e.target.value.toUpperCase().replace(/\s+/g, "-") });
        }}
        onClick={(e) => e.stopPropagation()}
        placeholder="CODE"
        style={{
          padding: "0.3rem 0.5rem",
          borderRadius: 5,
          border: "1px solid var(--shell-border, #eef0f3)",
          fontSize: "0.78rem",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          minWidth: 0,
          background: "var(--shell-card, #fff)",
          color: "var(--shell-fg, #111827)",
        }}
      />
      <div style={{ fontSize: "0.68rem", color: "#9ca3af", whiteSpace: "nowrap" }}>
        {region.d.length} chars
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        title="Delete zone"
        style={{
          padding: "0.25rem 0.5rem",
          borderRadius: 5,
          border: "1px solid #fecaca",
          background: "transparent",
          color: "#b91c1c",
          fontSize: "0.75rem",
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        ×
      </button>
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
    <div style={{ fontSize: "0.82rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--shell-fg, #111827)", marginBottom: "0.35rem" }}>
      {children}
    </div>
  );
}

function Placeholder({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: "1.5rem 0.5rem", textAlign: "center", color: "#6b7280", fontSize: "0.85rem" }}>
      {children}
    </div>
  );
}
