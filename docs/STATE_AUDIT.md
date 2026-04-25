# State Audit — 2026-04-26

Memorija je značajno zaostala za realnim stanjem repoa. Ovaj dokument je
ground-truth pregled svake stavke iz "next session backlog"-a sa stvarnom
provjerom u kodu. Sve "DONE" stavke verifikovane su grep-om / wc-om / čitanjem
relevantnog fajla.

## Tabela ground-truth

| Memory item | Memory tvrdi | Realno (2026-04-26) | Akcija |
|---|---|---|---|
| `/marketplace/assets/[mint]` detail | 404 | **Postoji**, 1694 LoC, kompletan | Linkovi sa My Assets + Portfolio dodati ✅ |
| Marketplace filtering (RWA) | Ne radi | **Radi** — category, jurisdiction, delivery, sort, search | — |
| Marketplace filtering (events/auctions/rentals/properties/resale) | (memory ne pominje) | **Nedostaje** u svih 5 view-a | Pravi gap, prioritetno |
| Update listing price UI | Nema dugmeta | **Postoji** modal (`setEditPrice` u AssetsView line 736) | — |
| Demo data seeder | Treba napraviti | `scripts/seed-demo-data.ts` 890 LoC + `seed-demo-plans.ts` + `seed-event-tiers.ts` | Provjeriti idempotency + sadržaj |
| Globalna pretraga | Nema | **Postoji** `/search` 607 LoC | — |
| Onboarding flow | Treba napraviti | `/welcome` 587 LoC sa role picker, step state, localStorage flag | Provjeriti UX + complete-ness |
| Notifications bell | Nema | **Postoji** `NotificationsBell.tsx` 317 LoC, polluje program signatures | Polling umjesto push, nema email |
| Chat | (postoji za OTC) | `/chat` 186 LoC + Supabase backend | — |
| Creator public profile `/c/[handle]` | Nema | **Stvarno nedostaje** — `CreatorProfile` on-chain ima samo accounting (no name/bio/avatar) | Pravi gap |
| Subscription `expire` ix | Nedostaje | **Stvarno nedostaje** — programs/subscription/src/instructions/ nema expire.rs | Pravi gap |
| Compressed NFT tickets | DONE u v0.6 | Verifikovano — buy_ticket + buy_tier_ticket + buy_ticket_resale[_private] svi imaju Bubblegum CPI | — |
| Privy mobile integration | Scaffold, nema integracije | Verifikovano — 0 referenci na "privy" u `mobile/src` | Pravi gap |
| Mainnet deploy plan | Nema | **Postoji** `docs/mainnet-deploy-plan.md` 14.7 KB | Treba čitati i izvršiti |
| Email integracija | (nije pominjano) | **Nedostaje** — 0 referenci na resend/sendgrid/postmark/smtp | Gap za notifikacije |
| Helius webhooks | (nije pominjano) | **Nedostaje** | Gap za push notifikacije |

## Šta je ZAISTA otvoreno (nakon audita)

### A. Marketplace filtering — 5 viewova bez filtera (Task #2 pravi gap)
- `/marketplace/events` — bez date/price/location filtera
- `/marketplace/auctions` — bez phase/price/category
- `/marketplace/rentals` — bez price/location/duration
- `/marketplace/properties` — unified browse, najveći gap
- `/marketplace/resale` — bez seat/price/event filtera

**RWA marketplace ima referentni filter UI** (MarketplaceView.tsx FilterBar). Mogu se pattern-i reuse-ovati.

### B. Creator public profile (Task #6)
On-chain `CreatorProfile` (programs/tip_jar/src/state.rs) je čisto accounting:
```rust
pub owner, mint, vault, elgamal_pubkey, total_tips_amount,
    total_tip_count, total_withdrawn_amount, created_at, bump, ...
```
Nema username/bio/avatar. Plan:
- Supabase tabela `creator_profiles` (wallet_pubkey PK, handle UNIQUE, display_name, bio, avatar_url, links JSONB)
- `/c/[handle]` → resolve → fetch on-chain stats + show off-chain meta
- Reserved handles list (admin, root, api, c, marketplace, etc)
- Wallet-signature claim na `handle` (slično kao chat JWT challenge)

### C. Notifikacije — postoji bell, nedostaje push (Task #5)
`NotificationsBell` polluje `getSignaturesForAddress` po programu. Limitations:
- Nije personalized (vidiš sve signature, ne svoje)
- Nema email
- Nema push (wallet-targeted)
- Nema event decoding (ne znaš da li je tip primljen ili poslan)

**Pravi notifications system zahtijeva**:
- Helius webhook → Supabase Edge Function → decode event → upsert `notifications` row tagged sa wallet
- `/api/notifications` endpoint sa wallet-sig auth
- Resend (ili Postmark) za email
- In-app feed čita iz Supabase, ne više polluje RPC

### D. Subscription `expire` instrukcija
Memorija pominje "expire ix kad delegate fail" — nije implementirana. `programs/subscription/src/instructions/` ima 12 ix-a, nema `expire`. Use case: kad subscriber više nema USDC u walletu i delegate charge fail-a, plan revenue stuck. Permissionless `expire` ix bi cancel-ovao delegate i transition-ovao Subscription.status u Expired.

### E. Mobile (Expo) Privy integracija
`mobile/src` nema nijednu privy referencu. Memorija kaže "scaffold-ovan ali nije integriran" — verifikovano. Mobile je trenutno deep-link wrapper oko Blink-ova, ništa više.

## Aktualizovani next-up plan

Prioritet (po VC impact / effort ratio):

1. **Marketplace filtering za properties + events + auctions** (~1 dan) — najveći vidljivi gap, replicira postojeći RWA pattern
2. **Creator public profile `/c/[handle]`** (~2-3 dana) — share-able links + organic growth signal
3. **Real notifications stack** (~3-4 dana) — Helius webhook + Supabase + Resend; ovo je production-grade signal
4. **Demo seeder dovršen** (~2h) — provjeriti scripts/seed-demo-data.ts content, dopuniti ako treba (auctions, OTC, sealed bids)
5. **Subscription `expire` ix** (~3h) — mali backend posao, čisti UX rupu

Skinuto sa liste (već done):
- Asset detail page
- RWA marketplace filtering
- Update listing price UI
- Globalna pretraga
- Onboarding /welcome (treba provjeriti UX, ne build)
- cNFT tickets

## Memory updates needed

- Skinuti "Asset detail page 404" iz next session backlog-a
- Skinuti "Marketplace filtering" iz backlog-a (RWA done)
- Skinuti "Update listing price UI" iz backlog-a
- Dodati real gaps: filtering za 5 ostalih viewova, public creator profile, real notifications, subscription expire
- Naglasiti da memorija o frontend state-u brzo zastareva — uvijek verifikovati sa wc/grep prije rada
