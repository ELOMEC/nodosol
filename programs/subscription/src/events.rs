use anchor_lang::prelude::*;

#[event]
pub struct PlanCreated {
    pub plan: Pubkey,
    pub creator: Pubkey,
    pub mint: Pubkey,
    pub plan_id: u64,
    pub price_per_period: u64,
    pub period_seconds: i64,
    pub timestamp: i64,
}

#[event]
pub struct Subscribed {
    pub plan: Pubkey,
    pub subscription: Pubkey,
    pub subscriber: Pubkey,
    pub first_charge_amount: u64,
    pub next_charge_at: i64,
    pub timestamp: i64,
}

#[event]
pub struct SubscriptionCharged {
    pub plan: Pubkey,
    pub subscription: Pubkey,
    pub subscriber: Pubkey,
    pub amount: u64,
    pub charge_count: u64,
    pub total_paid: u64,
    pub next_charge_at: i64,
    pub timestamp: i64,
}

#[event]
pub struct SubscriptionCancelled {
    pub plan: Pubkey,
    pub subscription: Pubkey,
    pub subscriber: Pubkey,
    pub cancelled_by: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct PlanRevenueWithdrawn {
    pub plan: Pubkey,
    pub creator: Pubkey,
    pub amount: u64,
    pub total_withdrawn: u64,
    pub timestamp: i64,
}

#[event]
pub struct PlanStatusUpdated {
    pub plan: Pubkey,
    pub creator: Pubkey,
    pub active: bool,
    pub timestamp: i64,
}

#[event]
pub struct PlanClosed {
    pub plan: Pubkey,
    pub creator: Pubkey,
    pub timestamp: i64,
}
