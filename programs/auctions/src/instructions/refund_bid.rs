use anchor_lang::prelude::*;
use anchor_spl::{
    token_2022::{transfer_checked, TransferChecked},
    token_interface::{Mint, TokenAccount, TokenInterface},
};

use crate::{
    constants::{AUCTION_SEED, BID_SEED, VAULT_SEED},
    error::AuctionsError,
    events::BidRefunded,
    state::{Auction, AuctionStatus, BidStatus, SealedBid},
};

/// Pulls a non-winning bidder's escrow out of the auction vault. Must
/// be called by the bidder themselves after the auction has reached a
/// terminal state (Settled or Cancelled). Closes the SealedBid PDA and
/// refunds its rent to the bidder.
///
/// The winner's SealedBid is flipped to `Won` during settle so this
/// instruction refuses it — their escrow has already been consumed.
/// Unrevealed-and-settled bids also refund here, so bidders who failed
/// to reveal on time can still recover their escrow.
#[derive(Accounts)]
pub struct RefundBid<'info> {
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
        close = bidder,
        seeds = [BID_SEED, auction.key().as_ref(), bidder.key().as_ref()],
        bump = bid.bump,
    )]
    pub bid: Box<Account<'info, SealedBid>>,

    pub payment_mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(
        mut,
        seeds = [VAULT_SEED, auction.key().as_ref()],
        bump = auction.vault_bump,
        token::mint = payment_mint,
        token::authority = auction,
        token::token_program = payment_token_program,
    )]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(
        mut,
        token::mint = payment_mint,
        token::authority = bidder,
        token::token_program = payment_token_program,
    )]
    pub bidder_payment_account: Box<InterfaceAccount<'info, TokenAccount>>,

    pub payment_token_program: Interface<'info, TokenInterface>,
}

pub fn handle_refund_bid(ctx: Context<RefundBid>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;

    {
        let auction = &ctx.accounts.auction;
        require!(
            auction.status == AuctionStatus::Settled
                || auction.status == AuctionStatus::Cancelled,
            AuctionsError::NotSettlePhase
        );

        let bid = &ctx.accounts.bid;
        require!(bid.status != BidStatus::Won, AuctionsError::WinnerCannotRefund);
        require!(bid.status != BidStatus::Refunded, AuctionsError::InvalidBidState);
        require!(
            auction.payment_mint == ctx.accounts.payment_mint.key(),
            AuctionsError::TreasuryMismatch
        );
    }

    let auction_seller_key = ctx.accounts.auction.seller;
    let auction_id_bytes = ctx.accounts.auction.auction_id.to_le_bytes();
    let auction_bump = ctx.accounts.auction.bump;
    let escrow = ctx.accounts.bid.escrow;
    let decimals = ctx.accounts.payment_mint.decimals;
    let bidder_key = ctx.accounts.bidder.key();
    let auction_key = ctx.accounts.auction.key();

    let signer_seeds: &[&[u8]] = &[
        AUCTION_SEED,
        auction_seller_key.as_ref(),
        auction_id_bytes.as_ref(),
        std::slice::from_ref(&auction_bump),
    ];

    let cpi_accounts = TransferChecked {
        from: ctx.accounts.vault.to_account_info(),
        mint: ctx.accounts.payment_mint.to_account_info(),
        to: ctx.accounts.bidder_payment_account.to_account_info(),
        authority: ctx.accounts.auction.to_account_info(),
    };
    transfer_checked(
        CpiContext::new_with_signer(
            ctx.accounts.payment_token_program.key(),
            cpi_accounts,
            &[signer_seeds],
        ),
        escrow,
        decimals,
    )?;

    // The SealedBid account closes to the bidder (see #[account(close)]).
    // Mark status first for any external indexers, though close wipes data.
    let bid = &mut ctx.accounts.bid;
    bid.status = BidStatus::Refunded;

    emit!(BidRefunded {
        auction: auction_key,
        bidder: bidder_key,
        amount: escrow,
        timestamp: now,
    });
    Ok(())
}
