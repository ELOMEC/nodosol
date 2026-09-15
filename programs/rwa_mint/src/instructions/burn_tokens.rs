use anchor_lang::prelude::*;
use anchor_spl::{
    token_2022::{burn, Burn},
    token_interface::{Mint, TokenAccount, TokenInterface},
};

use crate::{
    constants::ASSET_SEED,
    error::RwaMintError,
    events::AssetTokensBurned,
    state::Asset,
};

#[derive(Accounts)]
pub struct BurnTokens<'info> {
    #[account(mut)]
    pub issuer_owner: Signer<'info>,

    #[account(
        mut,
        seeds = [ASSET_SEED, asset.issuer_owner.as_ref(), &asset.asset_id.to_le_bytes()],
        bump = asset.bump,
        has_one = mint,
        constraint = asset.issuer_owner == issuer_owner.key(),
    )]
    pub asset: Box<Account<'info, Asset>>,

    #[account(mut)]
    pub mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(
        mut,
        token::mint = mint,
        token::authority = issuer_owner,
    )]
    pub issuer_token_account: Box<InterfaceAccount<'info, TokenAccount>>,

    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handle_burn_tokens(ctx: Context<BurnTokens>, amount: u64) -> Result<()> {
    require!(amount > 0, RwaMintError::InvalidQuantity);

    let asset = &mut ctx.accounts.asset;
    let circulating = asset.circulating_supply();
    require!(amount <= circulating, RwaMintError::BurnExceedsSupply);

    let cpi_accounts = Burn {
        mint: ctx.accounts.mint.to_account_info(),
        from: ctx.accounts.issuer_token_account.to_account_info(),
        authority: ctx.accounts.issuer_owner.to_account_info(),
    };
    burn(
        CpiContext::new(ctx.accounts.token_program.key(), cpi_accounts),
        amount,
    )?;

    asset.burned_amount = asset
        .burned_amount
        .checked_add(amount)
        .ok_or(RwaMintError::ArithmeticOverflow)?;
    asset.updated_at = Clock::get()?.unix_timestamp;

    emit!(AssetTokensBurned {
        mint: asset.mint,
        amount,
        remaining: asset.circulating_supply(),
        timestamp: asset.updated_at,
    });

    Ok(())
}
