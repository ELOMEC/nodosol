use anchor_lang::prelude::*;
use anchor_spl::token_interface::{
    self, Mint, TokenAccount, TokenInterface, TransferChecked,
};

use crate::{
    constants::{CREATOR_SEED, VAULT_SEED},
    error::TipJarError,
    events::TipSent,
    state::CreatorProfile,
};

#[derive(Accounts)]
pub struct SendTip<'info> {
    #[account(mut)]
    pub tipper: Signer<'info>,

    #[account(
        mut,
        token::mint = mint,
        token::authority = tipper,
    )]
    pub tipper_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [CREATOR_SEED, creator_profile.owner.as_ref()],
        bump = creator_profile.bump,
        has_one = mint @ TipJarError::MintMismatch,
        has_one = vault,
    )]
    pub creator_profile: Account<'info, CreatorProfile>,

    #[account(
        mut,
        seeds = [VAULT_SEED, creator_profile.key().as_ref()],
        bump = creator_profile.vault_bump,
        token::mint = mint,
        token::authority = creator_profile,
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,

    pub mint: InterfaceAccount<'info, Mint>,

    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handle_send_tip(ctx: Context<SendTip>, amount: u64) -> Result<()> {
    require!(amount > 0, TipJarError::InvalidTipAmount);

    let decimals = ctx.accounts.mint.decimals;

    let cpi_accounts = TransferChecked {
        from: ctx.accounts.tipper_token_account.to_account_info(),
        mint: ctx.accounts.mint.to_account_info(),
        to: ctx.accounts.vault.to_account_info(),
        authority: ctx.accounts.tipper.to_account_info(),
    };
    let cpi_ctx = CpiContext::new(ctx.accounts.token_program.key(), cpi_accounts);
    token_interface::transfer_checked(cpi_ctx, amount, decimals)?;

    let profile = &mut ctx.accounts.creator_profile;
    profile.total_tips_amount = profile
        .total_tips_amount
        .checked_add(amount)
        .ok_or(TipJarError::ArithmeticOverflow)?;
    profile.total_tip_count = profile
        .total_tip_count
        .checked_add(1)
        .ok_or(TipJarError::ArithmeticOverflow)?;

    emit!(TipSent {
        tipper: ctx.accounts.tipper.key(),
        creator: profile.owner,
        mint: profile.mint,
        amount,
        total_tips_amount: profile.total_tips_amount,
        total_tip_count: profile.total_tip_count,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}
