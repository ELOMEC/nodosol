use anchor_lang::prelude::*;
use anchor_spl::token_interface::{close_account, CloseAccount, TokenAccount, TokenInterface};

use crate::{
    constants::{AUCTION_SEED, VAULT_SEED},
    error::AuctionsError,
    events::AuctionCancelled,
    state::{Auction, AuctionStatus},
};

/// Seller can cancel an auction before any bids are committed. Closes
/// the vault ATA and refunds its rent + the auction account rent to
/// the seller. Once even a single bidder commits, cancellation is
/// blocked — the auction must play out or expire.
#[derive(Accounts)]
pub struct CancelAuction<'info> {
    #[account(mut, address = auction.seller @ AuctionsError::Unauthorized)]
    pub seller: Signer<'info>,

    #[account(
        mut,
        close = seller,
        seeds = [AUCTION_SEED, auction.seller.as_ref(), &auction.auction_id.to_le_bytes()],
        bump = auction.bump,
    )]
    pub auction: Box<Account<'info, Auction>>,

    #[account(
        mut,
        seeds = [VAULT_SEED, auction.key().as_ref()],
        bump = auction.vault_bump,
        token::mint = auction.payment_mint,
        token::authority = auction,
        token::token_program = payment_token_program,
    )]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,

    pub payment_token_program: Interface<'info, TokenInterface>,
}

pub fn handle_cancel_auction(ctx: Context<CancelAuction>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    {
        let a = &ctx.accounts.auction;
        require!(
            a.status == AuctionStatus::CommitPhase,
            AuctionsError::AuctionClosed
        );
        require!(a.bid_count == 0, AuctionsError::HasBids);
    }

    // Close the empty vault back to the seller. Auction PDA signs.
    let seller_key = ctx.accounts.seller.key();
    let auction_id_bytes = ctx.accounts.auction.auction_id.to_le_bytes();
    let bump = ctx.accounts.auction.bump;
    let signer_seeds: &[&[u8]] = &[
        AUCTION_SEED,
        seller_key.as_ref(),
        auction_id_bytes.as_ref(),
        std::slice::from_ref(&bump),
    ];

    let cpi_accounts = CloseAccount {
        account: ctx.accounts.vault.to_account_info(),
        destination: ctx.accounts.seller.to_account_info(),
        authority: ctx.accounts.auction.to_account_info(),
    };
    close_account(CpiContext::new_with_signer(
        ctx.accounts.payment_token_program.key(),
        cpi_accounts,
        &[signer_seeds],
    ))?;

    emit!(AuctionCancelled {
        auction: ctx.accounts.auction.key(),
        seller: seller_key,
        timestamp: now,
    });
    // auction account `close = seller` refunds the remaining rent.
    Ok(())
}
