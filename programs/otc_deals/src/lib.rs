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

declare_id!("FmXBAWoSGanaFfP8p9gekgrFn7buEn1XUSFWebDr3Pwz");

#[cfg(not(feature = "no-entrypoint"))]
solana_security_txt::security_txt! {
    name: "Nodosol — OTC Deals",
    project_url: "https://nodosol.com",
    contacts: "email:security@nodosol.com,link:https://nodosol.com/security",
    policy: "https://nodosol.com/security",
    preferred_languages: "en",
    source_code: "https://github.com/ELOMEC/nodosol"
}

#[program]
pub mod otc_deals {
    use super::*;

    pub fn initialize_config(ctx: Context<InitializeConfig>, fee_bps: u16) -> Result<()> {
        handle_initialize_config(ctx, fee_bps)
    }

    pub fn update_fee_bps(ctx: Context<UpdateFeeBps>, new_fee_bps: u16) -> Result<()> {
        handle_update_fee_bps(ctx, new_fee_bps)
    }

    pub fn update_treasury(ctx: Context<UpdateTreasury>) -> Result<()> {
        handle_update_treasury(ctx)
    }

    pub fn update_config_authority(ctx: Context<UpdateConfigAuthority>) -> Result<()> {
        handle_update_config_authority(ctx)
    }

    pub fn update_pause(ctx: Context<UpdatePause>, paused: bool) -> Result<()> {
        handle_update_pause(ctx, paused)
    }

    pub fn propose_deal(
        ctx: Context<ProposeDeal>,
        deal_id: u64,
        quantity: u64,
        total_price: u64,
        expires_at: i64,
        memo_hash: [u8; 32],
    ) -> Result<()> {
        handle_propose_deal(ctx, deal_id, quantity, total_price, expires_at, memo_hash)
    }

    pub fn accept_deal(ctx: Context<AcceptDeal>) -> Result<()> {
        handle_accept_deal(ctx)
    }

    pub fn cancel_deal(ctx: Context<CancelDeal>) -> Result<()> {
        handle_cancel_deal(ctx)
    }

    pub fn expire_deal(ctx: Context<ExpireDeal>) -> Result<()> {
        handle_expire_deal(ctx)
    }
}
