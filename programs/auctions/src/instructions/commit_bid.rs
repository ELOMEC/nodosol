use anchor_lang::prelude::*;
use anchor_spl::{
    token_2022::{transfer_checked, TransferChecked},
    token_interface::{Mint, TokenAccount, TokenInterface},
};

use crate::{
    constants::{AUCTION_SEED, BID_SEED, VAULT_SEED},
    error::AuctionsError,
    events::BidCommitted,
    state::{Auction, AuctionStatus, BidStatus, SealedBid},
};

#[derive(Accounts)]
pub struct CommitBid<'info> {
    #[account(mut)]
    pub bidder: Signer<'info>,

    #[account(
        mut,
        seeds = [AUCTION_SEED, auction.seller.as_ref(), &auction.auction_id.to_le_bytes()],
        bump = auction.bump,
    )]
    pub auction: Box<Account<'info, Auction>>,

    #[account(
        init,
        payer = bidder,
        space = 8 + SealedBid::INIT_SPACE,
        seeds = [BID_SEED, auction.key().as_ref(), bidder.key().as_ref()],
        bump,
    )]
    pub bid: Box<Account<'info, SealedBid>>,

    pub payment_mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(
        mut,
        token::mint = payment_mint,
        token::authority = bidder,
        token::token_program = payment_token_program,
    )]
    pub bidder_payment_account: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(
        mut,
        seeds = [VAULT_SEED, auction.key().as_ref()],
        bump = auction.vault_bump,
        token::mint = payment_mint,
        token::authority = auction,
        token::token_program = payment_token_program,
    )]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,

    pub payment_token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

pub fn handle_commit_bid(
    ctx: Context<CommitBid>,
    commit: [u8; 32],
    escrow: u64,
) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;

    {
        let auction = &ctx.accounts.auction;
        require!(
            auction.status == AuctionStatus::CommitPhase,
            AuctionsError::AuctionClosed
        );
        require!(now < auction.commit_ends_at, AuctionsError::NotCommitPhase);
        require!(
            auction.seller != ctx.accounts.bidder.key(),
            AuctionsError::SellerCannotBid
        );
        require!(
            escrow >= auction.min_deposit,
            AuctionsError::DepositBelowMinimum
        );
        require!(
            auction.payment_mint == ctx.accounts.payment_mint.key(),
            AuctionsError::TreasuryMismatch
        );
    }

    // Escrow USDC from bidder → auction vault. Bidder signs.
    let decimals = ctx.accounts.payment_mint.decimals;
    let cpi_accounts = TransferChecked {
        from: ctx.accounts.bidder_payment_account.to_account_info(),
        mint: ctx.accounts.payment_mint.to_account_info(),
        to: ctx.accounts.vault.to_account_info(),
        authority: ctx.accounts.bidder.to_account_info(),
    };
    transfer_checked(
        CpiContext::new(ctx.accounts.payment_token_program.key(), cpi_accounts),
        escrow,
        decimals,
    )?;

    let bid = &mut ctx.accounts.bid;
    bid.auction = ctx.accounts.auction.key();
    bid.bidder = ctx.accounts.bidder.key();
    bid.commit = commit;
    bid.escrow = escrow;
    bid.revealed_bid = 0;
    bid.committed_at = now;
    bid.revealed_at = 0;
    bid.status = BidStatus::Committed;
    bid.bump = ctx.bumps.bid;
    bid.reserved = [0u8; 16];

    let auction = &mut ctx.accounts.auction;
    auction.bid_count = auction
        .bid_count
        .checked_add(1)
        .ok_or(AuctionsError::ArithmeticOverflow)?;

    emit!(BidCommitted {
        auction: auction.key(),
        bidder: ctx.accounts.bidder.key(),
        escrow,
        timestamp: now,
    });
    Ok(())
}
