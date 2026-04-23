"use client";

import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

type ToastKind = "success" | "error" | "info";

type ToastRecord = {
  id: number;
  kind: ToastKind;
  message: string;
  createdAt: number;
};

type ToastApi = {
  success: (message: string, opts?: { durationMs?: number }) => void;
  error: (message: string, opts?: { durationMs?: number }) => void;
  info: (message: string, opts?: { durationMs?: number }) => void;
  dismiss: (id: number) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

const DEFAULT_DURATION_MS = 5000;
const ERROR_DURATION_MS = 8000; // errors get more dwell time

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);

  const push = useCallback(
    (kind: ToastKind, message: string, durationMs?: number) => {
      const id = Date.now() + Math.random();
      const ttl =
        durationMs ?? (kind === "error" ? ERROR_DURATION_MS : DEFAULT_DURATION_MS);
      setToasts((prev) => [...prev, { id, kind, message, createdAt: Date.now() }]);
      // Schedule dismissal. Using a ref-free setTimeout is fine since React
      // will just ignore setState on unmount during dev StrictMode.
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, ttl);
    },
    [],
  );

  const api = useMemo<ToastApi>(
    () => ({
      success: (m, o) => push("success", m, o?.durationMs),
      error: (m, o) => push("error", m, o?.durationMs),
      info: (m, o) => push("info", m, o?.durationMs),
      dismiss: (id) => setToasts((prev) => prev.filter((t) => t.id !== id)),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastStack toasts={toasts} onDismiss={api.dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Graceful no-op fallback: components may render during SSR or outside
    // the provider (e.g. unit tests) — better to silently drop than crash.
    return {
      success: () => {},
      error: () => {},
      info: () => {},
      dismiss: () => {},
    };
  }
  return ctx;
}

function ToastStack({
  toasts,
  onDismiss,
}: {
  toasts: ToastRecord[];
  onDismiss: (id: number) => void;
}) {
  if (toasts.length === 0) return null;
  return (
    <div
      style={{
        position: "fixed",
        top: 16,
        right: 16,
        display: "flex",
        flexDirection: "column",
        gap: "0.55rem",
        zIndex: 9999,
        maxWidth: 380,
        pointerEvents: "none",
      }}
      role="region"
      aria-label="Notifications"
      aria-live="polite"
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={() => onDismiss(t.id)} />
      ))}
    </div>
  );
}

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: ToastRecord;
  onDismiss: () => void;
}) {
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    // Trigger enter transition on next frame.
    const raf = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const palette = PALETTES[toast.kind];
  return (
    <div
      onClick={onDismiss}
      style={{
        background: palette.bg,
        border: `1px solid ${palette.border}`,
        color: palette.fg,
        padding: "0.7rem 0.9rem",
        borderRadius: 10,
        fontSize: "0.86rem",
        fontWeight: 500,
        lineHeight: 1.45,
        cursor: "pointer",
        pointerEvents: "auto",
        boxShadow:
          "0 4px 12px rgba(15,23,42,0.08), 0 1px 2px rgba(15,23,42,0.04)",
        display: "flex",
        alignItems: "flex-start",
        gap: "0.55rem",
        transform: entered ? "translateX(0)" : "translateX(24px)",
        opacity: entered ? 1 : 0,
        transition: "transform 180ms ease, opacity 180ms ease",
      }}
      role="alert"
    >
      <span aria-hidden style={{ fontSize: "1rem", lineHeight: 1 }}>
        {palette.icon}
      </span>
      <span style={{ flex: 1, wordBreak: "break-word" }}>{toast.message}</span>
    </div>
  );
}

const PALETTES: Record<ToastKind, { bg: string; border: string; fg: string; icon: string }> = {
  success: {
    bg: "#ecfdf5",
    border: "#a7f3d0",
    fg: "#065f46",
    icon: "✓",
  },
  error: {
    bg: "#fef2f2",
    border: "#fecaca",
    fg: "#991b1b",
    icon: "⚠",
  },
  info: {
    bg: "#eff6ff",
    border: "#bfdbfe",
    fg: "#1e40af",
    icon: "ℹ",
  },
};
