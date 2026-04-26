# Architecture — Nodosol

Snapshot: 2026-04-26 · linkable from pitch deck for technical due diligence.

## One-paragraph overview

Nodosol is a vertical Solana super-app spanning two complementary
verticals: **creator economy** (tipping, subscriptions, ticketed
events) and **tokenized real-world assets** (issuer registry,
tokenization, marketplace, OTC, sealed-bid auctions). Nine Anchor
programs (~10.7k LoC Rust, 93 instructions, 27 LiteSVM test files)
ship a complete primary-and-secondary market cycle. The application
is non-custodial — every flow settles in one transaction, no backend
holds funds. Web app is Next.js 15 deployed to Vercel; Supabase
provides off-chain metadata, chat, and notifications, all RLS-gated by
wallet-signed JWTs.

## On-chain programs

| Program | Devnet ID | LoC | IX | Purpose |
|---|---|---:|---:|---|
| `tip_jar` | `C2bM3p1C…h549P` | 841 | 10 | Creator tips, USDC vault, full lifecycle |
| `subscription` | `8G2hbD1q…pSL4w` | 1,392 | 13 | SPL-delegate recurring billing, permissionless `charge` + `expire` cranks |
| `events` | `4q4KxCcv…282Ax` | 1,061 | 11 | Legacy event/ticket primitive (V1) |
| `event_tickets` | `FDUwvXRE…Gmtre` | 3,336 | 22 | Seated venues, cNFT tickets, atomic resale, royalty split, private-price commit/reveal, permissionless expiry reclaim |
| `auctions` | `6c95kxTW…WSnh5v` | 1,244 | 9 | Sealed-bid commit/reveal with USDC escrow |
| `marketplace` | `69ZFM7nH…fJkZ` | 894 | 9 | RWA listings + escrow buy |
| `otc_deals` | `FmXBAWoS…3Pwz` | 995 | 9 | Two-party USDC escrow, propose/accept/cancel/expire |
| `rwa_registry` | `7BCWTrD7…Cbdt` | 567 | 6 | Issuer registry, asset-class bitmap, jurisdiction state machine |
| `rwa_mint` | `HLCCfvp9…evsU` | 515 | 4 | Token-2022 fixed-supply tokenization with cross-program issuer verification |
| **Total** | | **~10,748** | **93** | |

All nine programs:
- Embed `solana_security_txt!` with disclosure contact.
- Build with Anchor 1.0.1 + `solana-program 2.x`, target Solana Agave 3.1.13.
- Pass under Rust 1.89.0 (toolchain pinned for SBF target stability).

## Shared patterns

### Config PDA
Seven of nine programs share a `Config` PDA (seeds `[b"config"]`) holding
`authority`, `treasury`, `fee_bps` (cap 1,000 = 10%), `paused`. Four
admin instructions per program: `initialize_config`, `update_fee_bps`,
`update_treasury`, `update_config_authority`. Audit benefit: the pattern
is identical across programs, so reviewing it once covers most fund
flows.

### Global pause kill-switch
Seven programs have a `paused: bool` in Config and an `update_pause`
admin instruction. Eleven fund-moving instructions across the suite
gate on `!config.paused`: `send_tip`, `subscribe`, `charge`,
`buy_ticket` (events), `buy_ticket` + `buy_tier_ticket` (event_tickets),
`buy_ticket_resale` (public + private), `buy_listing`, `accept_deal`,
`settle_auction`. Skipped from pause: `rwa_mint` and `rwa_registry`
(admin-only, no fund flow), withdraw-type instructions, and
`commit_bid`/`refund_bid` (no Config in their Accounts; future change).

### Permissionless cranks
Three places where any wallet can pay the tx fee to nudge state forward:
- `subscription.charge` — bills due subscribers
- `subscription.expire` — marks subscriptions Expired after grace
- `event_tickets.close_expired_resale` — reclaims escrowed cNFT to lister
- `auctions.settle_auction` — settles after reveal window

### Escrow vault PDA
Six programs hold user funds in vault PDAs (seeds `[b"vault", parent.as_ref()]`):
tip_jar, subscription, events, event_tickets, marketplace, otc_deals,
auctions. Vault is always the program's PDA, never a user wallet.

### keccak256 commit/reveal
Two privacy primitives use the same hash-then-reveal pattern:
- Sealed-bid auctions: bidder commits `keccak256(price, nonce)`,
  reveals plain values after the commit window.
- Private-price ticket resale: lister commits the price, only buyers
  who learn the price off-chain (chat) can match the commit and buy.

### Cross-program verification
`rwa_mint.tokenize_asset` reads `rwa_registry.Issuer` to enforce that
the calling wallet is `Active` and authorised for the requested asset
class. Verified at `seeds::program = rwa_registry::ID`, no fragile
account-map check.

### Bubblegum cNFTs
`event_tickets` mints compressed NFT tickets via the Metaplex Bubblegum
program. Hand-serialized CPI (no `mpl-bubblegum` dep) to keep program
binary under the 589 KB ceiling.

## Off-chain stack

### Web (Next.js 15 App Router)
Deployed on Vercel, root domain `nodosol.com`. Major surfaces:
- `/marketplace` — RWA listings (filter + search + sort)
- `/marketplace/{events,auctions,rentals,resale,properties}` — five vertical browses
- `/marketplace/assets/[mint]` — full asset detail page (gallery, location, listings, OTC, balance)
- `/marketplace/portfolio` — wallet holdings
- `/creator` + `/creator/{events,plans,tips,venues,profile}` — creator ops
- `/c/[handle]` — public creator profile (RLS-gated metadata + on-chain stats)
- `/welcome` — 4-step onboarding wizard with role picker
- `/pitch` — VC pitch
- `/tech` — this document's audience: technical DD
- `/stats` — live on-chain counters (queried per page-load)

### Supabase (Postgres + Auth + Storage + Realtime + Edge Functions)
- 17 SQL migrations applied; full schema in `supabase/*.sql`
- RLS gating: chat reads + creator profiles + notifications all use
  `auth.jwt()->>'sub' = wallet_pubkey`. JWT minted by `issue-chat-jwt`
  Edge Function after wallet signs an ed25519 challenge.
- Storage bucket `asset-media` holds enriched metadata JSON + galleries
  + venue floor plans. Server-signed challenge for chat backed by
  `CHAT_JWT_SECRET` in function secrets.
- Edge Functions: `post-chat-message`, `issue-chat-jwt`,
  `gc-tier-seats` (cron — expired ticket reservations),
  `charge-due` (cron — permissionless rent cranker),
  `helius-webhook` (NEW — receives Helius enhanced-tx, writes notifications).
- pg_cron schedules: hourly tier-seat GC, hourly charge-due cranker.

### RPC + indexing
Helius RPC + Helius enhanced-tx webhooks. Edge Function decodes
program-relevant transfers and writes per-wallet notifications.
Frontend `NotificationsBell` reads with the same chat JWT and
subscribes to `postgres_changes` for realtime delivery.

## Security posture

- **Audit**: outreach in flight to OtterSec, Neodyme, Zellic
  (4-8 week wait list typical). One-pager + scope spec in
  `docs/AUDIT_OUTREACH.md`.
- **Upgrade authority**: Squads 2-of-3 multisig holds upgrade authority
  on all nine programs (devnet rehearsed 2026-04-24). Dev keypair
  `3E8ZZJ…rqBr` no longer can deploy.
- **`security_txt`**: every program embeds disclosure contact
  (`security@nodosol.com`).
- **Global pause**: seven fund-moving programs ship a pause
  kill-switch; documented runbook in `docs/SECURITY_RUNBOOK.md`.
- **Chat write hardening**: all writes go through `post-chat-message`
  Edge Function with ed25519 verify + 30 msg / 5 min rate limit +
  optional Cloudflare Turnstile.
- **JWT discipline**: 15-min TTL, in-memory + localStorage cache keyed
  by wallet pubkey; signed challenge required cold path. RS256 not
  used because Supabase RLS hard-codes HS256 for custom JWT.
- **Security events log**: `security_events` table + 2 views
  (recent-abuse, hot-wallets). All edge functions log
  `sig_verify_fail`, `challenge_expired`, `rate_limit_hit`,
  `turnstile_fail`, `jwt_issued`.

## Test coverage

- **Rust on-chain**: 27 LiteSVM test files across 9 programs;
  ~110+ test cases covering happy path + auth boundary + arithmetic
  overflow + permissionless cranks + clock advancement.
- **CI**: GitHub Actions caches Anchor binary, installs Solana CLI
  via Anza, runs full `cargo test` per push to `main`.
- **TS**: strict-mode TypeScript build gate
  (`./node_modules/.bin/tsc --noEmit`), zero errors required to merge.

## Token economics

- **Display currency**: USDC (mock USDC on devnet, mint
  `73w3ocXSe2yDMWTHj1kwQxrbNjUY9tBJP9HYDkcpmh7h`). Token-2022
  with all production extensions ready (Confidential Transfers
  mint deployed on a parallel mint awaiting Arcium June 2026).
- **Fee_bps**: 0 today across all programs (devnet). Lever
  flippable per-program by config authority. Auction = 250 (2.5%),
  marketplace = 250, OTC = 300 (3%) once activated; tip + sub +
  events = TBD post-mainnet.
- **Treasury**: dev wallet's mock-USDC ATA on devnet
  (`EXq5DAiP…ExGA`); will rotate to a Squads-controlled treasury on
  mainnet.

## Deployment topology

```
Internet
    ↓
Vercel (Edge CDN, auto-deploy from main)
    ├── nodosol.com  (Next.js 15 app)
    └── preview.nodosol.com  (marketing scaffold)

Supabase Cloud (xvgxaodxylrolkpyuszx)
    ├── Postgres 15 (RLS, pg_cron)
    ├── Storage (asset-media bucket)
    ├── Realtime (postgres_changes)
    └── Edge Functions (Deno)

Solana devnet
    ├── 9 Anchor programs (Squads-controlled upgrade authority)
    └── Helius RPC + enhanced-tx webhooks → helius-webhook Edge Fn
```

Mainnet checklist lives in `docs/mainnet-deploy-plan.md`.

## Roadmap snapshots

Strategic priorities ordered by upcoming impact:

1. **Audit firm engagement** — slot booked, target Q2/Q3 2026 close.
2. **Mainnet deploy plan** — staged migration; Squads multisig with
   hardware-wallet co-signers; treasury rotation.
3. **Per-program notification decoders** — current decoder emits
   generic `tip_received` / `token_inflow` from token transfers; richer
   decoders use IX discriminator + accounts[] mapping per IDL.
4. **Email delivery** — schema reserved (`email_eligible`,
   `email_sent_at`, `notification_preferences`); Resend wire-up is
   the missing piece.
5. **Confidential Transfers integration** — deferred to Arcium
   (Solana-Foundation-backed MPC firm shipping June 2026); we are
   on their early-access list.

## File reference

- `docs/VERSION_MATRIX.md` — every dep with rationale
- `docs/AUDIT_OUTREACH.md` — auditor scope one-pager + email drafts
- `docs/SECURITY_RUNBOOK.md` — JWT rotate, Squads ops
- `docs/NOTIFICATIONS_SETUP.md` — Helius webhook + email plan
- `docs/STATE_AUDIT.md` — frontend feature reality check
- `docs/mainnet-deploy-plan.md` — staged migration plan
- `Anchor.toml` — program ID anchors
- `web/idl/*.json` — 9 IDL files (regenerated per program build)
