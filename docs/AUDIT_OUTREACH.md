# Audit Outreach — Nodosol

Cilj: 4-8 sedmica wait list, treba krenuti odmah. Send-out plan: 3 firme paralelno (OtterSec, Neodyme, Zellic), pa Sec3/Halborn kao fallback.

## Project one-pager (paste-ready u prvi mail)

**Nodosol** is a Solana-based vertical app suite covering creator economy
(tipping, subscriptions, ticketed events) and tokenized real-world assets
(RWA registry, tokenization, marketplace, OTC deals, sealed-bid auctions).

- **Domain**: nodosol.com (production), rights.nodosol.com (B2B rights MVP)
- **Stage**: 9 Anchor programs deployed to devnet, full web app live, security
  pass shipped (security.txt + global_pause kill-switch + Squads 2-of-3 multisig
  upgrade authority)
- **Funding**: pre-seed, targeting Series Seed Q3 2026. Audit is a pre-fundraise
  signal + pre-mainnet hard requirement.
- **Team**: 1 founder (full-stack), 1 AI pair-programming assistant, recruiting
  Solana Rust co-founder via Solana Foundation network

### Audit scope (9 Anchor programs, ~10.7k LoC Rust)

| Program | LoC | Ix | Purpose |
|---|---|---|---|
| `event_tickets` | 3336 | 22 | Seated ticketing, cNFT tickets, atomic resale, royalty split, private-price commit/reveal, permissionless expiry reclaim |
| `subscription` | 1295 | 12 | SPL delegate-based recurring payments, permissionless charge crank |
| `auctions` | 1244 | 9 | Sealed-bid commit/reveal, USDC escrow, fee split, permissionless settle |
| `events` | 1061 | 11 | Legacy event/ticket primitive (V1) |
| `otc_deals` | 995 | 9 | Dual-party USDC escrow, propose/accept/cancel/expire, memo hash chat reference |
| `marketplace` | 894 | 9 | RWA listings, escrow buy, listing PDA |
| `tip_jar` | 841 | 10 | Creator tips, full lifecycle |
| `rwa_registry` | 567 | 6 | Issuer registry, asset class bitmap, jurisdictions, status state machine |
| `rwa_mint` | 515 | 4 | Token-2022 fixed-supply tokenization, cross-program issuer verification |
| **Total** | **~10,748** | **92** | |

### Tech stack
- Anchor 1.0.1 (latest), Solana 3.1.13
- Token-2022 with confidential transfer mint deployed (CT off-chain interactions
  pending Anza JS SDK / Arcium June 2026)
- Bubblegum cNFTs for transferable tickets
- Cross-program invocation patterns: rwa_registry ↔ rwa_mint, marketplace/otc/auctions ↔ token vaults
- Shared Config PDA pattern across 7 programs (fee_bps, treasury, pause, authority)
- LiteSVM test suite: 110+ passing tests

### Key risk surfaces (auditor-relevant)
- Permissionless cranks: `charge` (subscription), `settle_auction`, `close_expired_resale`
- Escrow/withdraw flows: 6 programs hold user funds in vault PDAs
- Cross-program issuer verification (rwa_mint reads rwa_registry IssuerStatus)
- keccak256 commit/reveal in private-price resale + sealed bids
- Bubblegum CPI hand-serialized (no mpl-bubblegum dep) — discriminator hardcoded
- Token-2022 transfer hooks not used yet, but ATA derivation must handle both classic + Token-2022

### Repo access
Private GitHub repo, read access provisioned on engagement signing. Public commit
log + on-chain program IDs available pre-engagement for scoping pass.

### What we need from you
1. Availability window (Q2/Q3 2026)
2. Quote (LoC + complexity-based or fixed-scope)
3. Format: full report + remediation review
4. Engagement length estimate

Happy to schedule a 30-min scoping call.

---

## Email — OtterSec (contact@osec.io)

**Subject**: Audit inquiry — Nodosol (9 Anchor programs, ~10.7k LoC Rust, devnet → mainnet)

Hi OtterSec team,

I'm Mladen, founder of Nodosol — a Solana app suite covering creator economy
(tipping, subscriptions, ticketed events) and tokenized real-world assets
(RWA registry, tokenization, marketplace, OTC, sealed-bid auctions). 9 Anchor
programs deployed to devnet, ~10.7k LoC Rust, 92 instructions, security pass
shipped (security.txt + global_pause + Squads 2-of-3 multisig upgrade authority).

We're targeting Series Seed Q3 2026 and a mainnet deployment after audit.
Looking to lock an audit slot now given typical 4-8 week wait windows.

Scope summary:
- event_tickets (3336 LoC) — seated ticketing, cNFT resale, private-price commit/reveal
- subscription (1295) — SPL delegate recurring payments, permissionless cranks
- auctions (1244) — sealed-bid commit/reveal, USDC escrow
- otc_deals (995), marketplace (894), tip_jar (841), events (1061)
- rwa_registry (567) + rwa_mint (515) — cross-program issuer verification

Could we set up a 30-min scoping call? Happy to share the private repo for a
preliminary read. Public commit log + on-chain IDs ready for pre-engagement
scoping.

Best,
Mladen Rakić
Nodosol — nodosol.com
mladentb@gmail.com

---

## Email — Neodyme (audits@neodyme.io)

**Subject**: Audit inquiry — Nodosol Solana app suite (9 Anchor programs)

Hi Neodyme team,

I'm Mladen, founder of Nodosol (nodosol.com). We've shipped 9 Anchor programs
to devnet covering two verticals: creator economy (tipping, subscriptions,
ticketing with seated venues + cNFT resale) and RWA (registry, tokenization,
marketplace, OTC, sealed-bid auctions). ~10.7k LoC Rust, 92 instructions,
110+ LiteSVM tests passing.

Security baseline already in place: solana_security_txt across all 9 programs,
admin pause kill-switch on 7 fund-moving programs, Squads 2-of-3 multisig
holding upgrade authority on devnet. Mainnet deploy pending audit.

We're closing a Series Seed Q3 2026 and want an audit slot booked. Areas I'd
flag for you upfront:
- Permissionless cranks (charge, settle_auction, close_expired_resale)
- Hand-serialized Bubblegum CPI for cNFT ticket transfers
- Cross-program issuer verification (rwa_mint reads rwa_registry state)
- keccak256 commit/reveal patterns in private-price resale + sealed bids
- Token-2022 vault patterns across 6 programs

Would love to get on your radar for Q2/Q3 2026 availability. Can share the
private repo for scoping.

Thanks,
Mladen Rakić
mladentb@gmail.com

---

## Email — Zellic (hello@zellic.io)

**Subject**: Solana audit inquiry — Nodosol (9 Anchor programs, RWA + ticketing)

Hi Zellic team,

Reaching out about a Solana audit engagement for Nodosol (nodosol.com).

We're a vertical Solana app suite — creator economy + RWA marketplace —
with 9 Anchor programs live on devnet, ~10.7k LoC Rust, 92 instructions.
Security pass shipped (security.txt, global_pause kill-switch on fund-moving
ix, Squads multisig upgrade authority).

Stage: pre-seed, targeting Series Seed Q3 2026. Audit is a pre-mainnet
requirement and a fundraise signal. Looking to book a slot given typical
4-8 week lead times.

Highlights for scoping:
- event_tickets (3336 LoC) is the largest surface — seated ticketing,
  Bubblegum cNFT resale, atomic OTC swap, royalty split, private-price
  commit/reveal, permissionless expiry reclaim
- 7 of 9 programs share a Config PDA pattern (fee_bps, treasury, pause,
  authority) — auditing the pattern once covers most fund flows
- Cross-program flow: rwa_mint verifies rwa_registry IssuerStatus before
  tokenization
- Token-2022 vaults across all fund-holding programs (CT mint deployed,
  full CT integration deferred to Arcium Jun 2026)

Open to a scoping call. Can share repo on engagement signing; public commit
log + on-chain IDs available now for preliminary read.

Best,
Mladen Rakić
Nodosol
mladentb@gmail.com

---

## Tracking

| Firm | Contact | Sent | Reply | Quote | Slot offered | Status |
|---|---|---|---|---|---|---|
| OtterSec | contact@osec.io | | | | | pending send |
| Neodyme | audits@neodyme.io | | | | | pending send |
| Zellic | hello@zellic.io | | | | | pending send |
| Sec3 (fallback) | hello@sec3.dev | | | | | hold |
| Halborn (fallback) | sales@halborn.com | | | | | hold |

## Pre-send checklist

- [ ] Confirm program IDs in one-pager match latest devnet deployment (after Squads redeploy)
- [ ] Confirm LoC numbers (after most recent commits)
- [ ] Set up audit@nodosol.com forwarding (or use security@nodosol.com if MX done)
- [ ] Decide which firm gets first reply window — OtterSec has best Solana track record (Jupiter, Marinade), Neodyme is rigorous on token mechanics, Zellic strong on cross-program flows
- [ ] Have repo invite ready (private GitHub `ELOMEC/nodosol`) for first responder

## After send

- Track replies in this file
- If no reply in 1 week, follow up once
- Compare quotes on: total cost, lead time to start, days of effort, remediation review included, fix-then-publish vs publish-with-known-issues policy
