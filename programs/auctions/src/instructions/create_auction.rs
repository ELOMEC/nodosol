use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{Mint, TokenAccount, TokenInterface},
};

use crate::{
    constants::{AUCTION_SEED, MAX_MEMO_LEN, MAX_URI_LEN, VAULT_SEED},
    error::AuctionsError,
    events::AuctionCreated,
    state::{Auction, AuctionStatus},
};

#[derive(Accounts)]
#[instruction(
    auction_id: u64,
)]
pub struct CreateAuction<'info> {
    #[account(mut)]
    pub seller: Signer<'info>,

    #[account(
        init,
        payer = seller,
        space = 8 + Auction::INIT_SPACE,
        seeds = [AUCTION_SEED, seller.key().as_ref(), &auction_id.to_le_bytes()],
        bump,
    )]
    pub auction: Box<Account<'info, Auction>>,

    pub payment_mint: Box<InterfaceAccount<'info, Mint>>,

    /// Vault ATA owned by the auction PDA — holds every bidder's
    /// escrow until settle / refund. Created at auction init.
    #[account(
        init,
        payer = seller,
        seeds = [VAULT_SEED, auction.key().as_ref()],
        bump,
        token::mint = payment_mint,
        token::authority = auction,
        token::token_program = payment_token_program,
    )]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,

    pub payment_token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[allow(clippy::too_many_arguments)]
pub fn handle_create_auction(
    ctx: Context<CreateAuction>,
    auction_id: u64,
    start_price: u64,
    min_deposit: u64,
    commit_ends_at: i64,
    reveal_ends_at: i64,
    memo: String,
    metadata_uri: String,
) -> Result<()> {
    require!(min_deposit > 0, AuctionsError::InvalidMinDeposit);
    require!(memo.len() <= MAX_MEMO_LEN, AuctionsError::InvalidMinDeposit);
    require!(metadata_uri.len() <= MAX_URI_LEN, AuctionsError::InvalidMinDeposit);

    let now = Clock::get()?.unix_timestamp;
    require!(commit_ends_at > now, AuctionsError::InvalidCommitDeadline);
    require!(
        reveal_ends_at > commit_ends_at,
        AuctionsError::InvalidRevealDeadline
    );

    let auction = &mut ctx.accounts.auction;
    auction.seller = ctx.accounts.seller.key();
    auction.auction_id = auction_id;
    auction.payment_mint = ctx.accounts.payment_mint.key();
    auction.vault = ctx.accounts.vault.key();
    auction.start_price = start_price;
    auction.min_deposit = min_deposit;
    auction.created_at = now;
    auction.commit_ends_at = commit_ends_at;
    auction.reveal_ends_at = reveal_ends_at;
    auction.status = AuctionStatus::CommitPhase;
    auction.bid_count = 0;
    auction.revealed_count = 0;
    auction.highest_bid = 0;
    auction.highest_bidder = Pubkey::default();
    auction.settled_at = 0;
    auction.memo = memo;
    auction.metadata_uri = metadata_uri;
    auction.bump = ctx.bumps.auction;
    auction.vault_bump = ctx.bumps.vault;
    auction.reserved = [0u8; 32];

    emit!(AuctionCreated {
        auction: auction.key(),
        seller: auction.seller,
        auction_id,
        start_price,
        min_deposit,
        commit_ends_at,
        reveal_ends_at,
        timestamp: now,
    });
    Ok(())
}
