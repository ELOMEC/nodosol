use anchor_lang::prelude::*;
use anchor_spl::{
    token_2022::{transfer_checked, TransferChecked},
    token_interface::{Mint, TokenAccount, TokenInterface},
};

use crate::{
    constants::{DEAL_SEED, MAX_EXPIRY_OFFSET_SECS, MIN_EXPIRY_OFFSET_SECS, VAULT_SEED},
    error::OtcError,
    events::DealProposed,
    state::{Deal, DealStatus},
};

#[derive(Accounts)]
#[instruction(deal_id: u64)]
pub struct ProposeDeal<'info> {
    #[account(mut)]
    pub seller: Signer<'info>,

    /// CHECK: only the pubkey is stored; buyer does not sign here.
    pub buyer: UncheckedAccount<'info>,

    pub asset_mint: Box<InterfaceAccount<'info, Mint>>,
    pub payment_mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(
        init,
        payer = seller,
        space = 8 + Deal::INIT_SPACE,
        seeds = [DEAL_SEED, seller.key().as_ref(), buyer.key().as_ref(), &deal_id.to_le_bytes()],
        bump,
    )]
    pub deal: Box<Account<'info, Deal>>,

    #[account(
        init,
        payer = seller,
        seeds = [VAULT_SEED, deal.key().as_ref()],
        bump,
        token::mint = asset_mint,
        token::authority = deal,
        token::token_program = asset_token_program,
    )]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(
        mut,
        token::mint = asset_mint,
        token::authority = seller,
        token::token_program = asset_token_program,
    )]
    pub seller_asset_account: Box<InterfaceAccount<'info, TokenAccount>>,

    pub asset_token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

pub fn handle_propose_deal(
    ctx: Context<ProposeDeal>,
    deal_id: u64,
    quantity: u64,
    total_price: u64,
    expires_at: i64,
    memo_hash: [u8; 32],
) -> Result<()> {
    require!(quantity > 0, OtcError::InvalidQuantity);
    require!(total_price > 0, OtcError::InvalidPrice);
    require!(
        ctx.accounts.seller.key() != ctx.accounts.buyer.key(),
        OtcError::SelfDeal
    );

    let now = Clock::get()?.unix_timestamp;
    let offset = expires_at
        .checked_sub(now)
        .ok_or(OtcError::ArithmeticOverflow)?;
    require!(
        (MIN_EXPIRY_OFFSET_SECS..=MAX_EXPIRY_OFFSET_SECS).contains(&offset),
        OtcError::InvalidExpiry
    );

    let asset_decimals = ctx.accounts.asset_mint.decimals;

    // Escrow the asset tokens.
    let cpi_accounts = TransferChecked {
        from: ctx.accounts.seller_asset_account.to_account_info(),
        mint: ctx.accounts.asset_mint.to_account_info(),
        to: ctx.accounts.vault.to_account_info(),
        authority: ctx.accounts.seller.to_account_info(),
    };
    transfer_checked(
        CpiContext::new(ctx.accounts.asset_token_program.key(), cpi_accounts),
        quantity,
        asset_decimals,
    )?;

    let deal = &mut ctx.accounts.deal;
    deal.seller = ctx.accounts.seller.key();
    deal.buyer = ctx.accounts.buyer.key();
    deal.asset_mint = ctx.accounts.asset_mint.key();
    deal.payment_mint = ctx.accounts.payment_mint.key();
    deal.deal_id = deal_id;
    deal.quantity = quantity;
    deal.total_price = total_price;
    deal.status = DealStatus::Proposed;
    deal.expires_at = expires_at;
    deal.created_at = now;
    deal.updated_at = now;
    deal.memo_hash = memo_hash;
    deal.bump = ctx.bumps.deal;
    deal.vault_bump = ctx.bumps.vault;
    deal.reserved = [0u8; 32];

    emit!(DealProposed {
        seller: deal.seller,
        buyer: deal.buyer,
        asset_mint: deal.asset_mint,
        payment_mint: deal.payment_mint,
        deal_id,
        quantity,
        total_price,
        expires_at,
        memo_hash,
        timestamp: now,
    });
    Ok(())
}
