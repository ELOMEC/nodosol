"use client";

import { useRef, useState } from "react";

import { uploadAssetMedia } from "@/lib/supabase";

/**
 * Multi-image uploader that writes straight to the public asset-media
 * bucket. Exposes the resulting URL array so callers can stuff it into
 * whatever metadata JSON they own (rental, auction, event, RWA asset).
 *
 * Reorder is up/down arrow based — index 0 is the cover shot in all
 * consuming UIs. Drag-reorder is an intentional skip for V1; arrow
 * nav is accessible and zero-dependency.
 */
export function GalleryUploader({
  value,
  onChange,
  ownerPubkey,
  maxImages = 10,
  keyPrefix = "gallery",
}: {
  value: string[];
  onChange: (urls: string[]) => void;
  ownerPubkey: string;
  maxImages?: number;
  /** Slot prefix inside asset-media, e.g. "rental-gallery", "auction-gallery". */
  keyPrefix?: string;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);

  async function onFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    const slots = maxImages - value.length;
    if (slots <= 0) {
      setError(`Max ${maxImages} images.`);
      return;
    }
    const accepted = Array.from(files).slice(0, slots);
    setUploading(accepted.length);
    try {
      const uploaded = await Promise.all(
        accepted.map(async (file, idx) => {
          const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
          const key = `${keyPrefix}/${ownerPubkey}/${Date.now()}-${idx}.${ext}`;
          return uploadAssetMedia(key, file, file.type || "image/jpeg");
        })
      );
      onChange([...value, ...uploaded]);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(0);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function remove(idx: number) {
    onChange(value.filter((_, i) => i !== idx));
  }

  function swap(i: number, j: number) {
    if (j < 0 || j >= value.length) return;
    const next = value.slice();
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/avif"
        multiple
        style={{ display: "none" }}
        onChange={(e) => void onFiles(e.target.files)}
      />

      {value.length === 0 ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading > 0}
          style={{
            padding: "2rem 1rem",
            borderRadius: 10,
            border: "2px dashed var(--shell-border, #e5e7eb)",
            background: "var(--shell-pill-bg, #f9fafb)",
            color: "var(--shell-fg, #111827)",
            fontSize: "0.85rem",
            fontWeight: 600,
            cursor: uploading > 0 ? "not-allowed" : "pointer",
          }}
        >
          {uploading > 0 ? `Uploading ${uploading}…` : "+ Add photos (up to " + maxImages + ")"}
        </button>
      ) : (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))",
              gap: "0.55rem",
            }}
          >
            {value.map((url, idx) => (
              <div
                key={url}
                style={{
                  position: "relative",
                  aspectRatio: "4/3",
                  borderRadius: 8,
                  overflow: "hidden",
                  background: `center / cover no-repeat url(${url})`,
                  border: idx === 0 ? "2px solid #4f46e5" : "1px solid var(--shell-border, #eef0f3)",
                }}
              >
                {idx === 0 && (
                  <div
                    style={{
                      position: "absolute",
                      top: 4,
                      left: 4,
                      background: "#4f46e5",
                      color: "#fff",
                      fontSize: "0.62rem",
                      fontWeight: 700,
                      padding: "0.1rem 0.4rem",
                      borderRadius: 4,
                      letterSpacing: "0.04em",
                      textTransform: "uppercase",
                    }}
                  >
                    Cover
                  </div>
                )}
                <div style={{ position: "absolute", bottom: 4, right: 4, display: "flex", gap: "0.2rem" }}>
                  {idx > 0 && (
                    <IconBtn onClick={() => swap(idx, idx - 1)} title="Move left">
                      ←
                    </IconBtn>
                  )}
                  {idx < value.length - 1 && (
                    <IconBtn onClick={() => swap(idx, idx + 1)} title="Move right">
                      →
                    </IconBtn>
                  )}
                  <IconBtn onClick={() => remove(idx)} title="Remove" tone="danger">
                    ×
                  </IconBtn>
                </div>
              </div>
            ))}
            {value.length < maxImages && (
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={uploading > 0}
                style={{
                  aspectRatio: "4/3",
                  borderRadius: 8,
                  border: "2px dashed var(--shell-border, #e5e7eb)",
                  background: "var(--shell-pill-bg, #f9fafb)",
                  color: "var(--shell-fg, #111827)",
                  fontSize: "0.78rem",
                  fontWeight: 600,
                  cursor: uploading > 0 ? "not-allowed" : "pointer",
                }}
              >
                {uploading > 0 ? `Uploading ${uploading}…` : "+ Add"}
              </button>
            )}
          </div>
          <div style={{ fontSize: "0.72rem", color: "#6b7280" }}>
            {value.length} / {maxImages} images. First image is the cover — use the arrows to reorder.
          </div>
        </>
      )}

      {error && <div style={{ fontSize: "0.75rem", color: "#b91c1c" }}>{error}</div>}
    </div>
  );
}

function IconBtn({
  children,
  onClick,
  title,
  tone,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  tone?: "danger";
}) {
  const bg = tone === "danger" ? "rgba(239,68,68,0.9)" : "rgba(17,24,39,0.85)";
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      style={{
        width: 22,
        height: 22,
        borderRadius: 5,
        border: "none",
        background: bg,
        color: "#fff",
        fontSize: "0.75rem",
        fontWeight: 700,
        cursor: "pointer",
        lineHeight: 1,
        padding: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {children}
    </button>
  );
}
