pub mod constants;
pub mod error;
pub mod events_log;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use error::*;
pub use events_log::*;
pub use instructions::*;
pub use state::*;

declare_id!("4q4KxCcvY7vswq3tXgr448ghXWBtz4PzNfoddZu282Ax");

#[program]
pub mod events {
    use super::*;

    pub fn create_event(
        ctx: Context<CreateEvent>,
        event_id: u64,
        price: u64,
        capacity: u64,
        starts_at: i64,
        ends_at: i64,
        metadata_uri: String,
    ) -> Result<()> {
        handle_create_event(ctx, event_id, price, capacity, starts_at, ends_at, metadata_uri)
    }

    pub fn buy_ticket(ctx: Context<BuyTicket>) -> Result<()> {
        handle_buy_ticket(ctx)
    }

    pub fn check_in(ctx: Context<CheckIn>) -> Result<()> {
        handle_check_in(ctx)
    }

    pub fn withdraw_revenue(ctx: Context<WithdrawRevenue>, amount: u64) -> Result<()> {
        handle_withdraw_revenue(ctx, amount)
    }
}
