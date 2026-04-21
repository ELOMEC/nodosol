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

declare_id!("FDUwvXRETURbe2JN2PJNCKt6RPAsSLeSi7A4pFMGmtrE");

#[program]
pub mod event_tickets {
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

    pub fn create_event(
        ctx: Context<CreateEvent>,
        event_id: u64,
        price: u64,
        capacity: u64,
        starts_at: i64,
        ends_at: i64,
        name: String,
        symbol: String,
        metadata_uri: String,
    ) -> Result<()> {
        handle_create_event(
            ctx,
            event_id,
            price,
            capacity,
            starts_at,
            ends_at,
            name,
            symbol,
            metadata_uri,
        )
    }

    pub fn initialize_event_tree(ctx: Context<InitializeEventTree>) -> Result<()> {
        handle_initialize_event_tree(ctx)
    }

    pub fn buy_ticket(ctx: Context<BuyTicket>) -> Result<()> {
        handle_buy_ticket(ctx)
    }

    pub fn create_tier(
        ctx: Context<CreateTier>,
        tier_id: u16,
        name: String,
        section_code: String,
        price: u64,
        capacity: u32,
        color_hex: [u8; 6],
    ) -> Result<()> {
        handle_create_tier(ctx, tier_id, name, section_code, price, capacity, color_hex)
    }

    pub fn update_tier_price(ctx: Context<UpdateTierPrice>, new_price: u64) -> Result<()> {
        handle_update_tier_price(ctx, new_price)
    }

    pub fn update_tier_capacity(
        ctx: Context<UpdateTierCapacity>,
        new_capacity: u32,
    ) -> Result<()> {
        handle_update_tier_capacity(ctx, new_capacity)
    }

    pub fn update_tier_status(
        ctx: Context<UpdateTierStatus>,
        new_status: TierStatus,
    ) -> Result<()> {
        handle_update_tier_status(ctx, new_status)
    }

    pub fn buy_tier_ticket(
        ctx: Context<BuyTierTicket>,
        row_label: String,
        seat_number: u16,
    ) -> Result<()> {
        handle_buy_tier_ticket(ctx, row_label, seat_number)
    }

    pub fn withdraw_event_revenue(
        ctx: Context<WithdrawEventRevenue>,
        amount: u64,
    ) -> Result<()> {
        handle_withdraw_event_revenue(ctx, amount)
    }

    pub fn update_event_status(
        ctx: Context<UpdateEventStatus>,
        new_status: EventStatus,
    ) -> Result<()> {
        handle_update_event_status(ctx, new_status)
    }

    pub fn close_event(ctx: Context<CloseEvent>) -> Result<()> {
        handle_close_event(ctx)
    }

    #[allow(clippy::too_many_arguments)]
    pub fn list_ticket_resale<'info>(
        ctx: Context<'info, ListTicketResale<'info>>,
        leaf_index: u32,
        nonce: u64,
        root: [u8; 32],
        data_hash: [u8; 32],
        creator_hash: [u8; 32],
        price: u64,
        expires_at: i64,
    ) -> Result<()> {
        handle_list_ticket_resale(
            ctx,
            leaf_index,
            nonce,
            root,
            data_hash,
            creator_hash,
            price,
            expires_at,
        )
    }

    pub fn cancel_ticket_resale<'info>(
        ctx: Context<'info, CancelTicketResale<'info>>,
        root: [u8; 32],
        data_hash: [u8; 32],
        creator_hash: [u8; 32],
    ) -> Result<()> {
        handle_cancel_ticket_resale(ctx, root, data_hash, creator_hash)
    }

    pub fn buy_ticket_resale<'info>(
        ctx: Context<'info, BuyTicketResale<'info>>,
        root: [u8; 32],
        data_hash: [u8; 32],
        creator_hash: [u8; 32],
    ) -> Result<()> {
        handle_buy_ticket_resale(ctx, root, data_hash, creator_hash)
    }

    pub fn close_expired_resale<'info>(
        ctx: Context<'info, CloseExpiredResale<'info>>,
        root: [u8; 32],
        data_hash: [u8; 32],
        creator_hash: [u8; 32],
    ) -> Result<()> {
        handle_close_expired_resale(ctx, root, data_hash, creator_hash)
    }

    #[allow(clippy::too_many_arguments)]
    pub fn list_ticket_resale_private<'info>(
        ctx: Context<'info, ListTicketResalePrivate<'info>>,
        leaf_index: u32,
        nonce: u64,
        root: [u8; 32],
        data_hash: [u8; 32],
        creator_hash: [u8; 32],
        price_commit: [u8; 32],
        expires_at: i64,
    ) -> Result<()> {
        handle_list_ticket_resale_private(
            ctx,
            leaf_index,
            nonce,
            root,
            data_hash,
            creator_hash,
            price_commit,
            expires_at,
        )
    }

    pub fn buy_ticket_resale_private<'info>(
        ctx: Context<'info, BuyTicketResalePrivate<'info>>,
        root: [u8; 32],
        data_hash: [u8; 32],
        creator_hash: [u8; 32],
        revealed_price: u64,
        price_nonce: [u8; 32],
    ) -> Result<()> {
        handle_buy_ticket_resale_private(
            ctx,
            root,
            data_hash,
            creator_hash,
            revealed_price,
            price_nonce,
        )
    }
}
