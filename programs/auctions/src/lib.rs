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

declare_id!("6c95kxTWCXacsAev4xnvNbKnLYWFGPpJT5zwT4SnWh5v");

#[cfg(not(feature = "no-entrypoint"))]
solana_security_txt::security_txt! {
    name: "Nodosol — Auctions",
    project_url: "https://nodosol.com",
    contacts: "email:security@nodosol.com,link:https://nodosol.com/security",
    policy: "https://nodosol.com/security",
    preferred_languages: "en",
    source_code: "https://github.com/ELOMEC/nodosol"
}

#[program]
pub mod auctions {
    use super::*;

    pub fn initialize_auction_config(
        ctx: Context<InitializeAuctionConfig>,
        fee_bps: u16,
    ) -> Result<()> {
        handle_initialize_auction_config(ctx, fee_bps)
    }

    #[allow(clippy::too_many_arguments)]
    pub fn create_auction(
        ctx: Context<CreateAuction>,
        auction_id: u64,
        start_price: u64,
        min_deposit: u64,
        commit_ends_at: i64,
        reveal_ends_at: i64,
        memo: String,
        metadata_uri: String,
    ) -> Result<()> {
        handle_create_auction(
            ctx,
            auction_id,
            start_price,
            min_deposit,
            commit_ends_at,
            reveal_ends_at,
            memo,
            metadata_uri,
        )
    }

    pub fn cancel_auction(ctx: Context<CancelAuction>) -> Result<()> {
        handle_cancel_auction(ctx)
    }

    pub fn commit_bid(
        ctx: Context<CommitBid>,
        commit: [u8; 32],
        escrow: u64,
    ) -> Result<()> {
        handle_commit_bid(ctx, commit, escrow)
    }

    pub fn reveal_bid(
        ctx: Context<RevealBid>,
        bid_amount: u64,
        nonce: [u8; 32],
    ) -> Result<()> {
        handle_reveal_bid(ctx, bid_amount, nonce)
    }

    pub fn settle_auction(ctx: Context<SettleAuction>) -> Result<()> {
        handle_settle_auction(ctx)
    }

    pub fn refund_bid(ctx: Context<RefundBid>) -> Result<()> {
        handle_refund_bid(ctx)
    }

    pub fn update_treasury(ctx: Context<UpdateAuctionTreasury>) -> Result<()> {
        handle_update_auction_treasury(ctx)
    }

    pub fn update_pause(ctx: Context<UpdatePause>, paused: bool) -> Result<()> {
        handle_update_pause(ctx, paused)
    }
}
