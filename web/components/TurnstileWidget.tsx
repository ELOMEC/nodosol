"use client";

import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";
import { forwardRef } from "react";

/**
 * Thin wrapper around @marsidev/react-turnstile that hides the widget
 * entirely when NEXT_PUBLIC_TURNSTILE_SITE_KEY is not configured — the
 * server-side verifier in post-chat-message mirrors this graceful-skip
 * pattern so local/dev stays frictionless.
 *
 * Ref forwards to a TurnstileInstance so callers can `.reset()` after a
 * successful submit (tokens are one-shot).
 */
type Props = {
  onToken: (token: string | null) => void;
};

export const TurnstileWidget = forwardRef<TurnstileInstance | undefined, Props>(
  function TurnstileWidget({ onToken }, ref) {
    const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";
    if (!siteKey) return null;
    return (
      <Turnstile
        ref={ref}
        siteKey={siteKey}
        options={{
          appearance: "interaction-only",
          theme: "light",
        }}
        onSuccess={(token) => onToken(token)}
        onExpire={() => onToken(null)}
        onError={() => onToken(null)}
      />
    );
  },
);

export function turnstileConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);
}
