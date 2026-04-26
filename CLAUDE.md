# CLAUDE.md — Nodosol project conventions

This file is loaded by Claude Code (interactive + headless) at session start.
Keep concise.

## Stack snapshot

- **On-chain**: 9 Anchor 1.0.1 programs, Solana 3.1.13, Token-2022, Bubblegum cNFTs
- **Web**: Next.js 15 App Router, React 19, TypeScript 5.7, deployed to Vercel
- **Backend**: Supabase Cloud (Postgres 15 + Storage + Realtime + Edge Functions)
- **RPC**: Helius (devnet), enhanced-tx webhooks → `helius-webhook` Edge Function
- **Auth**: wallet-signed challenge → JWT (`issue-chat-jwt`), HS256
- **Multisig**: Squads 2-of-3 holds upgrade authority on devnet

Programs: `tip_jar`, `subscription`, `events`, `event_tickets`, `marketplace`,
`otc_deals`, `rwa_registry`, `rwa_mint`, `auctions`. All in `programs/`.

Detailed architecture: `docs/ARCHITECTURE.md`.
Version pinning rationale: `docs/VERSION_MATRIX.md`.

## Code style

### Anchor / Rust
- Account naming: snake_case fields in `#[derive(Accounts)]`. Program structs PascalCase.
- IX handlers in `programs/<name>/src/instructions/<ix>.rs`. Re-exported from `instructions.rs`.
- Errors: `#[error_code]` enum per program (e.g. `SubscriptionError`). Use `require!` for guards.
- PDA seeds: literal byte slices via `*_SEED` constants in `constants.rs`. Never inline.
- Token ops: prefer `token_interface::transfer_checked` (Token-2022 compat).
- Heavy accounts: `Box<Account<...>>` for stack-overflow avoidance.
- Embed `solana_security_txt!` in every new program.
- Tests in `programs/<name>/tests/test_*.rs` using LiteSVM. Common helpers in `tests/common/mod.rs`.

### TypeScript / Next.js
- Strict mode required. Type guards for `program.account.<X>.fetch()` returns.
- `useCallback`/`useMemo` for any function passed to `useEffect` deps.
- Inline styles via `React.CSSProperties` (no Tailwind in this project).
- Dark theme: `var(--shell-*)` CSS vars (defined in globals.css).
- Solana tx: `simulateAndSend` helper (`web/lib/tx.ts`) — never raw `sendTransaction`.

### Supabase
- New tables ship with RLS on. `auth.jwt()->>'sub' = wallet_pubkey` pattern.
- Migrations numbered `NNN_<topic>.sql` in `supabase/`.
- Edge Functions in `supabase/functions/<name>/index.ts` (Deno).

## Verification commands

| Stack | Command |
|---|---|
| Anchor program build | `cargo check -p <program>` |
| Anchor program tests | `cargo test -p <program>` |
| Anchor SBF binary | `cargo build-sbf --manifest-path programs/<program>/Cargo.toml` |
| Web typecheck | `cd web && ./node_modules/.bin/tsc --noEmit` |
| Web lint | `cd web && npm run lint` |
| Scripts typecheck | `cd scripts && ./node_modules/.bin/tsc --noEmit` |

After modifying Rust state/IXes: rebuild SBF + regen IDL via
`cd programs/<name> && anchor idl build > /tmp/idl.json` and copy to
`target/idl/<name>.json` + `web/idl/<name>.json`.

## Memory / docs

- `docs/STATE_AUDIT.md` — frontend feature reality check (always grep before "let's build X")
- `docs/AUDIT_OUTREACH.md` — auditor scope + email drafts
- `docs/SECURITY_RUNBOOK.md` — JWT rotate, Squads ops, panic procedure
- `docs/NOTIFICATIONS_SETUP.md` — Helius webhook deploy
- `docs/mainnet-deploy-plan.md` — staged migration plan

---

# Ralph Loop — autonomni rad

Ovaj projekat ima ralph loop u `.ralph/`. Kada se pokreneš preko `ralph.sh -p`, prati ova pravila.

## Šta čitaš na početku
1. `.ralph/feature-spec.md` — high-level šta gradimo
2. `.ralph/progress.md` — trenutni task list
3. Ovaj `CLAUDE.md` — konvencije

## Šta radiš
- Uzmi PRVI `- [ ]` task iz `progress.md`. Ne biraj, ne preskači.
- Implementiraj ga celinski. Ako je preveliki, prvo razdeli u sub-taskove i to commit-uj kao prvu iteraciju (`ralph: split task — <razlog>`).
- Verifikuj prema komandi za stack iz tabele iznad.
- Bez testa: bar smoke check (compile/lint/typecheck) i napomeni šta si verifikovao.

## Šta commit-uješ
- Sve promene + `.ralph/progress.md` u JEDNOM commit-u (atomic state).
- Poruka commit-a UVEK počinje sa `ralph: ` (mali r, dvotačka).
  - `ralph: implement subscription expire ix`
  - `ralph: blocked - missing oracle account schema`
  - `ralph: split task - <task title> too large`

## Granice
- NE pravi nove grane. Već si na `auto/ralph-*`.
- NE push-uješ na remote. Mladen review-uje pa merguje.
- NE diraj druge taskove osim onog na kome radiš.
- NE menjaj `.ralph/feature-spec.md` osim ako task eksplicitno traži ažuriranje specifikacije.
- Ako task nije jasan ili zavisi od necega što ne postoji → mark `[BLOCKED]` sa konkretnim razlogom (file refs, error excerpt). NE pogađaj.
- Ne zaboravi: `--dangerously-skip-permissions` je ON u ralph mod-u, ali destruktivne git operacije (force push, branch -D, reset --hard na main) i dalje su zabranjene.
