pub mod constants;
pub mod error;
pub mod events;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use error::*;
pub use events::*;
pub use instructions::*;
pub use state::*;

declare_id!("C2bM3p1Cco4bDj6gQe29k7UWcepxLCrVgiPPoidh549P");

#[cfg(not(feature = "no-entrypoint"))]
solana_security_txt::security_txt! {
    name: "Nodosol — Tip Jar",
    project_url: "https://nodosol.com",
    contacts: "email:security@nodosol.com,link:https://nodosol.com/security",
    policy: "https://nodosol.com/security",
    preferred_languages: "en",
    source_code: "https://github.com/ELOMEC/nodosol"
}

#[program]
pub mod tip_jar {
    use super::*;

    pub fn initialize_config(
        ctx: Context<InitializeConfig>,
        fee_bps: u16,
    ) -> Result<()> {
        handle_initialize_config(ctx, fee_bps)
    }

    pub fn update_fee_bps(ctx: Context<UpdateFeeBps>, new_fee_bps: u16) -> Result<()> {
        handle_update_fee_bps(ctx, new_fee_bps)
    }

    pub fn update_treasury(ctx: Context<UpdateTreasury>) -> Result<()> {
        handle_update_treasury(ctx)
    }

    pub fn update_config_authority(ctx: Context<UpdateConfigAuthority>) -> Result<()> {
        handle_update_authority(ctx)
    }

    pub fn update_pause(ctx: Context<UpdatePause>, paused: bool) -> Result<()> {
        handle_update_pause(ctx, paused)
    }

    pub fn initialize_creator(ctx: Context<InitializeCreator>) -> Result<()> {
        handle_initialize_creator(ctx)
    }

    pub fn send_tip(ctx: Context<SendTip>, amount: u64) -> Result<()> {
        handle_send_tip(ctx, amount)
    }

    pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
        handle_withdraw(ctx, amount)
    }

    pub fn update_elgamal_pubkey(
        ctx: Context<UpdateElgamalPubkey>,
        new_pubkey: [u8; 32],
    ) -> Result<()> {
        handle_update_elgamal_pubkey(ctx, new_pubkey)
    }

    pub fn close_creator_profile(ctx: Context<CloseCreatorProfile>) -> Result<()> {
        handle_close_creator_profile(ctx)
    }
}
