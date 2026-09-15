"use client";

import Script from "next/script";

/**
 * S1 — Google Analytics 4 with default-denied consent.
 *
 * The component renders nothing (and skips both scripts) unless
 * `NEXT_PUBLIC_GA_MEASUREMENT_ID` is set on the deployment. When it
 * is, two next/script tags ship:
 *
 *   1. `gtag-init` runs synchronously before any GA call. It sets
 *      `gtag('consent', 'default', {...})` to deny ad + analytics
 *      storage, plus a `wait_for_update` flag so any GA call queued
 *      before the user accepts is held until consent flips. We also
 *      respect the `Do Not Track` browser hint by leaving consent
 *      denied even if the user later clicks Accept (defence in depth).
 *
 *   2. `gtag-load` is the actual GA4 loader script (afterInteractive)
 *      so it doesn't compete with first paint.
 *
 * `ConsentBanner` (separate component) is what flips consent to
 * granted via `gtag('consent', 'update', { ... })`. Decline persists
 * for 14 days in localStorage so we don't re-prompt every visit.
 */

export function Analytics() {
  const measurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
  if (!measurementId) return null;

  // Inline-snippet variant of the GA4 boilerplate. We initialise gtag
  // and set consent BEFORE the loader fires so the first measurement
  // call sees consent=denied rather than the GA default of granted.
  const initSnippet = `
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    window.gtag = gtag;
    gtag('consent', 'default', {
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
      analytics_storage: 'denied',
      wait_for_update: 500
    });
    gtag('js', new Date());
    gtag('config', '${measurementId}', {
      anonymize_ip: true,
      send_page_view: true
    });
  `;

  return (
    <>
      <Script
        id="gtag-init"
        strategy="beforeInteractive"
        dangerouslySetInnerHTML={{ __html: initSnippet }}
      />
      <Script
        id="gtag-load"
        strategy="afterInteractive"
        src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`}
      />
    </>
  );
}
