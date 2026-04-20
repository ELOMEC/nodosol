# Nodosol — mainnet deploy plan & pre-launch security review

Snapshot of what needs to be true before any program is deployed to
mainnet-beta, plus the staged rollout we will actually run. Living
document — update as items get resolved.

## 1. Program inventory (devnet → mainnet)

| Program | Devnet ID | Purpose | Audit priority |
| --- | --- | --- | --- |
| `tip_jar` | `C2bM3p1Cco4bDj6gQe29k7UWcepxLCrVgiPPoidh549P` | Creator tips | Medium |
| `subscription` | `8G2hbD1qJUcaVAEdfVxaHfbCgxyEzQdrpjhDMM9pSL4w` | Recurring billing via SPL delegate | **High** (delegate pattern) |
| `events` | `4q4KxCcvY7vswq3tXgr448ghXWBtz4PzNfoddZu282Ax` | Event tickets | Medium |
| `rwa_registry` | `7BCWTrD7rcedAg3zpvtvNdManv39kzr3eHBjWyomCbdT` | Licenced issuer registry | **High** (compliance backbone) |
| `rwa_mint` | `HLCCfvp99Z1Rnix64mC6w6dYL9EkEjVmPCL7rr27evsU` | RWA Token-2022 tokenisation | **High** (fixed supply, cross-program check) |
| `marketplace` | `69ZFM7nHUTXcHp8TZpRtX4qr3ERK2VGxRdqXvNtbfJkZ` | Listings + escrow + fee split | **High** (holds user funds) |
| `otc_deals` | `FmXBAWoSGanaFfP8p9gekgrFn7buEn1XUSFWebDr3Pwz` | Dual-party OTC escrow | **High** (holds user funds) |

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
- Current devnet treasury is the dev wallet's mock-USDC ATA — unsafe
- Mainnet treasury: multisig-owned USDC ATA on a dedicated custody wallet
- Run `update_treasury` on every program as part of init sequence

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

### 2.7 Chat production auth (partial — done for writes)
- Writes: ✅ Edge Function with ed25519 verification (shipped)
- Reads: currently open. Decide if chat bodies need to be private.
  If yes, RLS-by-pubkey + session JWT from Sign-In With Solana.

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

---

Maintainer: Mladen · Status: living · Last update: 2026-04-20
