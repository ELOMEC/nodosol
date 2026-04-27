# Creator guide

Everything you need to start collecting USDC tips, recurring
subscriptions, and ticket revenue on Nodosol. Each section ends with
the on-chain account or off-chain table that backs the action so you
can verify state directly.

> Image refs are placeholders (`![alt](creator-handle.png)`). Drop
> screenshots into `docs/img/` with matching filenames before
> publishing this guide externally.

## Prerequisites

- A Solana wallet — Phantom, Backpack, or Privy email login (creates
  an embedded wallet under the hood).
- ~0.05 SOL for transaction fees. Devnet faucet on `/welcome`
  drops free SOL + mock USDC; mainnet needs a real on-ramp.
- Read access to the **Tip jar** dashboard (`/creator/tips`) — no
  approval needed; opens for any connected wallet.

## 1. Claim your handle

Your handle is the public URL `nodosol.com/c/<handle>` that fans tip,
subscribe, and buy tickets through.

1. Connect your wallet on the landing page (top-right).
2. Open **Creator → Public profile** (`/creator/profile`).
3. Enter a handle (2–31 chars: lowercase letters, digits, `-`, `_`).
4. Live availability check confirms it before you save.
5. Optional: display name, bio, avatar URL, banner URL, social links
   (Twitter, website, Discord, Telegram).
6. Click **Save** — your wallet signs the auth challenge once and
   the row writes to Supabase under your wallet pubkey.

![Profile claim form](creator-claim-handle.png)

**State**: `creator_profiles` table (Supabase), gated by
`auth.jwt()->>'sub' = wallet_pubkey` RLS. Public reads at
`/c/<handle>`.

## 2. Initialise your tip jar

The tip jar is an on-chain Token-2022 vault that receives USDC tips.

1. Open **Creator → Tip jar** (`/creator/tips`).
2. If no jar exists, you'll see **Initialise creator profile** — click it.
3. Wallet signs once; on-chain `CreatorProfile` PDA is created with
   your owner pubkey + the project USDC mint.
4. Vault appears with $0 balance. Done.

![Tip jar initialise](creator-tip-init.png)

**State**: `tip_jar.CreatorProfile` PDA at
`seeds = [b"creator", owner_pubkey]` on program
`C2bM3p1Cco4bDj6gQe29k7UWcepxLCrVgiPPoidh549P`.

## 3. Receive a tip

Anyone visiting `/c/<handle>` sees a **Tip in USDC** button that
deep-links to a Blink renderer (`/b/tip/<wallet>`). The Blink builds
the `send_tip` transaction; the donor's wallet signs and submits.

- Tipper sees: "Your tip of $X reached `<handle>`."
- You receive: notification (real-time bell + email if enabled),
  vault balance updates, `total_tip_count` + `total_tips_amount`
  increment on-chain.

![Tip in USDC button](creator-tip-cta.png)

**Notifications**: opt in at `/settings/notifications`. Email
delivery requires a verified address (`/verify` flow) and at least
one type in your allowlist.

## 4. Withdraw tip jar balance

1. **Creator → Tip jar** → vault balance shows accrued USDC.
2. Click **Withdraw** — wallet signs `withdraw` ix.
3. USDC transfers from vault to your wallet's USDC ATA.
4. `total_withdrawn_amount` increments on-chain.

![Tip jar withdraw](creator-tip-withdraw.png)

You don't need to withdraw before tipping resumes — the vault keeps
accumulating between withdrawals.

## 5. Set up a subscription plan

Recurring USDC payments via the SPL delegate pattern.

1. Open **Creator → Subscriptions** (`/creator/plans`).
2. Click **Create plan**.
3. Fields:
   - **Plan ID** (unique per creator; pick anything, e.g. `1`)
   - **Price per period** (USDC)
   - **Period** (1h to 2y; choose seconds)
4. Wallet signs once → `Plan` PDA writes on-chain.
5. Share `/c/<handle>#subscriptions` so fans subscribe.

When a fan subscribes, they pre-approve N billing cycles (default 12)
via SPL delegate. The permissionless `charge` cranker (cron-driven)
pulls each cycle's USDC into your plan vault on the schedule.

![Subscription plan creator](creator-plan-create.png)

**State**: `subscription.Plan` PDA at
`seeds = [b"plan", creator_pubkey, plan_id_le]` on program
`8G2hbD1qJUcaVAEdfVxaHfbCgxyEzQdrpjhDMM9pSL4w`.

**Subscriber list**: `/creator/subscribers` shows every subscription
account whose plan you own — subscriber wallet, status, charges,
total paid, next charge date.

## 6. Withdraw subscription revenue

1. **Creator → Subscriptions** → click the plan.
2. **Withdraw** transfers the plan vault to your wallet.
3. `total_withdrawn` updates on-chain.

`charge` runs without your involvement once subscribers pre-approve;
your only periodic action is **Withdraw**.

## 7. Create an event with tickets

Compressed-NFT (cNFT) ticketing with optional venue maps + signed QR
check-in + atomic on-chain resale.

1. Open **Creator → Events** (`/creator/events`).
2. Click **Create event** — wizard walks through:
   - Event basics: name, symbol, metadata URI (optional gallery).
   - Capacity, sale window (`starts_at` / `ends_at`).
   - Single-tier price OR multi-tier configurator.
3. Wallet signs once → `Event` PDA writes.
4. (Optional) **Tier configurator** for multi-tier events:
   GA, VIP, premium, etc., each with its own price + capacity.
5. (Optional) **Venue layouts** (`/creator/venues`): SVG floor plan
   editor with row/seat polygons for seated events.
6. (Optional) **Initialise event tree** to enable cNFT minting on
   purchase. Required if you want tickets in fan wallets.

![Event wizard](creator-event-wizard.png)

**State**: `event_tickets.Event` PDA on program
`FDUwvXRETURbe2JN2PJNCKt6RPAsSLeSi7A4pFMGmtrE`. Per-tier:
`TicketTier` PDA. Per-seat reservations: `TierSeat` row in
Supabase + on-chain `Ticket` PDA at purchase.

## 8. Sell + check in tickets

- Fans buy from `/marketplace/events/v/<address>` — wallet signs
  `buy_tier_ticket`, USDC moves to event vault, cNFT mints to fan
  wallet (or non-transferable PDA if no merkle tree initialised).
- **Door scan**: open `/creator/events/<id>/scan` on event night.
  QR contains an Ed25519-signed payload; the door scanner verifies
  signature + event window + check-in dedupe.
- **Scanner roster**: invite team to `/creator/events/<id>/scan` via
  `/creator/events/<id>` → **Scanners** tab. Each gets an
  allowlist row in `event_scanners`.

![Door scan flow](creator-event-scan.png)

## 9. Withdraw event revenue

Same pattern as tip jar: `withdraw_revenue` ix transfers event vault
USDC to your wallet. Available any time, any number of partial
withdrawals.

## 10. Track everything

- **Real-time bell**: `/settings/notifications` opts you into push +
  email for tip received, ticket sold, subscription charged, OTC
  accepted, auction settled, and 12 other event types.
- **Analytics dashboard**: `/creator/analytics` aggregates lifetime
  tip count + amount, vault balance, withdrawn amount, 30-day
  activity bar grid, recent transactions table, CSV export of
  signatures or earnings.
- **Subscribers list**: `/creator/subscribers` per-plan grouping
  with status pills.

## What you cannot do (yet)

- **Ban/refund a tipper** — tips are atomic on-chain and final.
- **Pause subscriptions globally** — subscribers cancel from their
  side; you can mark a plan inactive (`update_plan_status`) so new
  subs can't sign up, but existing ones keep charging until they
  cancel or run out of pre-approved cycles.
- **Move a creator profile to a new wallet** — the profile is
  pubkey-bound; rotating wallets means a new handle.

## Where it lives

| Surface | Route | Backing state |
|---|---|---|
| Public profile | `/c/<handle>` | `creator_profiles` (Supabase) |
| Profile editor | `/creator/profile` | same, JWT-gated |
| Tip jar | `/creator/tips` | `tip_jar.CreatorProfile` |
| Subscriptions | `/creator/plans` | `subscription.Plan` |
| Subscribers | `/creator/subscribers` | `subscription.Subscription` |
| Events | `/creator/events` | `event_tickets.Event` |
| Venues | `/creator/venues` | `venue_layouts` (Supabase) |
| Analytics | `/creator/analytics` | RPC + Supabase |
| Notifications settings | `/settings/notifications` | `notification_preferences` |

## Help

Stuck? Email `support@nodosol.com` (security issues:
[security@nodosol.com](mailto:security@nodosol.com), see
[/security](https://nodosol.com/security)).
