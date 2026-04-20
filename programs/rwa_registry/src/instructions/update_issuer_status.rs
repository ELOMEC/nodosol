use anchor_lang::prelude::*;

use crate::{
    constants::{CONFIG_SEED, ISSUER_SEED},
    error::RegistryError,
    events::IssuerStatusChanged,
    state::{Issuer, IssuerStatus, RegistryConfig},
};

#[derive(Accounts)]
pub struct UpdateIssuerStatus<'info> {
    pub authority: Signer<'info>,

    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = authority @ RegistryError::Unauthorized,
    )]
    pub config: Account<'info, RegistryConfig>,

    #[account(
        mut,
        seeds = [ISSUER_SEED, issuer.owner.as_ref()],
        bump = issuer.bump,
    )]
    pub issuer: Account<'info, Issuer>,
}

pub fn handle_update_issuer_status(
    ctx: Context<UpdateIssuerStatus>,
    new_status: IssuerStatus,
) -> Result<()> {
    let issuer = &mut ctx.accounts.issuer;
    let previous = issuer.status;

    require!(
        is_transition_allowed(previous, new_status),
        RegistryError::InvalidStatusTransition
    );

    let now = Clock::get()?.unix_timestamp;
    issuer.status = new_status;
    issuer.updated_at = now;

    emit!(IssuerStatusChanged {
        owner: issuer.owner,
        previous,
        next: new_status,
        timestamp: now,
    });

    Ok(())
}

fn is_transition_allowed(from: IssuerStatus, to: IssuerStatus) -> bool {
    use IssuerStatus::*;
    match (from, to) {
        // No-op transitions rejected to make intent explicit.
        (a, b) if a == b => false,
        // Revoked is terminal.
        (Revoked, _) => false,
        // Any non-Revoked state can move to Revoked, Suspended, or Active.
        _ => matches!(to, Pending | Active | Suspended | Revoked),
    }
}
