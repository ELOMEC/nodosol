# Integrations guide

For partner developers building on top of Nodosol — wallets,
analytics, secondary marketplaces, ticketing aggregators, and so on.
Three primary integration surfaces:

1. **Solana Blinks** — drop-in payment + tip + ticket actions any
   client can render.
2. **On-chain programs** — direct Anchor IDL access to all 9
   Nodosol programs.
3. **Webhook events** — Helius enhanced-tx pipe that funnels every
   user-relevant event into your backend.

## Solana Blinks

Blinks (Solana Actions Spec) let any client render a transaction
flow with a single URL. Nodosol exposes three Blinks publicly:

| Action | URL | Body |
|---|---|---|
| Tip | `/api/actions/tip/[creator]` | `{ amount: number }` |
| Subscribe | `/api/actions/subscribe/[creator]/[planId]` | `{}` (uses plan's price + period) |
| Buy ticket | `/api/actions/ticket/[creator]/[eventId]` | `{}` (single-tier) |

`creator` is the wallet pubkey (base58); `planId` / `eventId` are
the on-chain numeric IDs.

### Action metadata (GET)

```
GET https://www.nodosol.com/api/actions/tip/<creator>

200 application/json
{
  "icon": "https://www.nodosol.com/icon.svg",
  "title": "Tip @handle",
  "description": "Send a tip in USDC.",
  "label": "Tip",
  "links": {
    "actions": [
      { "label": "Tip $1",  "href": "/api/actions/tip/<creator>?amount=1" },
      { "label": "Tip $5",  "href": "/api/actions/tip/<creator>?amount=5" },
      { "label": "Tip $10", "href": "/api/actions/tip/<creator>?amount=10" },
      { "label": "Tip {amount} USDC", "href": "/api/actions/tip/<creator>?amount={amount}",
        "parameters": [{ "name": "amount", "label": "Amount", "type": "number" }] }
    ]
  }
}
```

### Build transaction (POST)

```
POST https://www.nodosol.com/api/actions/tip/<creator>?amount=5
Content-Type: application/json
{ "account": "<base58 user wallet>" }

200 application/json
{
  "transaction": "<base64 wire-format tx>",
  "message": "Tip of $5 to @handle"
}
```

Wallet adapter signs `transaction`, submits to Solana, done. The tx
is fully built server-side with the user's pubkey injected as the
fee payer; client only signs.

CORS is open (`Access-Control-Allow-Origin: *`) so any web client,
mobile app, or `dial.to`-style aggregator can render the action
without proxying through Nodosol.

## On-chain programs

All 9 programs are public Anchor binaries. IDLs ship under
`web/idl/` in the GitHub repo and embed in the binary itself
(`anchor-idl-build`).

| Program | ID (devnet) | Purpose |
|---|---|---|
| `tip_jar` | `C2bM3p1Cco4bDj6gQe29k7UWcepxLCrVgiPPoidh549P` | Lifetime-tracked USDC tip vault |
| `subscription` | `8G2hbD1qJUcaVAEdfVxaHfbCgxyEzQdrpjhDMM9pSL4w` | SPL-delegate recurring billing |
| `events` | `4q4KxCcvY7vswq3tXgr448ghXWBtz4PzNfoddZu282Ax` | Single-tier event tickets |
| `event_tickets` | `FDUwvXRETURbe2JN2PJNCKt6RPAsSLeSi7A4pFMGmtrE` | Multi-tier cNFT tickets + resale |
| `marketplace` | `69ZFM7nHUTXcHp8TZpRtX4qr3ERK2VGxRdqXvNtbfJkZ` | RWA fixed-price listings |
| `otc_deals` | `FmXBAWoSGanaFfP8p9gekgrFn7buEn1XUSFWebDr3Pwz` | Atomic 1-on-1 escrow |
| `auctions` | `6c95kxTWCXacsAev4xnvNbKnLYWFGPpJT5zwT4SnWh5v` | Sealed-bid commit/reveal |
| `rwa_registry` | `7BCWTrD7rcedAg3zpvtvNdManv39kzr3eHBjWyomCbdT` | Issuer registry + class flags |
| `rwa_mint` | `HLCCfvp99Z1Rnix64mC6w6dYL9EkEjVmPCL7rr27evsU` | Fixed-supply asset tokenization |

### Read-only access

```ts
import { AnchorProvider, Program } from "@coral-xyz/anchor";
import tipJarIdl from "./idl/tip_jar.json";

const program = new Program(tipJarIdl, provider);

// Fetch a creator's tip jar:
const profile = await program.account.creatorProfile.fetch(pda);
console.log(profile.totalTipCount.toString());
```

### Common queries

- All listings on a marketplace program:
  `program.account.listing.all([{ memcmp: { offset: 8, bytes: sellerPubkey } }])`
- Subscriptions by subscriber:
  `program.account.subscription.all([{ memcmp: { offset: 40, bytes: walletPubkey } }])`
  (offset 40 = subscriber field, after 8-byte discriminator + 32-byte plan)
- Active auctions ending soon:
  `program.account.auction.all()` then filter
  `(status.committPhase || status.revealPhase) && revealEndsAt > now`

### Writes

Every state-changing ix is permissionless from a payer perspective —
the wallet that signs is the fee payer. Account constraints enforce
authorisation on-chain (e.g. only the original seller can cancel
a listing). See `programs/<name>/src/instructions/` for the full
constraint set.

## Webhook events

If you operate a backend and want push-style updates instead of
polling RPC, mirror the Nodosol Helius enhanced-tx webhook path.

### Architecture

```
on-chain tx → Helius → POST https://<your-host>/webhook
                              |
                              ↓
                          your decoder
                              |
                              ↓
                          your store / notification system
```

Helius enhanced webhooks fire on every transaction touching one of
your registered program IDs. Auth is a Bearer secret you set in
the CF dashboard.

### Set up

1. Helius dashboard → **Webhooks → Create Webhook → Enhanced**.
2. Account addresses: paste any subset of the 9 program IDs above.
3. Auth header: `Bearer <random-32-byte-hex>` — call it `NODOSOL_WEBHOOK_SECRET` on your side.
4. URL: `https://<your-host>/webhook`.

### Payload shape

```json
{
  "signature": "5UfDuJ...",
  "type": "TRANSFER",
  "source": "MAGIC_EDEN",
  "timestamp": 1745740800,
  "slot": 245700000,
  "fee": 5000,
  "feePayer": "<base58 fee payer>",
  "instructions": [
    {
      "programId": "<base58 program id>",
      "accounts": ["<accounts in instruction order>"],
      "data": "<base58 instruction data>"
    }
  ],
  "tokenTransfers": [
    {
      "fromUserAccount": "<base58>",
      "toUserAccount": "<base58>",
      "tokenAmount": 5.0,
      "mint": "<USDC mint>"
    }
  ]
}
```

### Decoding instructions

Each Anchor ix is identified by an **8-byte discriminator** =
`sha256("global:" + ix_name)[..8]`. Take the first 8 bytes of the
base58-decoded `data` field and match against your discriminator
table. Reference implementation:
`supabase/functions/helius-webhook/index.ts` ships a 12-decoder
table covering tip / subscription / event / OTC / auction
instructions — copy it as a starting point.

### Notification taxonomy

The webhook decoder emits typed rows into a `notifications` table.
Use the same taxonomy if you want consistent integrations:

| Type | Triggered by | Email-eligible default |
|---|---|---|
| `tip_received` | `tip_jar.send_tip` (creator side) | yes |
| `tip_sent` | `tip_jar.send_tip` (donor side) | no |
| `subscription_charged` | `subscription.charge` (subscriber side) | yes |
| `subscription_revenue` | `subscription.charge` (creator side) | yes |
| `subscription_expired` | `subscription.expire` | yes |
| `ticket_bought` | `event_tickets.buy_tier_ticket` (buyer side) | no |
| `ticket_sold` | `event_tickets.buy_tier_ticket` (creator side) | yes |
| `listing_bought` / `listing_sold` | `marketplace.buy_listing` | both eligible (yes for sold) |
| `resale_bought` / `resale_sold` | `event_tickets.buy_ticket_resale*` | sold side eligible |
| `otc_proposed` | `otc_deals.propose_deal` | yes |
| `otc_accepted` / `otc_accepted_self` | `otc_deals.accept_deal` | yes for counterparty |
| `bid_committed` / `bid_revealed` | `auctions.commit_bid`/`reveal_bid` | bid_revealed eligible |
| `auction_settled_seller` | `auctions.settle_auction` (seller side) | yes |

### Resolving creator-side from PDAs

Several types need an extra RPC fetch to resolve who to notify
(e.g. tip_jar.send_tip's accounts list contains the
`CreatorProfile` PDA, not the creator wallet directly).
`fetchPdaPubkeyAt(pda, offset)` in
`supabase/functions/helius-webhook/index.ts` does the lookup with
a 5-min in-process cache. Pattern:

```ts
const owner = await fetchPdaPubkeyAt(creatorProfilePda, 8);
// CreatorProfile field layout: discriminator(8) | owner(32) | ...
```

## Auth + RLS for partner backends

If you store integration data in your own Supabase / Postgres, the
patterns we use:

- **Wallet-signed JWTs**: `issue-chat-jwt` Edge Function in this
  repo verifies an Ed25519 signature over a `nodosol-chat-auth`
  challenge and mints a Supabase-compatible HS256 JWT with `sub =
  wallet pubkey`. Use the same pattern (or copy the function
  outright) so RLS policies can gate by `auth.jwt() ->> 'sub'`.
- **Service-role access**: Edge Function secrets only. Never ship
  the service-role key in client code.
- **Event log**: append `security_events` rows on
  `sig_verify_fail`, `rate_limit_hit`, etc. for forensic recall.
  Schema in `supabase/015_security_events.sql`.

## Versioning

- **Anchor IDL changes**: tracked in `web/idl/` and the program
  binary's embedded IDL. We bump the program ID (full redeploy)
  on breaking schema changes; minor field additions land via
  `update_pause` + `solana_security_txt` patch deploys.
- **Webhook payload**: Helius schema is upstream — they version
  via the `schema` field. We don't proxy.
- **Edge Function URL**: stable per function name. New features
  add new functions, never break existing ones.

## Rate limits

- Public Blinks: no per-IP cap (CDN handles abuse).
- Helius webhook intake: per-account quota set by Helius — see
  their dashboard.
- Direct RPC reads against our deployed programs: the Solana
  RPC's own rate limits apply — we recommend Helius for any
  serious backend integration.

## Help

- Bug reports / feature requests: GitHub issues at
  `ELOMEC/nodosol`.
- Integration questions: `partners@nodosol.com`.
- Security: [security@nodosol.com](mailto:security@nodosol.com)
  (see [/security](https://nodosol.com/security)).
