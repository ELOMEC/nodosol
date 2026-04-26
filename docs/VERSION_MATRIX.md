# Version Matrix

Snapshot: 2026-04-26 · maintained for VC technical due diligence.

This document answers the question "are you on latest versions?" with a
specific yes/no per dependency, and a rationale where we deliberately
hold back a major bump. Pinning policy: patches auto-applied, minors on
review, majors only when ecosystem peer-deps move.

## Solana stack

| Component | Pinned | Latest stable | Status | Notes |
|---|---|---|---|---|
| Solana CLI / Agave validator | `3.1.13` | `3.1.13` | ✅ latest | Anza Agave v3 line; mainnet-stable |
| Anchor framework (Rust) | `1.0.1` | `1.0.1` | ✅ latest | Latest 1.x release (Apr 2026) |
| Anchor TS client (`@coral-xyz/anchor`) | `0.32.1` | `0.32.1` | ✅ latest | Last 0.x release; future is `@anchor-lang/core` |
| `@solana/web3.js` | `1.98.4` | `1.98.4` (v1 line) | ✅ latest of supported line | See "web3.js v2 / @solana/kit" below |
| `@solana/spl-token` | `0.4.14` | `0.4.14` | ✅ latest | |
| `@solana/wallet-adapter-react` | `0.15.39` | `0.15.39` | ✅ latest | |
| `@solana/actions` (Blinks) | `1.6.6` | `1.6.6` | ✅ latest | |
| `@dialectlabs/blinks` | `0.22.5` | `0.22.5` | ✅ latest | Native Blink renderer |
| `solana-security-txt` | `1.1.2` | `1.1.2` | ✅ latest | Embedded in all 9 programs |
| Rust toolchain | `1.89.0` | `1.95.0` | 🔵 deliberate hold | Pinned for SBF target stability; bump after audit (low risk, no benefit pre-audit) |

### web3.js v2 / @solana/kit — why we are not on it

`@solana/kit@6.8.0` (the rebrand of web3.js v2) is stable and shipping.
**We do not use it because the Anchor TS client requires v1.** Quoting
Anchor docs: *"`@anchor-lang/core` is only compatible with the legacy
version (v1) of `@solana/web3.js`. It is not compatible with v2."*
Tracking issue [coral-xyz/anchor#3243](https://github.com/coral-xyz/anchor/issues/3243)
has been open since September 2024 with no announced milestone.

Every Anchor-based Solana app is in the same position today, including:
Jupiter, Drift, Marinade, Phantom, Backpack, Squads, and Helius's own
SDK. We will migrate the moment Anchor #3243 lands, not before — going
custom would mean dropping Anchor's TS client entirely and hand-building
client code from IDL JSON, a 2-3 week rewrite that loses type safety
and adds bug surface for zero VC-relevant signal.

## Web stack

| Component | Pinned | Latest stable | Status |
|---|---|---|---|
| Next.js | `15.1.6` | `16.x` | 🔵 deliberate hold (major) |
| React | `19.2.5` | `19.2.5` | ✅ latest |
| TypeScript | `5.7.3` | `6.x` | 🔵 deliberate hold (major) |
| Tailwind | (none — inline styles) | n/a | n/a |
| ESLint | `9.39.4` | `10.x` | 🔵 deliberate hold (major) |
| Vitest | `4.1.5` | `4.1.5` | ✅ latest |
| Node.js | `22.x` LTS | `22.x` LTS | ✅ latest LTS |

### Next.js 16 / TypeScript 6 / ESLint 10 — why we are not on them

These are major bumps with breaking changes (Next 16 ships a new
compiler, middleware semantics shift; TS 6 tightens strict-mode
inference; ESLint 10 changes config format). We bump majors only
*when needed* — currently nothing in our roadmap is blocked on a
post-15 Next or post-5 TS feature. Bumping pre-audit just to be on
"latest" introduces churn risk in code that auditors will read. We
revisit after audit close.

## Auth & infrastructure

| Component | Pinned | Latest stable | Status |
|---|---|---|---|
| `@privy-io/react-auth` | `2.0.0` | `3.x` | 🔵 deliberate hold (major; auth flow revamp) |
| `@supabase/supabase-js` | `2.104.1` | `2.104.1` | ✅ latest |
| `@marsidev/react-turnstile` | `0.4.1` | `0.4.1` | ✅ latest |
| `bs58` | `6.0.0` | `6.0.0` | ✅ latest |
| `tweetnacl` | `1.0.3` | `1.0.3` | ✅ latest |
| `@react-google-maps/api` | `2.20.8` | `2.20.8` | ✅ latest |
| `qrcode.react` | `4.2.0` | `4.2.0` | ✅ latest |

## Backend / database

| Component | Pinned | Latest stable | Status |
|---|---|---|---|
| PostgreSQL (Supabase managed) | `15.x` | `16.x` | ⚪ Supabase upgrades on their schedule |
| Edge Functions runtime | Deno (Supabase managed) | n/a | ⚪ Supabase managed |

## CI / build

| Component | Pinned | Latest | Status |
|---|---|---|---|
| GitHub Actions cache | `actions/cache@v4` | `v4` | ✅ latest |
| Rust install in CI | `cargo install anchor-cli --tag v1.0.1` | n/a | ✅ latest |
| Solana install in CI | `release.anza.xyz/v$VERSION/install` | `3.1.13` | ✅ latest |

## On-chain program identifiers

| Program | Devnet ID |
|---|---|
| `tip_jar` | `C2bM3p1Cco4bDj6gQe29k7UWcepxLCrVgiPPoidh549P` |
| `subscription` | `8G2hbD1qJUcaVAEdfVxaHfbCgxyEzQdrpjhDMM9pSL4w` |
| `events` | `4q4KxCcvY7vswq3tXgr448ghXWBtz4PzNfoddZu282Ax` |
| `event_tickets` | `FDUwvXRETURbe2JN2PJNCKt6RPAsSLeSi7A4pFMGmtrE` |
| `rwa_registry` | `7BCWTrD7rcedAg3zpvtvNdManv39kzr3eHBjWyomCbdT` |
| `rwa_mint` | `HLCCfvp99Z1Rnix64mC6w6dYL9EkEjVmPCL7rr27evsU` |
| `marketplace` | `69ZFM7nHUTXcHp8TZpRtX4qr3ERK2VGxRdqXvNtbfJkZ` |
| `otc_deals` | `FmXBAWoSGanaFfP8p9gekgrFn7buEn1XUSFWebDr3Pwz` |
| `auctions` | `6c95kxTWCXacsAev4xnvNbKnLYWFGPpJT5zwT4SnWh5v` |

Upgrade authority: Squads 2-of-3 multisig (devnet rehearsed 2026-04-24).

## Pinning policy summary

- **Patches** (`x.y.Z`): bumped on next deploy without ceremony.
- **Minors** (`x.Y.0`): bumped on review, usually paired with feature work.
- **Majors** (`X.0.0`): bumped only when (a) a feature requires it, or (b) the ecosystem peer-deps move and no longer support the prior major. Pre-audit, we do not bump majors purely for "latest" optics — auditor reads benefit from stable, well-trodden versions.

## Triggers for re-evaluation

| If this happens | We bump |
|---|---|
| Anchor #3243 merges | Migrate to `@solana/kit` ASAP |
| `@anchor-lang/core` 2.x ships with `@solana/kit` peerDep | Same |
| Privy 3 stabilises with our auth flow | Bump Privy |
| Audit close + post-fundraise | Reconsider Next 16, TS 6, Rust 1.95 |

---

## Comparison with peers (publicly verifiable)

To put our position in context: open `package.json` of any Anchor-based
production app and you'll see web3.js v1, Anchor TS 0.x, wallet-adapter
v1. Same story for every project shipping today. Examples:

| Project | web3.js | Anchor TS |
|---|---|---|
| Jupiter Aggregator | v1 | 0.x |
| Drift Protocol | v1 | 0.x |
| Marinade Finance | v1 | 0.x |
| Phantom Wallet SDK | v1 | n/a (no Anchor) |
| Squads SDK | v1 | 0.x |
| Helius SDK | v1 (compat with v2 in select packages) | 0.x |

Every Solana team is waiting on the same Anchor migration. We are not behind; we are *on the curve*.
