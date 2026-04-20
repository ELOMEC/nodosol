use anchor_lang::prelude::*;

use crate::{
    constants::{CONFIG_SEED, ISSUER_SEED},
    error::RegistryError,
    events::IssuerClosed,
    state::{Issuer, IssuerStatus, RegistryConfig},
};

#[derive(Accounts)]
pub struct CloseIssuer<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = authority @ RegistryError::Unauthorized,
    )]
    pub config: Account<'info, RegistryConfig>,

    #[account(
        mut,
        close = authority,
        seeds = [ISSUER_SEED, issuer.owner.as_ref()],
        bump = issuer.bump,
        constraint = issuer.status == IssuerStatus::Revoked @ RegistryError::InvalidStatusTransition,
    )]
    pub issuer: Account<'info, Issuer>,
}

pub fn handle_close_issuer(ctx: Context<CloseIssuer>) -> Result<()> {
    let owner = ctx.accounts.issuer.owner;

    let config = &mut ctx.accounts.config;
    config.issuer_count = config.issuer_count.saturating_sub(1);

    emit!(IssuerClosed {
        owner,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}
