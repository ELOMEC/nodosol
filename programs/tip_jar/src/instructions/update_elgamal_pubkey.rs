use anchor_lang::prelude::*;

use crate::{
    constants::CREATOR_SEED,
    error::TipJarError,
    events::ElgamalPubkeyUpdated,
    state::CreatorProfile,
};

#[derive(Accounts)]
pub struct UpdateElgamalPubkey<'info> {
    pub owner: Signer<'info>,

    #[account(
        mut,
        seeds = [CREATOR_SEED, owner.key().as_ref()],
        bump = creator_profile.bump,
        has_one = owner @ TipJarError::Unauthorized,
    )]
    pub creator_profile: Account<'info, CreatorProfile>,
}

pub fn handle_update_elgamal_pubkey(
    ctx: Context<UpdateElgamalPubkey>,
    new_pubkey: [u8; 32],
) -> Result<()> {
    let profile = &mut ctx.accounts.creator_profile;
    profile.elgamal_pubkey = new_pubkey;

    emit!(ElgamalPubkeyUpdated {
        creator: profile.owner,
        new_pubkey,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}
