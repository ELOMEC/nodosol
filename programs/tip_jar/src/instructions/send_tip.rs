use anchor_lang::prelude::*;
use anchor_spl::token_interface::{
    self, Mint, TokenAccount, TokenInterface, TransferChecked,
};

use crate::{
    constants::{BPS_DENOMINATOR, CONFIG_SEED, CREATOR_SEED, VAULT_SEED},
    error::TipJarError,
    events::TipSent,
    state::{Config, CreatorProfile},
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
    pub tipper_token_account: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(
        mut,
        seeds = [CREATOR_SEED, creator_profile.owner.as_ref()],
        bump = creator_profile.bump,
        has_one = mint @ TipJarError::MintMismatch,
        has_one = vault,
    )]
    pub creator_profile: Box<Account<'info, CreatorProfile>>,

    #[account(
        mut,
        seeds = [VAULT_SEED, creator_profile.key().as_ref()],
        bump = creator_profile.vault_bump,
        token::mint = mint,
        token::authority = creator_profile,
    )]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump,
    )]
    pub config: Box<Account<'info, Config>>,

    #[account(
        mut,
        address = config.treasury @ TipJarError::TreasuryMismatch,
        token::mint = mint,
    )]
    pub treasury: Box<InterfaceAccount<'info, TokenAccount>>,

    pub mint: Box<InterfaceAccount<'info, Mint>>,

    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handle_send_tip(ctx: Context<SendTip>, amount: u64) -> Result<()> {
    require!(!ctx.accounts.config.paused, TipJarError::Paused);
    require!(amount > 0, TipJarError::InvalidTipAmount);

    let decimals = ctx.accounts.mint.decimals;
    let fee_bps = ctx.accounts.config.fee_bps as u64;
    let fee = amount
        .checked_mul(fee_bps)
        .and_then(|v| v.checked_div(BPS_DENOMINATOR))
        .ok_or(TipJarError::ArithmeticOverflow)?;
    let creator_amount = amount
        .checked_sub(fee)
        .ok_or(TipJarError::ArithmeticOverflow)?;

    // Fee split: route platform fee to treasury first, then creator share.
    if fee > 0 {
        let cpi_accounts = TransferChecked {
            from: ctx.accounts.tipper_token_account.to_account_info(),
            mint: ctx.accounts.mint.to_account_info(),
            to: ctx.accounts.treasury.to_account_info(),
            authority: ctx.accounts.tipper.to_account_info(),
        };
        token_interface::transfer_checked(
            CpiContext::new(ctx.accounts.token_program.key(), cpi_accounts),
            fee,
            decimals,
        )?;
    }

    let cpi_accounts = TransferChecked {
        from: ctx.accounts.tipper_token_account.to_account_info(),
        mint: ctx.accounts.mint.to_account_info(),
        to: ctx.accounts.vault.to_account_info(),
        authority: ctx.accounts.tipper.to_account_info(),
    };
    token_interface::transfer_checked(
        CpiContext::new(ctx.accounts.token_program.key(), cpi_accounts),
        creator_amount,
        decimals,
    )?;

    let profile = &mut ctx.accounts.creator_profile;
    profile.total_tips_amount = profile
        .total_tips_amount
        .checked_add(creator_amount)
        .ok_or(TipJarError::ArithmeticOverflow)?;
    profile.total_tip_count = profile
        .total_tip_count
        .checked_add(1)
        .ok_or(TipJarError::ArithmeticOverflow)?;

    emit!(TipSent {
        tipper: ctx.accounts.tipper.key(),
        creator: profile.owner,
        mint: profile.mint,
        amount: creator_amount,
        total_tips_amount: profile.total_tips_amount,
        total_tip_count: profile.total_tip_count,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}
