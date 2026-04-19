use anchor_lang::prelude::*;
use anchor_spl::token_interface::{
    self, CloseAccount, Mint, TokenAccount, TokenInterface,
};

use crate::{
    constants::{CREATOR_SEED, VAULT_SEED},
    error::TipJarError,
    events::CreatorProfileClosed,
    state::CreatorProfile,
};

#[derive(Accounts)]
pub struct CloseCreatorProfile<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        mut,
        seeds = [CREATOR_SEED, owner.key().as_ref()],
        bump = creator_profile.bump,
        has_one = owner @ TipJarError::Unauthorized,
        has_one = mint @ TipJarError::MintMismatch,
        has_one = vault,
        close = owner,
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

pub fn handle_close_creator_profile(ctx: Context<CloseCreatorProfile>) -> Result<()> {
    require!(
        ctx.accounts.vault.amount == 0,
        TipJarError::VaultNotEmpty
    );

    let owner_key = ctx.accounts.creator_profile.owner;
    let bump = ctx.accounts.creator_profile.bump;
    let signer_seeds: &[&[&[u8]]] = &[&[CREATOR_SEED, owner_key.as_ref(), &[bump]]];

    let cpi_accounts = CloseAccount {
        account: ctx.accounts.vault.to_account_info(),
        destination: ctx.accounts.owner.to_account_info(),
        authority: ctx.accounts.creator_profile.to_account_info(),
    };
    token_interface::close_account(CpiContext::new_with_signer(
        ctx.accounts.token_program.key(),
        cpi_accounts,
        signer_seeds,
    ))?;

    emit!(CreatorProfileClosed {
        creator: owner_key,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}
