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

#[program]
pub mod tip_jar {
    use super::*;

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
}
