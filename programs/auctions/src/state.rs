use anchor_lang::prelude::*;

use crate::constants::{MAX_MEMO_LEN, MAX_URI_LEN};

#[account]
#[derive(InitSpace)]
pub struct AuctionConfig {
    pub authority: Pubkey,
    pub treasury: Pubkey,
    pub fee_bps: u16,
    pub bump: u8,
    /// Emergency kill-switch. When true, all fund-moving instructions
    /// revert with `...Error::Paused`. Flipped by `update_pause`, which
    /// is authority-gated. Stored where the first byte of `reserved`
    /// used to live so existing on-chain accounts still deserialize
    /// cleanly (old bytes were zero → paused = false).
    pub paused: bool,
    pub reserved: [u8; 63],
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Debug)]
pub enum AuctionStatus {
    CommitPhase,
    RevealPhase,
    Settled,
    Cancelled,
}

/// A sealed-bid auction. The "asset" is described off-chain in `memo`
/// (short) and `metadata_uri` (rich JSON). This keeps the primitive
/// generic — the same program runs a ticket auction, an RWA token
/// auction, or a real-estate rental bid, differing only in metadata.
///
/// Settlement is USDC-in-USDC-out; if the seller needs to transfer a
/// physical or on-chain asset to the winner, that is handled either
/// via a separate CPI (future work: cNFT escrow variant) or off-chain.
///
/// PDA seeds: `[b"auction", seller, auction_id_le]`.
#[account]
#[derive(InitSpace)]
pub struct Auction {
    pub seller: Pubkey,
    pub auction_id: u64,
    pub payment_mint: Pubkey,
    pub vault: Pubkey,
    pub start_price: u64,
    pub min_deposit: u64,
    pub created_at: i64,
    pub commit_ends_at: i64,
    pub reveal_ends_at: i64,
    pub status: AuctionStatus,
    /// Total SealedBid accounts created under this auction.
    pub bid_count: u32,
    /// Number of bids that progressed to Revealed status.
    pub revealed_count: u32,
    /// Highest revealed bid so far. Zero until the first reveal.
    pub highest_bid: u64,
    /// Bidder who posted the highest revealed bid. Default pubkey
    /// when no bids have been revealed yet.
    pub highest_bidder: Pubkey,
    pub settled_at: i64,
    #[max_len(MAX_MEMO_LEN)]
    pub memo: String,
    #[max_len(MAX_URI_LEN)]
    pub metadata_uri: String,
    pub bump: u8,
    pub vault_bump: u8,
    pub reserved: [u8; 32],
}

impl Auction {
    pub fn phase(&self, now: i64) -> AuctionStatus {
        match self.status {
            AuctionStatus::Settled | AuctionStatus::Cancelled => self.status,
            _ => {
                if now < self.commit_ends_at {
                    AuctionStatus::CommitPhase
                } else if now < self.reveal_ends_at {
                    AuctionStatus::RevealPhase
                } else {
                    // past reveal deadline but not yet flipped to Settled
                    AuctionStatus::RevealPhase
                }
            }
        }
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Debug)]
pub enum BidStatus {
    Committed,
    Revealed,
    Refunded,
    Won,
}

/// Per-bidder sealed-bid account for an auction. At commit time the
/// bidder escrows `escrow` USDC and stores `commit = keccak256(bid || nonce)`.
/// Revealing unlocks the bid value on-chain. Losers claim their escrow
/// back via refund_bid; the winner's escrow is consumed by settle.
///
/// PDA seeds: `[b"bid", auction, bidder]` — enforces one active bid
/// per (auction, bidder) pair.
#[account]
#[derive(InitSpace)]
pub struct SealedBid {
    pub auction: Pubkey,
    pub bidder: Pubkey,
    pub commit: [u8; 32],
    pub escrow: u64,
    pub revealed_bid: u64,
    pub committed_at: i64,
    pub revealed_at: i64,
    pub status: BidStatus,
    pub bump: u8,
    pub reserved: [u8; 16],
}
