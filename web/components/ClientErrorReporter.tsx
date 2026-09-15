"use client";

import { useEffect } from "react";

const DEDUPE_WINDOW_MS = 15_000;
let lastReportKey = "";
let lastReportAt = 0;

type ErrorPayload = {
  message: string;
  stack?: string;
  route?: string;
};

async function reportClientError(payload: ErrorPayload): Promise<void> {
  const key = `${payload.route ?? ""}:${payload.message}`;
  const now = Date.now();
  if (key === lastReportKey && now - lastReportAt < DEDUPE_WINDOW_MS) return;
  lastReportKey = key;
  lastReportAt = now;

  await fetch("/api/log-error", {
    method: "POST",
    headers: { "content-type": "application/json" },
    keepalive: true,
    body: JSON.stringify(payload),
  }).catch(() => {});
}

function normalizeReason(reason: unknown): ErrorPayload {
  const route = typeof window !== "undefined" ? window.location.pathname : undefined;
  if (reason instanceof Error) {
    return {
      message: reason.message || "Unhandled client error",
      stack: reason.stack,
      route,
    };
  }
  if (typeof reason === "string") {
    return { message: reason, route };
  }
  return { message: "Unhandled client error", route };
}

export function ClientErrorReporter() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      const payload = normalizeReason(event.error ?? event.message);
      if (!payload.stack && event.filename) {
        payload.stack = `${event.filename}:${event.lineno}:${event.colno}`;
      }
      void reportClientError(payload);
    };

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      void reportClientError(normalizeReason(event.reason));
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
    };
  }, []);

  return null;
}
