use anchor_lang::prelude::*;

use crate::{
    constants::ASSET_SEED,
    error::RwaMintError,
    events::AssetStatusChanged,
    state::{Asset, AssetStatus},
};

#[derive(Accounts)]
pub struct UpdateAssetStatus<'info> {
    pub issuer_owner: Signer<'info>,

    #[account(
        mut,
        seeds = [ASSET_SEED, asset.issuer_owner.as_ref(), &asset.asset_id.to_le_bytes()],
        bump = asset.bump,
        constraint = asset.issuer_owner == issuer_owner.key(),
    )]
    pub asset: Account<'info, Asset>,
}

pub fn handle_update_asset_status(
    ctx: Context<UpdateAssetStatus>,
    new_status: AssetStatus,
) -> Result<()> {
    let asset = &mut ctx.accounts.asset;
    let previous = asset.status;

    require!(
        is_transition_allowed(previous, new_status),
        RwaMintError::InvalidStatusTransition
    );

    let now = Clock::get()?.unix_timestamp;
    asset.status = new_status;
    asset.updated_at = now;

    emit!(AssetStatusChanged {
        mint: asset.mint,
        previous,
        next: new_status,
        timestamp: now,
    });

    Ok(())
}

fn is_transition_allowed(from: AssetStatus, to: AssetStatus) -> bool {
    use AssetStatus::*;
    match (from, to) {
        (a, b) if a == b => false,
        (Retired, _) => false,
        _ => matches!(to, Active | Paused | Retired),
    }
}
