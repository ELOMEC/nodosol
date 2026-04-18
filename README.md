# Nodosol

Creator economy on Solana — Token-2022 payments with confidential-ready architecture.

**Domain**: [nodosol.com](https://nodosol.com)

## What

Patreon + Ticketmaster alternative for creators, built on Solana. 1% fee vs Patreon 15%. Instant settlement in USDC. Native fan-to-creator tips, subscriptions, event tickets, and NFT collectibles.

## Architecture

Monorepo:

```
nodosol/
├── anchor/     Solana programs (Anchor workspace)
├── mobile/     Expo React Native app
├── web/        Next.js — Blinks/Actions endpoints + creator pages
└── shared/     Shared TypeScript types and utilities
```

## Tech stack

- **Programs**: Anchor 0.30+, Solana 3.x
- **Tokens**: Token-2022 (SPL) with USDC; ElGamal pubkey fields reserved for V2 confidential migration
- **Mobile**: Expo + React Native, Privy embedded wallets
- **Web**: Next.js on Vercel
- **DB**: Supabase (Postgres) for off-chain profile metadata
- **RPC**: Helius or Triton (never public RPC)

## Privacy roadmap

- **V1 (now)**: Standard Token-2022 USDC transfers. Account schemas reserve ElGamal pubkey fields.
- **V2 (when unblocked)**: Activate Token-2022 Confidential Transfers once the ZK ElGamal Proof Program is re-enabled on mainnet (disabled since June 2025 pending security audit).

## Status

Pre-launch. Building investor demo MVP (April 2026).
