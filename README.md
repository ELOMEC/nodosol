# Nodosol

Creator economy on Solana — tip jars, subscriptions, and event tickets wired through Token-2022 with a confidential-ready architecture.

**Domain**: [nodosol.com](https://nodosol.com)

## What

Patreon + Ticketmaster alternative for creators, built on Solana. 1% fee vs Patreon 15%. Instant settlement in USDC. Self-custody wallets, on-chain revenue, Blinks-first UX.

## Architecture

Monorepo:

```
nodosol/
├── programs/
│   ├── tip_jar/         Anchor program: creator profiles + USDC tips
│   ├── subscription/    Anchor program: recurring creator billing
│   └── events/          Anchor program: paid/free tickets + check-in
├── web/                 Next.js app + Solana Actions (Blink) endpoints
└── scripts/             Devnet init + demo seeding
```

## On-chain programs

All three programs share a Token-2022 architecture via `anchor-spl::token_interface`, so the same code path supports SPL Token and Token-2022 and leaves room to activate Confidential Transfers (V2) without data migrations.

| Program        | Program ID                                       | Instructions                                                         |
| -------------- | ------------------------------------------------ | -------------------------------------------------------------------- |
| `tip_jar`      | `C2bM3p1Cco4bDj6gQe29k7UWcepxLCrVgiPPoidh549P`   | `initialize_creator`, `send_tip`, `withdraw`, `update_elgamal_pubkey` |
| `subscription` | `8G2hbD1qJUcaVAEdfVxaHfbCgxyEzQdrpjhDMM9pSL4w`   | `create_plan`, `subscribe`, `cancel`, `charge`                        |
| `events`       | `4q4KxCcvY7vswq3tXgr448ghXWBtz4PzNfoddZu282Ax`   | `create_event`, `buy_ticket`, `check_in`, `withdraw_revenue`          |

### Design notes

- **Vaults are program-owned.** Each creator/plan/event has its own Token-2022 vault whose authority is the program PDA, so funds only move via program instructions.
- **Recurring billing uses SPL delegate.** `subscribe(approve_amount)` approves the plan PDA as delegate on the subscriber's ATA. `charge` is permissionless; anyone may pay the tx fee to advance a due billing cycle, but only the plan PDA can actually pull tokens.
- **`elgamal_pubkey: [u8; 32]`** is zeroed on creator profile creation and mutable via `update_elgamal_pubkey`. This reserves the slot for V2 Confidential Transfers with no state migration.
- **Checked math on every counter**, `has_one` constraints tie each child to its parent's `mint` and `vault`, and `Box<Account>` everywhere that would otherwise blow the 4 KiB BPF stack frame.

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

```bash
anchor build
cargo test --manifest-path programs/tip_jar/Cargo.toml
cargo test --manifest-path programs/subscription/Cargo.toml
cargo test --manifest-path programs/events/Cargo.toml
```

52 integration tests pass across the three programs (LiteSVM + Token-2022).

### Run the web app

```bash
cd web
npm install
cp .env.example .env
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

The three programs are deployed to Solana devnet with seeded demo data.

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
