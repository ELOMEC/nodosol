use anchor_lang::prelude::*;

#[event]
pub struct AuctionConfigInitialized {
    pub authority: Pubkey,
    pub treasury: Pubkey,
    pub fee_bps: u16,
    pub timestamp: i64,
}

#[event]
pub struct AuctionCreated {
    pub auction: Pubkey,
    pub seller: Pubkey,
    pub auction_id: u64,
    pub start_price: u64,
    pub min_deposit: u64,
    pub commit_ends_at: i64,
    pub reveal_ends_at: i64,
    pub timestamp: i64,
}

#[event]
pub struct AuctionCancelled {
    pub auction: Pubkey,
    pub seller: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct BidCommitted {
    pub auction: Pubkey,
    pub bidder: Pubkey,
    pub escrow: u64,
    pub timestamp: i64,
}

#[event]
pub struct BidRevealed {
    pub auction: Pubkey,
    pub bidder: Pubkey,
    pub bid: u64,
    pub is_new_highest: bool,
    pub timestamp: i64,
}

#[event]
pub struct AuctionSettled {
    pub auction: Pubkey,
    pub seller: Pubkey,
    pub winner: Pubkey, // Pubkey::default() if no revealed bids
    pub winning_bid: u64,
    pub seller_share: u64,
    pub fee: u64,
    pub timestamp: i64,
}

#[event]
pub struct BidRefunded {
    pub auction: Pubkey,
    pub bidder: Pubkey,
    pub amount: u64,
    pub timestamp: i64,
}

#[event]
pub struct TreasuryUpdated {
    pub previous: Pubkey,
    pub next: Pubkey,
    pub timestamp: i64,
}
