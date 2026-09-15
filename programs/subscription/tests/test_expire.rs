mod common;

use common::{expire_ix, PlanFixture, PERIOD_DAY, USDC_UNIT};
use solana_keypair::Keypair;
use solana_signer::Signer;
use subscription::state::SubscriptionStatus;

const EXPIRE_GRACE_SECONDS: i64 = 604_800;

fn expire(
    fx: &PlanFixture,
    cranker: &solana_pubkey::Pubkey,
    subscription_pda: &solana_pubkey::Pubkey,
) -> anchor_lang::solana_program::instruction::Instruction {
    expire_ix(&fx.ctx.program_id, cranker, &fx.plan, subscription_pda)
}

#[test]
fn expire_rejects_before_grace_elapses() {
    let mut fx = PlanFixture::new(10 * USDC_UNIT, PERIOD_DAY);
    let (subscriber, subscriber_ata, subscription_pda) = fx.new_subscriber(100 * USDC_UNIT);
    fx.subscribe(&subscriber, &subscriber_ata, &subscription_pda, 100 * USDC_UNIT)
        .unwrap();

    let cranker = Keypair::new();
    fx.ctx.fund(&cranker.pubkey(), 5_000_000_000);

    fx.ctx.advance_time(PERIOD_DAY + EXPIRE_GRACE_SECONDS - 1);

    let res = fx.ctx.send(
        expire(&fx, &cranker.pubkey(), &subscription_pda),
        &cranker,
        &[],
    );
    assert!(res.is_err(), "expire before grace must be rejected");
}

#[test]
fn expire_after_grace_marks_expired_and_decrements_subscribers() {
    let mut fx = PlanFixture::new(10 * USDC_UNIT, PERIOD_DAY);
    let (subscriber, subscriber_ata, subscription_pda) = fx.new_subscriber(100 * USDC_UNIT);
    fx.subscribe(&subscriber, &subscriber_ata, &subscription_pda, 100 * USDC_UNIT)
        .unwrap();

    assert_eq!(fx.ctx.get_plan(&fx.plan).subscriber_count, 1);

    let cranker = Keypair::new();
    fx.ctx.fund(&cranker.pubkey(), 5_000_000_000);

    fx.ctx.advance_time(PERIOD_DAY + EXPIRE_GRACE_SECONDS + 1);

    fx.ctx
        .send(
            expire(&fx, &cranker.pubkey(), &subscription_pda),
            &cranker,
            &[],
        )
        .unwrap();

    let sub = fx.ctx.get_subscription(&subscription_pda);
    assert_eq!(sub.status, SubscriptionStatus::Expired);
    assert_eq!(sub.cancelled_at, fx.ctx.now());

    let plan = fx.ctx.get_plan(&fx.plan);
    assert_eq!(plan.subscriber_count, 0);
}

#[test]
fn expire_rejects_if_already_cancelled() {
    use common::cancel_ix;

    let mut fx = PlanFixture::new(10 * USDC_UNIT, PERIOD_DAY);
    let (subscriber, subscriber_ata, subscription_pda) = fx.new_subscriber(100 * USDC_UNIT);
    fx.subscribe(&subscriber, &subscriber_ata, &subscription_pda, 100 * USDC_UNIT)
        .unwrap();

    fx.ctx
        .send(
            cancel_ix(&fx.ctx.program_id, &subscriber.pubkey(), &fx.plan, &subscription_pda),
            &subscriber,
            &[],
        )
        .unwrap();

    let cranker = Keypair::new();
    fx.ctx.fund(&cranker.pubkey(), 5_000_000_000);

    fx.ctx.advance_time(PERIOD_DAY + EXPIRE_GRACE_SECONDS + 1);

    let res = fx.ctx.send(
        expire(&fx, &cranker.pubkey(), &subscription_pda),
        &cranker,
        &[],
    );
    assert!(res.is_err(), "expire on cancelled subscription must be rejected");
}
