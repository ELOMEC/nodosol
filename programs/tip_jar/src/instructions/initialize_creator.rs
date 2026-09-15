use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use crate::{
    constants::{CREATOR_SEED, VAULT_SEED},
    events::CreatorInitialized,
    state::CreatorProfile,
};

#[derive(Accounts)]
pub struct InitializeCreator<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        init,
        payer = owner,
        space = 8 + CreatorProfile::INIT_SPACE,
        seeds = [CREATOR_SEED, owner.key().as_ref()],
        bump,
    )]
    pub creator_profile: Account<'info, CreatorProfile>,

    #[account(
        init,
        payer = owner,
        seeds = [VAULT_SEED, creator_profile.key().as_ref()],
        bump,
        token::mint = mint,
        token::authority = creator_profile,
        token::token_program = token_program,
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

pub fn handle_initialize_creator(ctx: Context<InitializeCreator>) -> Result<()> {
    let clock = Clock::get()?;
    let profile = &mut ctx.accounts.creator_profile;

    profile.owner = ctx.accounts.owner.key();
    profile.mint = ctx.accounts.mint.key();
    profile.vault = ctx.accounts.vault.key();
    profile.elgamal_pubkey = [0u8; 32];
    profile.total_tips_amount = 0;
    profile.total_tip_count = 0;
    profile.total_withdrawn_amount = 0;
    profile.created_at = clock.unix_timestamp;
    profile.bump = ctx.bumps.creator_profile;
    profile.vault_bump = ctx.bumps.vault;
    profile.reserved = [0u8; 64];

    emit!(CreatorInitialized {
        creator: profile.owner,
        mint: profile.mint,
        vault: profile.vault,
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}
