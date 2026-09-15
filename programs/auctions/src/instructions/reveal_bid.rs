use anchor_lang::prelude::*;
use solana_program::keccak;

use crate::{
    constants::{AUCTION_SEED, BID_SEED},
    error::AuctionsError,
    events::BidRevealed,
    state::{Auction, AuctionStatus, BidStatus, SealedBid},
};

#[derive(Accounts)]
pub struct RevealBid<'info> {
    #[account(mut, address = bid.bidder @ AuctionsError::NotBidder)]
    pub bidder: Signer<'info>,

    #[account(
        mut,
        seeds = [AUCTION_SEED, auction.seller.as_ref(), &auction.auction_id.to_le_bytes()],
        bump = auction.bump,
    )]
    pub auction: Box<Account<'info, Auction>>,

    #[account(
        mut,
        seeds = [BID_SEED, auction.key().as_ref(), bidder.key().as_ref()],
        bump = bid.bump,
    )]
    pub bid: Box<Account<'info, SealedBid>>,
}

pub fn handle_reveal_bid(
    ctx: Context<RevealBid>,
    bid_amount: u64,
    nonce: [u8; 32],
) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;

    {
        let auction = &ctx.accounts.auction;
        require!(
            auction.status == AuctionStatus::CommitPhase,
            AuctionsError::AuctionClosed
        );
        // Must be past commit deadline but inside reveal window.
        require!(
            now >= auction.commit_ends_at,
            AuctionsError::NotRevealPhase
        );
        require!(now < auction.reveal_ends_at, AuctionsError::NotRevealPhase);

        let bid = &ctx.accounts.bid;
        require!(
            bid.status == BidStatus::Committed,
            AuctionsError::InvalidBidState
        );
        require!(bid_amount >= auction.start_price, AuctionsError::BidBelowStartPrice);
        require!(bid_amount <= bid.escrow, AuctionsError::BidExceedsEscrow);

        // Verify commit hash.
        let computed = keccak::hashv(&[&bid_amount.to_le_bytes(), &nonce]);
        require!(
            computed.to_bytes() == bid.commit,
            AuctionsError::BidCommitMismatch
        );
    }

    let auction = &mut ctx.accounts.auction;
    let bid = &mut ctx.accounts.bid;
    let bidder_key = ctx.accounts.bidder.key();

    bid.revealed_bid = bid_amount;
    bid.revealed_at = now;
    bid.status = BidStatus::Revealed;

    auction.revealed_count = auction
        .revealed_count
        .checked_add(1)
        .ok_or(AuctionsError::ArithmeticOverflow)?;

    // Tie-breaker: first reveal of equal bids wins. Only strictly
    // greater bids overwrite the leader.
    let is_new_highest = bid_amount > auction.highest_bid;
    if is_new_highest {
        auction.highest_bid = bid_amount;
        auction.highest_bidder = bidder_key;
    }

    emit!(BidRevealed {
        auction: auction.key(),
        bidder: bidder_key,
        bid: bid_amount,
        is_new_highest,
        timestamp: now,
    });
    Ok(())
}
