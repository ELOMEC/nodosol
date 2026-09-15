mod common;

use common::{cancel_ix, PlanFixture, PERIOD_DAY, USDC_UNIT};
use solana_keypair::Keypair;
use solana_signer::Signer;

fn subscribed_fixture() -> (PlanFixture, Keypair, solana_pubkey::Pubkey) {
    let mut fx = PlanFixture::new(10 * USDC_UNIT, PERIOD_DAY);
    let (subscriber, subscriber_ata, subscription_pda) = fx.new_subscriber(100 * USDC_UNIT);
    fx.subscribe(&subscriber, &subscriber_ata, &subscription_pda, 100 * USDC_UNIT)
        .unwrap();
    (fx, subscriber, subscription_pda)
}

#[test]
fn cancel_by_subscriber_sets_status_and_decrements_count() {
    let (mut fx, subscriber, subscription_pda) = subscribed_fixture();

    let before = fx.ctx.get_plan(&fx.plan);
    assert_eq!(before.subscriber_count, 1);

    let ix = cancel_ix(
        &fx.ctx.program_id,
        &subscriber.pubkey(),
        &fx.plan,
        &subscription_pda,
    );
    fx.ctx.send(ix, &subscriber, &[]).unwrap();

    let sub = fx.ctx.get_subscription(&subscription_pda);
    assert_eq!(sub.status, subscription::state::SubscriptionStatus::Cancelled);
    assert_eq!(sub.cancelled_at, fx.ctx.now());

    let plan = fx.ctx.get_plan(&fx.plan);
    assert_eq!(plan.subscriber_count, 0);
}

#[test]
fn cancel_by_creator_is_allowed() {
    let (mut fx, _subscriber, subscription_pda) = subscribed_fixture();

    let ix = cancel_ix(
        &fx.ctx.program_id,
        &fx.creator.pubkey(),
        &fx.plan,
        &subscription_pda,
    );
    let creator_signer = fx.creator.insecure_clone();
    fx.ctx.send(ix, &creator_signer, &[]).unwrap();

    let sub = fx.ctx.get_subscription(&subscription_pda);
    assert_eq!(sub.status, subscription::state::SubscriptionStatus::Cancelled);
}

#[test]
fn cancel_rejects_third_party() {
    let (mut fx, _subscriber, subscription_pda) = subscribed_fixture();

    let attacker = Keypair::new();
    fx.ctx.fund(&attacker.pubkey(), 5_000_000_000);

    let ix = cancel_ix(
        &fx.ctx.program_id,
        &attacker.pubkey(),
        &fx.plan,
        &subscription_pda,
    );
    let res = fx.ctx.send(ix, &attacker, &[]);
    assert!(res.is_err(), "third-party cancel must fail");
}

#[test]
fn cancel_rejects_already_cancelled() {
    let (mut fx, subscriber, subscription_pda) = subscribed_fixture();

    let ix1 = cancel_ix(
        &fx.ctx.program_id,
        &subscriber.pubkey(),
        &fx.plan,
        &subscription_pda,
    );
    fx.ctx.send(ix1, &subscriber, &[]).unwrap();

    let ix2 = cancel_ix(
        &fx.ctx.program_id,
        &subscriber.pubkey(),
        &fx.plan,
        &subscription_pda,
    );
    let res = fx.ctx.send(ix2, &subscriber, &[]);
    assert!(res.is_err(), "double-cancel must fail");
}
