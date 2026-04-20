use anchor_lang::prelude::*;

use crate::{
    constants::ASSET_SEED,
    error::RwaMintError,
    events::AssetClosed,
    state::{Asset, AssetStatus},
};

#[derive(Accounts)]
pub struct CloseAsset<'info> {
    #[account(mut)]
    pub issuer_owner: Signer<'info>,

    #[account(
        mut,
        close = issuer_owner,
        seeds = [ASSET_SEED, asset.issuer_owner.as_ref(), &asset.asset_id.to_le_bytes()],
        bump = asset.bump,
        constraint = asset.issuer_owner == issuer_owner.key(),
        constraint = asset.status == AssetStatus::Retired @ RwaMintError::AssetStatusInvalid,
        constraint = asset.circulating_supply() == 0 @ RwaMintError::SupplyStillCirculating,
    )]
    pub asset: Account<'info, Asset>,
}

pub fn handle_close_asset(ctx: Context<CloseAsset>) -> Result<()> {
    let mint = ctx.accounts.asset.mint;
    emit!(AssetClosed {
        mint,
        timestamp: Clock::get()?.unix_timestamp,
    });
    Ok(())
}
