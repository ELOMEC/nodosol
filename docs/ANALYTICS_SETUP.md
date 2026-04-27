# Analytics setup

Sprint 3 / Bucket S landed Google Analytics 4 wiring with a
default-denied consent flow. This doc walks the activation path,
plus a Plausible alternative if you'd rather skip the consent
banner entirely.

## Architecture (what's already shipped)

```
web/components/Analytics.tsx      → loads gtag.js + sets default-denied consent
web/components/ConsentBanner.tsx  → flips consent to granted on Accept; persists in localStorage
web/app/layout.tsx                → mounts both inside <head> + <body>
```

Without `NEXT_PUBLIC_GA_MEASUREMENT_ID`, both components short-circuit
to `null` — no scripts, no banner. Activating GA4 is a one-env-var flip
on Vercel.

## Activate GA4

1. **Google Analytics console** → Admin → Create property → name
   "Nodosol", reporting time zone Europe/Belgrade (or whatever
   matches your accounting). Set Data Stream type Web, hostname
   `nodosol.com`. GA4 hands you a Measurement ID (`G-XXXXXXXXXX`).

2. **Vercel** → nodosol project → Settings → Environment Variables:

   | Variable | Value | Environments |
   |---|---|---|
   | `NEXT_PUBLIC_GA_MEASUREMENT_ID` | `G-XXXXXXXXXX` | Production, Preview |

3. Trigger a redeploy (Vercel → Deployments → latest → Redeploy).

4. Smoke test in incognito:
   - Open `nodosol.com`
   - Wait ~600ms; the consent banner should slide in.
   - Click **Decline** — Network tab shows `gtag/js?id=...` loaded but
     no `collect?...` requests fire.
   - Reload, click **Accept** — `collect?...` requests start firing
     (page_view, then any subsequent navigation).

## What we measure

By default we keep it minimal:

- `page_view` on every navigation (auto via gtag config).
- Anonymised IP (`anonymize_ip: true`).
- No custom events yet — add them via
  `window.gtag('event', '<name>', { ... })` once you have a clear
  funnel question.
- No ad-storage / ad-personalization signals — even on Accept those
  stay denied because we don't run ads.

## Consent semantics

The banner mounts only when:

- `NEXT_PUBLIC_GA_MEASUREMENT_ID` is set, and
- the user hasn't already chosen, and
- DNT is off (browser-level Do Not Track stays denied with no banner).

Choices persist in `localStorage` under `nodosol_analytics_consent`:

| Choice | Re-prompt cool-off |
|---|---|
| Accept | 365 days |
| Decline | 14 days |

Privacy policy at `/privacy` documents the same model — keep them in
sync if you change retention.

## Plausible alternative (cookieless, no consent banner)

If you'd rather sidestep the GA + consent flow entirely, Plausible is
a drop-in alternative that doesn't use cookies and therefore
doesn't need a consent banner under GDPR / ePrivacy. Trade-offs:

- ~$9/mo per ~10k pageviews (paid SaaS) vs GA's free tier.
- Smaller event taxonomy than GA (no funnel reports out of the box).
- No Google Search Console integration.

To swap:

1. Sign up at plausible.io (or self-host).
2. Replace `web/components/Analytics.tsx` body with:

   ```tsx
   import Script from "next/script";

   export function Analytics() {
     const domain = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN;
     if (!domain) return null;
     return (
       <Script
         strategy="afterInteractive"
         data-domain={domain}
         src="https://plausible.io/js/script.js"
       />
     );
   }
   ```

3. Drop `web/components/ConsentBanner.tsx` from `web/app/layout.tsx`
   (Plausible is cookieless so consent isn't required under most
   regulators).
4. Set `NEXT_PUBLIC_PLAUSIBLE_DOMAIN=nodosol.com` on Vercel,
   redeploy.
5. Update `/privacy` so the analytics section reflects the swap.

## Where to read traffic

- **GA4**: Reports → Realtime (live), Acquisition → Traffic
  acquisition (sources), Engagement → Pages and screens.
- **Vercel Web Analytics**: separate product, $20/mo, lightweight
  dashboard. Already partially wired via the
  `*.vercel-insights.com` connect-src in the CSP. Activate from
  Vercel → project → Analytics tab if you want it alongside GA.

## Audit / privacy hygiene

- We log no analytics events tied to wallet pubkey. Wallet is
  client-side only and never reaches the GA stream.
- `anonymize_ip: true` truncates the last octet before geo-lookup.
- `analytics_storage` and `ad_storage` start denied; only the user's
  Accept flips analytics_storage to granted. Ad consent stays denied
  always (no ads).
- DNT browsers see no banner and stay denied.
