# Nodosol — mainnet deploy plan & pre-launch security review

Snapshot of what needs to be true before any program is deployed to
mainnet-beta, plus the staged rollout we will actually run. Living
document — update as items get resolved.

## 1. Program inventory (devnet → mainnet)

| Program | Devnet ID | Purpose | Audit priority |
| --- | --- | --- | --- |
| `tip_jar` | `C2bM3p1Cco4bDj6gQe29k7UWcepxLCrVgiPPoidh549P` | Creator tips | Medium |
| `subscription` | `8G2hbD1qJUcaVAEdfVxaHfbCgxyEzQdrpjhDMM9pSL4w` | Recurring billing via SPL delegate (rentals vertical) | **High** (delegate pattern) |
| `events` | `4q4KxCcvY7vswq3tXgr448ghXWBtz4PzNfoddZu282Ax` | Generic event tickets (superseded by `event_tickets`) | Low (deprecate?) |
| `event_tickets` | `FDUwvXRETURbe2JN2PJNCKt6RPAsSLeSi7A4pFMGmtrE` | Seated ticketing + cNFT resale + royalty split | **High** (holds user funds, Bubblegum CPI) |
| `rwa_registry` | `7BCWTrD7rcedAg3zpvtvNdManv39kzr3eHBjWyomCbdT` | Licenced issuer registry | **High** (compliance backbone) |
| `rwa_mint` | `HLCCfvp99Z1Rnix64mC6w6dYL9EkEjVmPCL7rr27evsU` | RWA Token-2022 tokenisation | **High** (fixed supply, cross-program check) |
| `marketplace` | `69ZFM7nHUTXcHp8TZpRtX4qr3ERK2VGxRdqXvNtbfJkZ` | Listings + escrow + fee split | **High** (holds user funds) |
| `otc_deals` | `FmXBAWoSGanaFfP8p9gekgrFn7buEn1XUSFWebDr3Pwz` | Dual-party OTC escrow | **High** (holds user funds) |
| `auctions` | `6c95kxTWCXacsAev4xnvNbKnLYWFGPpJT5zwT4SnWh5v` | Sealed-bid commit/reveal + USDC escrow | **High** (holds user funds, commit/reveal crypto) |

**9 programs total.** Combined `.so` binary size is ~3.2 MB. Budget
~15 SOL for mainnet deploys (rent + buffers).

## 2. Pre-mainnet hard blockers

These MUST be resolved before a mainnet program ID is created.

### 2.1 External audit of the High-priority programs
- Scope: `subscription`, `rwa_registry`, `rwa_mint`, `marketplace`, `otc_deals`
- Get two firms if possible (OtterSec, Neodyme, Halborn, Trail of Bits Solana team)
- Budget 6–10 weeks lead time
- Fix every High/Critical finding; document accepted Medium risks

### 2.2 Upgrade authority governance
- **Today:** single dev keypair is upgrade authority on every program
- **Mainnet:** multisig (Squads v3 or Realms) as upgrade authority, 2-of-3 minimum
- Rotate before deploy: new mainnet program IDs from fresh keypairs in a
  cold-signed ceremony; dev keypair never touches mainnet

### 2.3 Config authority
- Each program's Config PDA has an `authority` that can flip fee_bps,
  treasury, and authority itself
- Same multisig controls all five Configs
- Script to batch-set authorities after init

### 2.4 Treasury custody
- **Devnet history (2026-04-22 → 23):** treasury was originally the dev
  wallet's mock-USDC ATA, which caused Anchor's
  `duplicate mutable account constraint` on every buy/accept/settle from
  the dev wallet (seller ATA == treasury ATA). Root-caused and fixed by
  generating a standalone treasury keypair (`treasury-keypair.json`,
  gitignored) and running `update_treasury` on all 9 programs. See
  `scripts/fix-treasury.ts`.
- **Lesson for mainnet:** seller wallet MUST be a different Solana
  account than the treasury-ATA owner. Enforce at init time — the init
  script should fail if `treasury_owner == authority`.
- **Mainnet spec:**
  - Treasury keypair lives in Squads multisig (cold), never in a repo
  - Each program's config gets the SAME treasury ATA on mainnet to
    simplify accounting and reuse withdraw tooling
  - `update_treasury` is part of post-deploy init checklist
  - Monthly treasury sweep to operator cold wallet (separate from
    multisig to limit blast radius)

### 2.5 RWA legal layer
- Licences live off-chain (Mladen's acquired entity). Reference them in
  `IssuerRegistry.kyc_ref` on-chain; store the signed paper trail off-chain
- Jurisdiction enforcement: decide whether we refuse to mint assets for
  jurisdictions we do not hold licences in (today the registry allows any
  3-byte code). Before mainnet, gate `register_issuer` on an allow-list of
  jurisdiction codes matching active licences.

### 2.6 Supply controls on RWA
- `rwa_mint.tokenize_asset` revokes mint authority automatically — good
- Add optional freeze-authority support so the issuer can freeze
  fraudulent transfers? Decide pre-mainnet. For now, freeze authority is
  left as `None` at mint creation time in the client.

### 2.7 Chat production auth
- **Writes: ✅ fully locked down (2026-04-23).** Migration 012 dropped
  `threads_write` RLS policy; `post-chat-message` Edge Function (ed25519
  verification + 15-min challenge freshness + rate limit 30 msg / 5 min)
  is the only path. Client still does a best-effort `chat_threads`
  upsert that RLS silently rejects — harmless fallback for state
  mismatches.
- **Reads: still open.** Memo-hash is 64-char hex = effectively
  unguessable, so this is practical security-through-obscurity for
  devnet. For mainnet, decide between (a) RLS-by-pubkey + Sign-In With
  Solana JWT, or (b) keep open and accept that anyone who captures a
  memo_hash can read the thread. Recommend (a) before mainnet open.
- **Read-side implementation if (a):** Supabase Edge Function issues a
  short-lived JWT after verifying a Solana signature; RLS policy on
  `chat_messages` checks that JWT's `sub` matches `seller_pubkey` or
  `buyer_pubkey` in the referenced thread. Client passes the JWT as
  Supabase auth header for all reads + realtime subscribes.

## 3. Soft blockers (should fix)

### 3.1 Edge-case program behaviour to test on devnet
- Cancelling a partially-sold listing refunds only the vault remainder ✅
- Expiring an OTC deal after counterparty loses their ATA (auto-creates? no — recreate manually)
- Buying a listing where remaining_quantity was updated between fetch
  and submit (stale client state) — program enforces; surface a clean error
- Fee rounding edge case: `total * fee_bps / 10_000` with total=1 and
  fee_bps=250 → fee=0, seller gets all. Intended. Document in README.

### 3.2 Compute budget audit
- `buy_listing` currently ships with `setComputeUnitLimit(400_000)`. Measure
  actual CU draw on mainnet RPC, lower to real ceiling + 20% margin before
  launch.

### 3.3 Associated Token Account rent attack
- `init_if_needed` in `buy_listing` and `accept_deal` lets the buyer
  create their own ATA. Fine, buyer pays rent. No vector.

### 3.4 Frontend failure modes
- Wallet rejects signature → no orphaned mint account (we partial-sign
  after build; wallet never sees the mint keypair in a separate step)
- Supabase Edge Function downtime → chat write blocked but on-chain flow
  is independent. Document SLA to users.

### 3.5 Denial-of-service on getProgramAccounts
- Marketplace grid does `Listing.all()` on every load. At 10k listings
  this is slow. Before mainnet, add a backend indexer (Helius webhook →
  Supabase `listings_index` table, client reads from Supabase) or
  paginate.

### 3.6 Duplicate-mutable-account audit
- **Lesson from 2026-04-22/23 bug:** every instruction with `#[account(mut)]`
  pointing at ATAs derived from the caller's pubkey can collide with
  another `mut` account if the caller plays multiple roles (seller ==
  treasury owner, buyer == seller, etc). Anchor rejects the whole tx
  with `A duplicate mutable account constraint was violated` — Phantom
  surfaces this as "Unexpected error".
- **Audit before mainnet:** for every fund-moving instruction, list the
  set of `mut` accounts and verify no two can derive to the same
  address under any caller/config combination. Known clean as of
  2026-04-23 via separate treasury wallet — but keep the rule in mind
  when adding new instructions.

### 3.7 Client transaction UX
- **Preflight simulate is now standard (2026-04-23).** `lib/tx.ts`
  exposes `simulateAndSend(connection, wallet, { feePayer, instructions })`
  which runs `connection.simulateTransaction` before
  `wallet.sendTransaction`, decoding program logs via
  `decodeSimulationError` so failed txs surface the real reason
  (AnchorError, SPL Token error code, insufficient funds) instead of
  Phantom's opaque wrapper.
- **Applied to:** marketplace buy (grid + detail), OTC propose/accept/cancel,
  settle auction, event ticket buy, rental subscribe.
- **Before mainnet:** migrate remaining `wallet.sendTransaction` sites
  (commit_bid, reveal_bid, refund_bid, create_auction, cancel_auction,
  tokenize, create_event, withdraw_revenue, list_ticket_resale,
  buy_ticket_resale, admin flows) to `simulateAndSend`. Bad UX is a
  launch blocker — users will bounce when their first tx is "Unexpected
  error" with no actionable info.

## 4. Staged rollout

### Phase A — Devnet soak (2026-04 → Q2 2026)
- Current state. Free for Mladen + hand-picked testers.
- Targets: 20+ real asset tokenisations, 10+ completed buys, 5+ OTC
  deals accepted. Enough volume to surface edge cases.

### Phase B — Mainnet-beta "closed" (post-audit, before licences go live)
- Deploy audited programs to mainnet. Single whitelisted issuer (Mladen's
  licenced entity). fee_bps = 0 initially to avoid tax/accounting complexity
  during the first weeks.
- Marketing: private launch to the Foundation network + warm-intro VCs.
- Success gate: 30 days with no P0/P1 incidents, at least 1 external
  market-making listing.

### Phase C — Mainnet "open" (issuer onboarding)
- Start registering additional issuers one at a time with `register_issuer`
- fee_bps ramps: 0 → 1% → 2.5% as volume stabilises
- Public pitch, Solana Foundation grants outreach, Stripe-for-Solana framing

### Phase D — Mobile + Privy
- Expo app with Privy embedded wallets → mass-market retail flow
- cNFT tickets for event vertical
- International licence expansion as Mladen's entity grows

## 5. Operational readiness

### 5.1 RPC providers
- **Primary:** Helius dedicated node with `getProgramAccounts` support (required for marketplace grid)
- **Fallback:** Triton or QuickNode
- Health check in web app; auto-fall-back on 503

### 5.2 Monitoring
- Helius webhooks → Supabase table for every program's events
- Grafana dashboard (or Helius built-in) with: tx success rate, CU usage,
  account rent pressure, treasury balance
- Slack channel `#nodosol-ops` with PagerDuty escalation for seller/buyer
  impact incidents

### 5.3 Incident response
- Freeze plan: `update_fee_bps(0)` + emit public warning → gives time to
  investigate without charging broken tx. For worse cases, upgrade
  program to a paused-only version that rejects instructions.
- Rollback: programs are upgradable via multisig; hold previous `.so`
  artefact on IPFS with git tag

### 5.4 Runbooks
- Register new issuer
- Rotate treasury
- Change fee_bps
- Handle stuck OTC deal (seller loses keys → authority multisig can call
  `close_issuer` on their registry record but cannot recover their OTC vault;
  counterparty waits for expiry crank)

### 5.5 Legal & compliance runtime
- Monthly audit that every `Issuer` in registry still matches off-chain
  KYC. If licence lapses, multisig runs `update_issuer_status(Suspended)`
  immediately (no new tokenisation; existing tokens keep trading).
- Tax: 1099/MISC equivalent per jurisdiction; accountant engagement
  before first real money flows.

## 6. What's not yet decided

- Mobile wallet choice at scale: Privy vs Dynamic vs Phantom embedded
- Chat provider at scale: Supabase realtime (current) vs XMTP (decentralised)
- cNFT tickets timeline (Bubblegum integration is 2-3 week dev task)
- Whether to launch a token. Default: NO.

## 7. Go/No-Go checklist

Concrete gates that must all be green before flipping mainnet. Treat
this as the launch-blocker list; anything unchecked means NO-GO.

### Security & audit
- [ ] External audit complete on 7 High-priority programs
- [ ] All High/Critical findings fixed and re-reviewed
- [ ] Medium findings either fixed or documented as accepted risk
- [ ] Bug bounty live (Immunefi or self-hosted) with min $10k pool
- [ ] Red-team pass on frontend/API (at least internal)

### Keys & authority
- [ ] Mainnet program keypairs generated in cold ceremony (never on dev machine)
- [ ] Squads multisig created, threshold 2-of-3 minimum
- [ ] Every program's upgrade authority = multisig
- [ ] Every Config PDA's authority = multisig
- [ ] Dev keypair `3E8Z...rqBr` NEVER used for mainnet program operations
- [ ] `treasury-keypair.json` equivalent for mainnet held ONLY in multisig

### On-chain initialization
- [ ] 9 programs deployed to mainnet with locked program IDs
- [ ] Init scripts adapted for mainnet USDC (`EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`)
- [ ] All 9 Configs initialized with fee_bps=0 and multisig authority
- [ ] `update_treasury` run on all 9 programs → multisig-owned USDC ATA
- [ ] Init script assertion: `treasury_owner != authority` (prevents duplicate-mut bug)
- [ ] Issuer for Mladen's licenced entity registered in `rwa_registry`

### Off-chain infrastructure
- [ ] Helius dedicated node provisioned (primary RPC)
- [ ] Fallback RPC configured (Triton or QuickNode)
- [ ] Supabase mainnet project created (or environment column added to devnet project)
- [ ] Edge Functions deployed on mainnet Supabase: `post-chat-message`, `gc-tier-seats`, `charge-due`
- [ ] Migrations 001–012 applied on mainnet Supabase
- [ ] Cranker keypair in `charge-due` env has SOL for fees
- [ ] Vercel production project with mainnet env vars split from preview/devnet

### Frontend
- [ ] All `wallet.sendTransaction` sites migrated to `simulateAndSend` (see 3.7)
- [ ] Devnet banners / mock-USDC references removed from UI
- [ ] Program IDs pulled from env, not hardcoded
- [ ] Error paths tested: wallet reject, insufficient funds, stale state, Supabase outage
- [ ] Analytics + Sentry wired up

### Legal & compliance
- [ ] Legal entity (Mladen's acquired RWA company) operational
- [ ] Licence scope finalized (jurisdictions + asset classes)
- [ ] `rwa_registry` allow-list of jurisdiction codes matches licences
- [ ] Privacy policy + ToS live on nodosol.com
- [ ] US MSB exposure review signed off (self-custody only)
- [ ] Tax/accountant engaged for first-month close

### Ops & monitoring
- [ ] Helius webhooks → Supabase indexer running
- [ ] Dashboard live (Helius or Grafana): tx success rate, CU usage, treasury balance
- [ ] PagerDuty escalation wired to `#nodosol-ops`
- [ ] Runbooks written (section 5.4) and shared
- [ ] Incident response dry-run completed
- [ ] Rollback plan: previous `.so` artefacts uploaded to IPFS + git tags

### Go signal
- [ ] 30-day devnet soak with 0 P0 incidents
- [ ] Phase A success metrics hit (section 4)
- [ ] Foundation network primed for warm intros

## 8. Identified gaps & supplemental pre-deploy checklist

Review pass on 2026-04-26 against current repo state surfaced gaps in
section 7 that need concrete sub-steps before they can be checked off.
Section 7 stays as the high-level Go/No-Go board; this section is the
operational worksheet for the four highest-risk transitions: env-var
split, treasury rotation, Squads mainnet setup, RPC migration.

### 8.0 Drift fixes vs. section 7

- [ ] Update section 7 "Migrations 001–012 applied" to **001–018**
  (project is at `supabase/018_waitlist.sql` as of 2026-04-26)
- [ ] Update section 7 Edge Functions list to **all 7**:
  `post-chat-message`, `issue-chat-jwt`, `gc-tier-seats`, `charge-due`,
  `helius-webhook`, `admin-events`, `waitlist-signup`
- [ ] Section 7 says "9 programs deployed" but 2.1 audit scope only lists
  5 + section 7 says 7 High-priority. Reconcile: 7 High = `subscription`,
  `event_tickets`, `rwa_registry`, `rwa_mint`, `marketplace`, `otc_deals`,
  `auctions`. `tip_jar` = Medium, `events` = deprecate-or-Low. Lock the
  audit scope here.

### 8.1 Env-var split (Vercel preview/devnet vs. production/mainnet)

Today every env var lives in a single Vercel project tied to devnet.
Mainnet flip requires a parallel set with cold values.

- [ ] Create separate Vercel **production** environment scope (or new
  project entirely) — preview/dev keeps devnet, production gets mainnet
- [ ] Audit `web/.env.example` + `web/lib/*` + `scripts/.env.example`
  for every `NEXT_PUBLIC_*` and server-only var; produce
  `docs/MAINNET_ENV.md` table (var | dev value | mainnet value | who sets)
  — tracked as a separate task in `.ralph/progress.md` Bucket D
- [ ] Hard-code-scan: `grep -rn "devnet\|mock-USDC\|Gh9ZwEmdLJ8" web/ scripts/`
  — every hit either becomes env-var-driven or a `process.env.NEXT_PUBLIC_NETWORK`
  guard
- [ ] Mainnet-only vars to provision (non-exhaustive — finalize in MAINNET_ENV.md):
  - `SOLANA_RPC_URL` → Helius mainnet dedicated node URL
  - `NEXT_PUBLIC_APP_URL` → `https://nodosol.com` (drop preview subdomain)
  - `NEXT_PUBLIC_USDC_MINT` → `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`
  - `NEXT_PUBLIC_ADMIN_WALLETS` → mainnet admin wallets (different keypairs
    than devnet, since devnet admin keys may have leaked into demo seeders)
  - 9 program IDs (`NEXT_PUBLIC_*_PROGRAM_ID` or central constants file)
  - `NEXT_PUBLIC_DEMO_*` → unset on mainnet (demo data is devnet-only)
  - Supabase: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
    plus server-side `SUPABASE_SERVICE_ROLE_KEY` and Edge Function secrets
  - Edge Function env: `RPC_URL` (helius-webhook), `JWT_SIGNING_KEY`
    (issue-chat-jwt — rotate, do NOT reuse devnet secret),
    `ADMIN_WALLETS` (admin-events server-side allowlist),
    `HELIUS_WEBHOOK_SECRET` (if/when added)
  - Cranker funding: keypair + min SOL balance for `charge-due`
- [ ] Decide: single Supabase project with `network` column, or fresh
  mainnet Supabase project. Recommend fresh project — cleaner RLS, no
  devnet noise in `security_events`, simpler GDPR posture
- [ ] Scripts (`scripts/`) need `--cluster mainnet-beta` parity check —
  every `clusterApiUrl` / `Connection(...)` constructor reads from env

### 8.2 Treasury rotation ceremony

Section 2.4 + 7 say "treasury keypair held in multisig" but the actual
ceremony is undefined.

- [ ] Generate `treasury-keypair.json` mainnet equivalent on an
  air-gapped machine (live USB, no network); print pubkey, never the
  private key
- [ ] Create the treasury USDC ATA via a one-shot tx signed offline,
  broadcast from an online machine
- [ ] Transfer the treasury keypair file into the Squads multisig as a
  custodied asset (or destroy after ATA is created and rely on the ATA
  owner being a multisig-controlled wallet — preferred, simpler)
- [ ] **Preferred path:** treasury-ATA owner = Squads vault PDA, not a
  raw keypair. Then there is no private key to leak. Confirm
  `update_treasury` accepts a vault PDA on every program (it should —
  it just stores a pubkey)
- [ ] Run init-time assertion: `treasury_owner != upgrade_authority` on
  all 9 programs (lesson from 2026-04-22/23 duplicate-mut bug)
- [ ] Document monthly sweep procedure: multisig proposal →
  vault-to-cold-wallet transfer → on-chain receipt logged in ops journal
- [ ] Define backup: if Squads vault PDA is the owner, no key backup
  needed; if raw keypair, store encrypted shards via Shamir 2-of-3 in
  separate physical locations (not the same as multisig signers)

### 8.3 Squads mainnet setup ceremony

Section 2.2 + 7 say "Squads 2-of-3" but signer identity, threshold
rationale, and rotation policy are undefined.

- [ ] Pick 3 signers and document them (in a private doc, not this repo):
  Mladen primary + 2 trusted parties (recommend: 1 technical co-founder
  candidate, 1 legal/advisor with cold storage). Reasoning: 2-of-3
  survives one lost/compromised key, blocks single-actor compromise
- [ ] Generate 3 fresh hardware-wallet-backed signer keypairs (Ledger
  preferred — derivation path documented per signer)
- [ ] Create Squads vault on mainnet via [v3 UI](https://squads.so);
  capture vault address + multisig PDA
- [ ] Test the multisig flow on mainnet with a $1 USDC transfer BEFORE
  any program upgrade authority is transferred — full propose/approve/execute
  cycle from each signer device
- [ ] Transfer upgrade authority for each of the 9 programs to the vault
  PDA via `solana program set-upgrade-authority` — record tx sig per program
- [ ] Transfer Config PDA `authority` for each program via
  `update_authority` instruction — record tx sig per program
- [ ] Verify `solana program show <PROGRAM_ID>` for all 9 programs
  returns the multisig PDA as upgrade authority
- [ ] Document rotation procedure: how to swap a compromised signer
  (Squads "Settings → Members" requires multisig-approved tx)
- [ ] Test the panic button workflow end-to-end on mainnet: admin panel
  generates `update_pause(true)` payload → paste into Squads → 2 signers
  approve → execute → verify each Config PDA has `paused: true`

### 8.4 RPC migration (devnet defaults → mainnet Helius)

Section 5.1 names Helius but cutover is not sequenced.

- [ ] Provision Helius mainnet dedicated node — confirm
  `getProgramAccounts` is enabled on the plan (required by marketplace
  grid `Listing.all()` until indexer ships)
- [ ] Generate fresh Helius API key for mainnet (do NOT reuse devnet key)
- [ ] Create mainnet Helius webhook pointing at production
  `helius-webhook` Edge Function URL — capture webhook ID + signing
  secret; store secret in mainnet Supabase Edge Function env
- [ ] Configure webhook to watch all 9 mainnet program IDs (the IDs from
  step 8.3 — devnet IDs in section 1 will NOT match)
- [ ] Provision fallback RPC (Triton or QuickNode) — wire health-check
  + auto-fallback in `web/lib/connection.ts` (or wherever Connection is
  constructed); circuit-breaker on consecutive 5xx
- [ ] Audit every default RPC URL in code: `grep -rn "api.devnet.solana.com\|clusterApiUrl" web/ scripts/ supabase/functions/`
  — every default must come from env, with an explicit failure (not a
  silent devnet fall-through) if the env var is unset on production
- [ ] Set `RPC_URL` env on mainnet Supabase Edge Function project
  (`helius-webhook` decoder lookups in `fetchPdaPubkeyAt` default to
  `clusterApiUrl("devnet")` if unset — this MUST be set on mainnet or
  the creator-side enrichment silently breaks)
- [ ] Rate-limit budgeting: estimate sustained `getSignaturesForAddress`
  load from admin volume widget × 9 programs × admin polling cadence;
  confirm Helius plan tier has headroom or add server-side caching

### 8.5 Cutover dress rehearsal

- [ ] Run a full "fake mainnet" rehearsal on devnet using fresh program
  IDs, fresh treasury, fresh Squads test multisig, fresh Vercel
  preview-prod environment — measure how long the actual cutover takes,
  identify missed steps. Section 7 cannot go green until this passes.

---

Maintainer: Mladen · Status: living · Last update: 2026-04-26
