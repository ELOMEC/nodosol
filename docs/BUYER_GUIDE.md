# Buyer guide

Tip a creator, buy a ticket, sign up for a rental, win an auction,
or close an OTC trade — all with the same wallet, all settled in
USDC on Solana. This guide walks the end-to-end flow for each
buyer-facing surface.

> Image refs are placeholders (`![alt](buyer-tip.png)`). Drop
> screenshots into `docs/img/` before publishing externally.

## Prerequisites

- A Solana wallet (Phantom, Backpack, or Privy email login).
- USDC balance — devnet faucet on `/welcome` mints free tokens; on
  mainnet, on-ramp via Privy or transfer from any Solana wallet.
- ~0.05 SOL for transaction fees.

If you've never connected, the **Get started** CTA on the landing
page (`/welcome`) walks through wallet pick + faucet in one screen.

## Tip a creator

The simplest action on Nodosol — one tap, one signature, USDC moves
straight into the creator's on-chain vault.

1. Open `nodosol.com/c/<handle>` (e.g. from a creator's social bio).
2. Click **Tip in USDC**.
3. The Blink renderer (`/b/tip/<wallet>`) opens. Pick an amount
   (default $1 / $5 / $10 / custom).
4. Wallet pops up — confirm. Tx submits to Solana within ~1s.
5. Toast confirms: *"Your tip of $X reached @handle."*

The creator gets a real-time notification (bell + optional email).
You get a row in `/account/history` under **Tips**.

![Tip Blink](buyer-tip.png)

## Buy an event ticket

cNFT tickets — your wallet receives the ticket, you can resell it,
the door scanner verifies signed QR codes.

1. Browse `/marketplace/events` or open a creator's `#events`
   anchor on `/c/<handle>`.
2. Click an event card → `/marketplace/events/v/<address>`.
3. (Optional) **Pick a seat** if the event is seated.
4. Click **Buy** ($X for the chosen tier).
5. Wallet confirms. Token-2022 USDC moves from your ATA to the event
   vault; a cNFT ticket mints into your wallet.

To check in at the door:
- Open the ticket from `/marketplace/tickets/<assetId>`.
- Show the QR code to the door scanner.
- Scanner verifies the Ed25519 signature, dedupes against
  prior check-ins, and stamps you in.

![Ticket detail + QR](buyer-ticket.png)

**Resell a ticket** before the event: from
`/marketplace/tickets/<assetId>`, click **List for resale**, pick
price + (optional) private commit/reveal, and the on-chain
`list_ticket_resale` ix swaps your cNFT into a listing PDA.
Royalty + platform fee split applies on the buyer side.

## Subscribe to a creator or rental

Recurring USDC payments on a fixed cadence (monthly, quarterly,
annual — whatever the seller chose).

1. Open `nodosol.com/c/<handle>#subscriptions` or
   `/marketplace/rentals/<plan>`.
2. Click **Subscribe** on the plan you want.
3. The wizard asks how many cycles to **pre-approve** (default 12).
4. Wallet signs once. SPL delegate authorisation grants the
   plan vault permission to pull `price * cycles` USDC over time.
5. The permissionless `charge` cranker (cron) pulls each cycle's
   payment automatically.

To **cancel**: open the subscription detail, click **Cancel**. The
delegate is revoked; no further charges.

To **manage all subscriptions**: `/marketplace/rentals/my` or
`/account/history` (Subscriptions section).

![Subscribe wizard](buyer-subscribe.png)

## Bid on an auction

Sealed-bid commit/reveal auctions. Your bid is hidden until reveal.

1. Browse `/marketplace/auctions`.
2. Click an auction → `/marketplace/auctions/<address>`.
3. **Commit phase**:
   - Pick a bid amount.
   - Generate a random salt (auto in the UI).
   - Wallet signs `commit_bid` — the sha256(amount + salt) hash
     plus your `min_deposit` USDC lands in the auction vault.
   - Save the salt locally (browser does this; you can copy it
     manually from the **My bids** panel).
4. **Reveal phase** opens after `commit_ends_at`:
   - Click **Reveal** on your bid.
   - Wallet signs `reveal_bid` with `(amount, salt)` — the hash
     match is verified on-chain. Highest revealed bid wins.
5. **Settle**: anyone can crank `settle_auction` after
   `reveal_ends_at`. The seller receives the highest bid; losing
   bids are refundable via `refund_bid`.

You'll see your won auctions in `/account/history` under
**Auction wins**.

![Auction detail](buyer-auction.png)

## Trade OTC

Private 1-on-1 RWA / asset deals with on-chain escrow.

1. Open `/marketplace/otc`.
2. Switch to **As buyer** tab → click an open offer that interests
   you, OR open `/marketplace/otc/new` to propose your own.
3. Counter-party negotiates inline via the chat panel (RLS-gated to
   the two wallets).
4. When terms are agreed, **Accept** the deal — wallet signs
   `accept_deal`. USDC moves from your wallet to the deal vault;
   asset moves from seller's wallet. Atomic.

OTC deals expire after the agreed window (1min–30 day) if not
accepted. Cancel any time before that with `cancel_deal`.

![OTC chat panel](buyer-otc.png)

## Save items for later

Tap the heart on any marketplace card to add it to your wishlist.
View saved items at `/account/wishlist`, grouped by type.

Wishlist is wallet-bound and private — only you see your list.

## Get notified

Open `/settings/notifications`:

1. Add an email address.
2. Click **Send verification email** — confirm via the link.
3. Tick the notification types you want delivered:
   - **Confirmations** (your own actions): tip sent, ticket bought,
     subscription charged, etc.
   - **Activity** (counterparty needs you): OTC proposed, sub lapsed.
   - **Money in** (you're a seller too): tip received, listing sold,
     auction settled.

Real-time push lands in the bell icon at the top of the app.
Email is a secondary delivery for the types you allowlist.

To **unsubscribe**, click the link at the bottom of any email or
toggle types off in settings.

## Track everything

`/account/history` shows your buyer-side activity in four sections:

- **Tickets**: cNFTs you own (Helius DAS lookup).
- **Subscriptions**: every plan you subscribed to + status + total
  paid.
- **OTC deals**: as buyer + as seller, merged + sorted recent.
- **Auction wins**: every auction where you were the highest
  revealed bidder, linked to the auction page.

## What you cannot do (yet)

- **Refund a tip** — tips are atomic on-chain and final. Contact the
  creator if it was a mistake.
- **Transfer a non-cNFT ticket** — events without an initialised
  Merkle tree mint a non-transferable PDA ticket. Only the original
  buyer can check in.
- **Cancel a confirmed OTC deal** — once accepted, the swap is
  atomic and final.
- **Pay in anything other than USDC** — Token-2022 USDC is the only
  payment rail. Privy email login auto-creates a Solana wallet so
  fiat-friendly users don't need a separate setup; on-ramp UI
  ships in a follow-up.

## Where it lives

| Surface | Route | Backing state |
|---|---|---|
| Marketplace home | `/marketplace` | client browser |
| Events | `/marketplace/events` | `event_tickets.Event` |
| Auctions | `/marketplace/auctions` | `auctions.Auction` |
| Rentals | `/marketplace/rentals` | `subscription.Plan` |
| Resale board | `/marketplace/resale` | `event_tickets.ResaleListing` |
| OTC desk | `/marketplace/otc` | `otc_deals.Deal` |
| Tickets owned | `/marketplace/tickets` | Helius DAS lookup |
| Purchase history | `/account/history` | aggregated |
| Wishlist | `/account/wishlist` | `wishlist` (Supabase) |
| Notification settings | `/settings/notifications` | `notification_preferences` |

## Help

Stuck? Email `support@nodosol.com`. Security issues:
[security@nodosol.com](mailto:security@nodosol.com), see
[/security](https://nodosol.com/security) for the responsible
disclosure policy.
