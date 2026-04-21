# Nodosol

Creator economy on Solana — tip jars, subscriptions, and event tickets wired through Token-2022 with a confidential-ready architecture.

**Domain**: [nodosol.com](https://nodosol.com)

## What

Patreon + Ticketmaster alternative for creators, built on Solana. 1% fee vs Patreon 15%. Instant settlement in USDC. Self-custody wallets, on-chain revenue, Blinks-first UX.

## Architecture

Monorepo:

```
nodosol/
├── programs/          # Anchor on-chain programs (see table below)
├── web/               # Next.js app + Solana Actions (Blink) endpoints
├── mobile/            # Expo + React Navigation (companion / deep-link UX; no on-chain wallet stack)
├── scripts/           # Devnet init + demo seeding
└── docs/              # e.g. mainnet deploy & security checklist
```

## On-chain programs

Programs use Token-2022 via `anchor-spl::token_interface` where they move value, so the same code paths support SPL Token and Token-2022 and leave room to activate Confidential Transfers (V2) without data migrations where schemas already reserve fields (for example ElGamal pubkey slots on creator flows).

Program IDs (localnet / devnet from [Anchor.toml](Anchor.toml); refresh after deploy):

| Program | Program ID | Role |
| --- | --- | --- |
| `tip_jar` | `C2bM3p1Cco4bDj6gQe29k7UWcepxLCrVgiPPoidh549P` | Config + creator profiles, USDC tips, withdraw, ElGamal pubkey slot |
| `subscription` | `8G2hbD1qJUcaVAEdfVxaHfbCgxyEzQdrpjhDMM9pSL4w` | Recurring plans, delegate-based `charge`, plan lifecycle |
| `events` | `4q4KxCcvY7vswq3tXgr448ghXWBtz4PzNfoddZu282Ax` | Paid/free events, tickets, check-in, revenue withdraw |
| `event_tickets` | `FDUwvXRETURbe2JN2PJNCKt6RPAsSLeSi7A4pFMGmtrE` | Merkle-tree tickets, tiers, resale (public/private) |
| `rwa_registry` | `7BCWTrD7rcedAg3zpvtvNdManv39kzr3eHBjWyomCbdT` | Issuer registry and compliance-oriented metadata |
| `rwa_mint` | `HLCCfvp99Z1Rnix64mC6w6dYL9EkEjVmPCL7rr27evsU` | Token-2022 RWA asset mint + lifecycle |
| `marketplace` | `69ZFM7nHUTXcHp8TZpRtX4qr3ERK2VGxRdqXvNtbfJkZ` | Listings, escrow vault, fee split buys |
| `otc_deals` | `FmXBAWoSGanaFfP8p9gekgrFn7buEn1XUSFWebDr3Pwz` | Two-party OTC escrow |
| `auctions` | `6c95kxTWCXacsAev4xnvNbKnLYWFGPpJT5zwT4SnWh5v` | Sealed-bid USDC auctions (commit / reveal / settle / refund) |

Instruction-level detail and mainnet rollout notes: [docs/mainnet-deploy-plan.md](docs/mainnet-deploy-plan.md).

### Design notes

- **Vaults are program-owned.** Each creator/plan/event (and marketplace listing, auction, etc.) uses PDAs whose token authority is the program, so funds move only through program instructions.
- **Recurring billing uses SPL delegate.** `subscribe(approve_amount)` approves the plan PDA as delegate on the subscriber's ATA. `charge` is permissionless for the payer of fees, but only the plan PDA can pull tokens.
- **Checked math on counters**, `has_one` / seed constraints where applicable, and `Box<Account>` on large structs to stay within BPF stack limits.

### Anchor client (TypeScript) vs on-chain Anchor

Programs are built with **Anchor 1.0** (`anchor-lang` / `anchor-spl` 1.0). The `web` app uses **`@coral-xyz/anchor` ~0.31** against checked-in IDLs under `web/idl/`. Regenerate IDLs with `anchor build` after program changes and keep versions aligned per [Anchor release notes](https://github.com/coral-xyz/anchor).

## Blink endpoints

The `web` package exposes Solana Actions that any Blink-aware wallet (Phantom, Backpack, dial.to) can render from a URL.

```
GET /api/actions/tip/<creator>
POST /api/actions/tip/<creator>?amount=<N>

GET /api/actions/subscribe/<creator>/<plan_id>
POST /api/actions/subscribe/<creator>/<plan_id>

GET /api/actions/ticket/<creator>/<event_id>
POST /api/actions/ticket/<creator>/<event_id>
```

Each POST returns a serialized transaction built with the deployed IDL. The endpoint never signs — the wallet that opened the Blink signs and submits.

## Quick start

### Prerequisites

- Rust 1.95+, Solana CLI 3.1+, Anchor 1.0+
- Node 22+, npm 10+

### Build + test the programs

`anchor build` produces `target/deploy/*.so` used by the LiteSVM integration tests.

```bash
anchor build
cargo test
```

From the workspace root, `cargo test` runs integration tests in each `programs/<crate>/tests/` directory (LiteSVM + Token-2022). Run `cargo test 2>&1 | grep 'test result: ok'` to confirm all crates pass; the integration test count is printed per file under `running N tests`.

### Run the web app

```bash
cd web
npm install
cp .env.example .env
# Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY if you use uploads / realtime.
npm run dev
# → http://localhost:3000
```

### Deploy to devnet

```bash
solana config set --url devnet
solana airdrop 5                  # or https://faucet.solana.com/

anchor build                       # regenerate .so + IDL
anchor deploy --provider.cluster devnet

cd scripts
npm install
npm run init-demo                  # mints test USDC + seeds one profile/plan/event
```

`init-demo` writes `scripts/devnet-state.json` with every address and a ready-to-paste Blink URL table.

## Test a Blink

After `init-demo`, take the creator wallet address and paste a URL like:

```
https://dial.to/?action=solana-action:https://<your-app>/api/actions/tip/<creator>
```

into a browser. Phantom / dial.to will render the Action, and clicking "Tip $5" signs + submits the transaction the endpoint returned.

## Devnet demo (live)

The creator-facing programs used by the demo are deployed to Solana devnet with seeded demo data.

- Creator wallet: `3E8ZZJBkz82RmLSSmMZJBGuwrtkJDoCsX5UZVj26rqBr`
- Mock USDC mint: `73w3ocXSe2yDMWTHj1kwQxrbNjUY9tBJP9HYDkcpmh7h` (6 decimals, Token-2022)
- Subscription plan id: `1` — $5 USDC / month, 12 cycles pre-approved on subscribe
- Event id: `1` — $10 USDC, 100-ticket capacity, 30-day window

After `cd web && npm run dev`, the landing page at `http://localhost:3000` renders live Blink URLs with `Open in dial.to` buttons. Drop any of these into a Blink-aware wallet or a tweet:

```
http://localhost:3000/api/actions/tip/3E8ZZJBkz82RmLSSmMZJBGuwrtkJDoCsX5UZVj26rqBr
http://localhost:3000/api/actions/subscribe/3E8ZZJBkz82RmLSSmMZJBGuwrtkJDoCsX5UZVj26rqBr/1
http://localhost:3000/api/actions/ticket/3E8ZZJBkz82RmLSSmMZJBGuwrtkJDoCsX5UZVj26rqBr/1
```

Deploy the `web/` package to any host (Vercel, Railway, Fly) and update `NEXT_PUBLIC_APP_URL` for a public shareable demo.

## Privacy roadmap

- **V1 (now)**: Standard Token-2022 USDC. Account schemas reserve ElGamal pubkey fields.
- **V2 (when unblocked)**: Activate Token-2022 Confidential Transfers once the ZK ElGamal Proof Program is re-enabled on mainnet (disabled since June 2025 pending security audit).

## Status

Devnet live, investor demo MVP (April 2026).
