mod common;

use common::{PlanFixture, PERIOD_DAY, USDC_UNIT};
use solana_signer::Signer;

#[test]
fn subscribe_charges_first_period_and_sets_state() {
    let price = 10 * USDC_UNIT;
    let period = PERIOD_DAY * 30;
    let mut fx = PlanFixture::new(price, period);

    let (subscriber, subscriber_ata, subscription_pda) = fx.new_subscriber(100 * USDC_UNIT);
    let approve = 60 * USDC_UNIT; // enough for 6 periods

    fx.subscribe(&subscriber, &subscriber_ata, &subscription_pda, approve)
        .unwrap();

    assert_eq!(fx.ctx.token_balance(&subscriber_ata), 100 * USDC_UNIT - price);
    assert_eq!(fx.ctx.token_balance(&fx.vault), price);

    let sub = fx.ctx.get_subscription(&subscription_pda);
    assert_eq!(sub.plan, fx.plan);
    assert_eq!(sub.subscriber, subscriber.pubkey());
    assert_eq!(sub.charge_count, 1);
    assert_eq!(sub.total_paid, price);
    assert_eq!(sub.started_at, fx.ctx.now());
    assert_eq!(sub.last_charged_at, fx.ctx.now());
    assert_eq!(sub.next_charge_at, fx.ctx.now() + period);
    assert_eq!(sub.status, subscription::state::SubscriptionStatus::Active);
    assert_eq!(sub.cancelled_at, 0);

    let plan = fx.ctx.get_plan(&fx.plan);
    assert_eq!(plan.subscriber_count, 1);
    assert_eq!(plan.total_collected, price);
}

#[test]
fn subscribe_rejects_approve_below_price() {
    let price = 10 * USDC_UNIT;
    let mut fx = PlanFixture::new(price, PERIOD_DAY);

    let (subscriber, subscriber_ata, subscription_pda) = fx.new_subscriber(100 * USDC_UNIT);
    let too_small = price - 1;

    let res = fx.subscribe(&subscriber, &subscriber_ata, &subscription_pda, too_small);
    assert!(res.is_err(), "approve < price must be rejected");
}

#[test]
fn subscribe_fails_when_subscriber_has_insufficient_balance() {
    let price = 10 * USDC_UNIT;
    let mut fx = PlanFixture::new(price, PERIOD_DAY);

    let (subscriber, subscriber_ata, subscription_pda) = fx.new_subscriber(price - 1);

    let res = fx.subscribe(&subscriber, &subscriber_ata, &subscription_pda, 100 * USDC_UNIT);
    assert!(res.is_err(), "insufficient balance at first charge must fail");
}

#[test]
fn subscribe_rejects_second_subscribe_to_same_plan() {
    let price = 10 * USDC_UNIT;
    let mut fx = PlanFixture::new(price, PERIOD_DAY);

    let (subscriber, subscriber_ata, subscription_pda) = fx.new_subscriber(100 * USDC_UNIT);
    fx.subscribe(&subscriber, &subscriber_ata, &subscription_pda, 100 * USDC_UNIT)
        .unwrap();

    let res = fx.subscribe(&subscriber, &subscriber_ata, &subscription_pda, 100 * USDC_UNIT);
    assert!(res.is_err(), "duplicate subscribe must fail");
}
