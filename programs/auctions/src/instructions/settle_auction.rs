use anchor_lang::prelude::*;
use anchor_spl::{
    token_2022::{transfer_checked, TransferChecked},
    token_interface::{Mint, TokenAccount, TokenInterface},
};

use crate::{
    constants::{AUCTION_SEED, BID_SEED, BPS_DENOMINATOR, CONFIG_SEED, VAULT_SEED},
    error::AuctionsError,
    events::AuctionSettled,
    state::{Auction, AuctionConfig, AuctionStatus, BidStatus, SealedBid},
};

/// Permissionless settle — anyone can call once the reveal window has
/// closed. Pays the winning bid (minus platform fee) from the auction
/// vault to the seller's payment account; the winner's `SealedBid` is
/// flipped to `Won` so `refund_bid` refuses it. Other revealed bidders
/// pull their escrow back via `refund_bid` (pull pattern to keep this
/// instruction bounded to a single bid account).
///
/// If zero bids were revealed, the auction settles with no payout;
/// the vault stays on-chain holding unrevealed escrows which can be
/// reclaimed individually via `refund_bid` (only by the bidder).
#[derive(Accounts)]
pub struct SettleAuction<'info> {
    /// Anyone may invoke settle — pays the compute for the seller.
    #[account(mut)]
    pub caller: Signer<'info>,

    #[account(
        mut,
        seeds = [AUCTION_SEED, auction.seller.as_ref(), &auction.auction_id.to_le_bytes()],
        bump = auction.bump,
    )]
    pub auction: Box<Account<'info, Auction>>,

    /// Optional winner bid account — pass when `auction.highest_bidder`
    /// is non-default. The flip to `Won` prevents the winner from
    /// later calling refund_bid and draining the seller payout back.
    #[account(
        mut,
        seeds = [BID_SEED, auction.key().as_ref(), auction.highest_bidder.as_ref()],
        bump = winner_bid.bump,
        constraint = winner_bid.auction == auction.key() @ AuctionsError::InvalidBidState,
        constraint = winner_bid.bidder == auction.highest_bidder @ AuctionsError::InvalidBidState,
    )]
    pub winner_bid: Box<Account<'info, SealedBid>>,

    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump,
    )]
    pub config: Box<Account<'info, AuctionConfig>>,

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

    /// Seller's payment account — receives winning bid minus fee.
    #[account(
        mut,
        token::mint = payment_mint,
        token::authority = seller,
        token::token_program = payment_token_program,
    )]
    pub seller_payment_account: Box<InterfaceAccount<'info, TokenAccount>>,

    /// CHECK: must match auction.seller.
    #[account(address = auction.seller @ AuctionsError::Unauthorized)]
    pub seller: UncheckedAccount<'info>,

    #[account(
        mut,
        address = config.treasury @ AuctionsError::TreasuryMismatch,
        token::mint = payment_mint,
        token::token_program = payment_token_program,
    )]
    pub treasury: Box<InterfaceAccount<'info, TokenAccount>>,

    pub payment_token_program: Interface<'info, TokenInterface>,
}

pub fn handle_settle_auction(ctx: Context<SettleAuction>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;

    {
        let auction = &ctx.accounts.auction;
        require!(
            auction.status == AuctionStatus::CommitPhase,
            AuctionsError::AuctionClosed
        );
        require!(
            now >= auction.reveal_ends_at,
            AuctionsError::NotSettlePhase
        );
        require!(
            auction.highest_bidder != Pubkey::default(),
            AuctionsError::InvalidBidState
        );
        require!(
            ctx.accounts.winner_bid.status == BidStatus::Revealed,
            AuctionsError::InvalidBidState
        );
        require!(
            auction.payment_mint == ctx.accounts.payment_mint.key(),
            AuctionsError::TreasuryMismatch
        );
    }

    let auction_seller_key = ctx.accounts.auction.seller;
    let auction_id_bytes = ctx.accounts.auction.auction_id.to_le_bytes();
    let auction_bump = ctx.accounts.auction.bump;
    let winning_bid = ctx.accounts.auction.highest_bid;
    let decimals = ctx.accounts.payment_mint.decimals;

    let fee_bps = ctx.accounts.config.fee_bps as u64;
    let fee = winning_bid
        .checked_mul(fee_bps)
        .and_then(|v| v.checked_div(BPS_DENOMINATOR))
        .ok_or(AuctionsError::ArithmeticOverflow)?;
    let seller_share = winning_bid
        .checked_sub(fee)
        .ok_or(AuctionsError::ArithmeticOverflow)?;

    let signer_seeds: &[&[u8]] = &[
        AUCTION_SEED,
        auction_seller_key.as_ref(),
        auction_id_bytes.as_ref(),
        std::slice::from_ref(&auction_bump),
    ];

    if fee > 0 {
        let cpi_accounts = TransferChecked {
            from: ctx.accounts.vault.to_account_info(),
            mint: ctx.accounts.payment_mint.to_account_info(),
            to: ctx.accounts.treasury.to_account_info(),
            authority: ctx.accounts.auction.to_account_info(),
        };
        transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.payment_token_program.key(),
                cpi_accounts,
                &[signer_seeds],
            ),
            fee,
            decimals,
        )?;
    }

    {
        let cpi_accounts = TransferChecked {
            from: ctx.accounts.vault.to_account_info(),
            mint: ctx.accounts.payment_mint.to_account_info(),
            to: ctx.accounts.seller_payment_account.to_account_info(),
            authority: ctx.accounts.auction.to_account_info(),
        };
        transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.payment_token_program.key(),
                cpi_accounts,
                &[signer_seeds],
            ),
            seller_share,
            decimals,
        )?;
    }

    // Flip state AFTER transfers succeed.
    let auction_key = ctx.accounts.auction.key();
    let winner = ctx.accounts.auction.highest_bidder;

    let winner_bid = &mut ctx.accounts.winner_bid;
    winner_bid.status = BidStatus::Won;

    let auction = &mut ctx.accounts.auction;
    auction.status = AuctionStatus::Settled;
    auction.settled_at = now;

    emit!(AuctionSettled {
        auction: auction_key,
        seller: auction_seller_key,
        winner,
        winning_bid,
        seller_share,
        fee,
        timestamp: now,
    });
    Ok(())
}
