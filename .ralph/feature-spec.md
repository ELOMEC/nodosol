# Nodosol — Feature Spec

> Šta gradimo. Ralph čita ovo + CLAUDE.md prije svake iteracije.
> Drži high-level. Detalji idu u progress.md kao taskovi.

## Cilj

Nodosol je vertikalni Solana super-app sa dvije vertikale:
1. **Creator economy** — tipping, subscriptions, ticketed events
2. **RWA marketplace** — issuer registry, tokenization, marketplace, OTC, sealed-bid auctions

Projekat ima 9 deployovanih Anchor programa na devnet-u, kompletan web UI,
security pass (Squads multisig + global pause kill-switch), notifications
pipeline (Helius webhook → Supabase realtime). Cilj: pre-Series-Seed
polish + mainnet readiness + audit close.

## Trenutni fokus (2026-04-26)

Operativna stabilizacija + minor feature gaps:
- Admin panel (ops dashboard + panic button)
- Email waitlist na landing-u za fundraise traction signal
- Per-program decoderi sa creator-side enrichment (RPC fetch CreatorProfile)
- Marketing landing polish na preview.nodosol.com
- Mainnet deploy plan execution (staged, čeka audit)

Veće stvari koje SU otvorene ali nisu prioritet sad:
- rights.nodosol.com Task 6 + 7 (rights_registry program + rights-gateway Edge Fn)
- Mobile (Expo) Privy integracija
- Cross-platform resale integracije (Eventbrite, Airbnb, Tensor)
- Confidential Transfers via Arcium (čeka Jun 2026)

## Acceptance criteria — high level

- Sve nove on-chain instrukcije imaju LiteSVM testove + svi postojeći prolaze
- Sve nove web rute prolaze `tsc --noEmit` u `web/`
- Sve nove Supabase migracije imaju jasne RLS policy-je (default DENY za authenticated, gate by `auth.jwt()->>'sub'`)
- Edge Functions logguju u `security_events` tabelu na auth fail / rate limit / verify fail
- Ne push-uje se na main bez Mladen-ovog merge-a sa auto/ralph-* grane

## Out of scope za sad

- Mainnet program deploy (čeka audit)
- ZK ElGamal / Confidential Transfers (čeka Anza re-enable + Arcium Jun 2026)
- web3.js v2 / @solana/kit migracija (čeka Anchor #3243)
- Multi-region storage / CDN
- Custom Solana RPC node (Helius je good enough)

## Kontekst — odakle ralph može učiti

- `CLAUDE.md` u repo root — konvencije i stack
- `docs/ARCHITECTURE.md` — full architecture overview
- `docs/STATE_AUDIT.md` — koje su stvari STVARNO otvorene (memory može da zaostaje)
- `docs/VERSION_MATRIX.md` — version pinning rationale
- `docs/AUDIT_OUTREACH.md` — auditor scope
- `docs/NOTIFICATIONS_SETUP.md` — Helius pipeline status
- `docs/mainnet-deploy-plan.md` — staged migration
- `programs/<name>/src/lib.rs` + `instructions/*.rs` — on-chain reference
- `web/lib/*.ts` — TS client patterns (PDA derivation, IDL types, sendTx)
- `supabase/*.sql` + `supabase/functions/*` — backend patterns

## Reference: trenutno stanje (snapshot)

- 9 programa devnet-deployed, ~10.7k LoC Rust, 27 LiteSVM test fajlova
- 17 Supabase migracija primijenjene (do 015 sigurno; 016/017 čekaju da Mladen apply-uje)
- 5 Edge Functions: post-chat-message, issue-chat-jwt, gc-tier-seats, charge-due, helius-webhook
- Web rute: /marketplace + 5 verticals + /creator + /c/[handle] + /welcome + /pitch + /tech + /stats
- Demo seederi: seed-demo-data, seed-demo-plans, seed-demo-rentals, seed-demo-auctions, seed-event-tiers
