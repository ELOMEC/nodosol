mod common;

use anchor_lang::{InstructionData, ToAccountMetas};
use common::{cancel_ix, PlanFixture, PERIOD_DAY, USDC_UNIT};
use solana_keypair::Keypair;
use solana_pubkey::Pubkey;
use solana_signer::Signer;

fn withdraw_ix(
    program_id: &Pubkey,
    creator: &Pubkey,
    plan: &Pubkey,
    vault: &Pubkey,
    destination: &Pubkey,
    mint: &Pubkey,
    token_program: &Pubkey,
    amount: u64,
) -> anchor_lang::solana_program::instruction::Instruction {
    anchor_lang::solana_program::instruction::Instruction {
        program_id: *program_id,
        accounts: subscription::accounts::WithdrawPlanRevenue {
            creator: *creator,
            plan: *plan,
            vault: *vault,
            destination: *destination,
            mint: *mint,
            token_program: *token_program,
        }
        .to_account_metas(None),
        data: subscription::instruction::WithdrawPlanRevenue { amount }.data(),
    }
}

fn close_ix(
    program_id: &Pubkey,
    creator: &Pubkey,
    plan: &Pubkey,
    vault: &Pubkey,
    mint: &Pubkey,
    token_program: &Pubkey,
) -> anchor_lang::solana_program::instruction::Instruction {
    anchor_lang::solana_program::instruction::Instruction {
        program_id: *program_id,
        accounts: subscription::accounts::ClosePlan {
            creator: *creator,
            plan: *plan,
            vault: *vault,
            mint: *mint,
            token_program: *token_program,
        }
        .to_account_metas(None),
        data: subscription::instruction::ClosePlan {}.data(),
    }
}

fn status_ix(
    program_id: &Pubkey,
    creator: &Pubkey,
    plan: &Pubkey,
    active: bool,
) -> anchor_lang::solana_program::instruction::Instruction {
    anchor_lang::solana_program::instruction::Instruction {
        program_id: *program_id,
        accounts: subscription::accounts::UpdatePlanStatus {
            creator: *creator,
            plan: *plan,
        }
        .to_account_metas(None),
        data: subscription::instruction::UpdatePlanStatus { active }.data(),
    }
}

fn subscribed_fixture() -> (PlanFixture, Keypair, Pubkey, Pubkey) {
    let mut fx = PlanFixture::new(10 * USDC_UNIT, PERIOD_DAY);
    let (subscriber, subscriber_ata, subscription_pda) = fx.new_subscriber(100 * USDC_UNIT);
    fx.subscribe(&subscriber, &subscriber_ata, &subscription_pda, 100 * USDC_UNIT)
        .unwrap();
    (fx, subscriber, subscriber_ata, subscription_pda)
}

#[test]
fn withdraw_plan_revenue_transfers_to_creator_ata() {
    let (mut fx, _sub, _sub_ata, _) = subscribed_fixture();
    let creator = fx.creator.insecure_clone();
    let creator_ata = fx.ctx.create_ata(&creator, &creator.pubkey(), &fx.mint);

    let price = fx.price;
    let ix = withdraw_ix(
        &fx.ctx.program_id,
        &creator.pubkey(),
        &fx.plan,
        &fx.vault,
        &creator_ata,
        &fx.mint,
        &fx.ctx.token_program,
        price,
    );
    fx.ctx.send(ix, &creator, &[]).unwrap();

    assert_eq!(fx.ctx.token_balance(&creator_ata), price);
    assert_eq!(fx.ctx.token_balance(&fx.vault), 0);

    let plan = fx.ctx.get_plan(&fx.plan);
    assert_eq!(plan.total_withdrawn, price);
}

#[test]
fn withdraw_plan_revenue_rejects_non_creator() {
    let (mut fx, _sub, _sub_ata, _) = subscribed_fixture();
    let attacker = Keypair::new();
    fx.ctx.fund(&attacker.pubkey(), 5_000_000_000);
    let attacker_ata = fx.ctx.create_ata(&attacker, &attacker.pubkey(), &fx.mint);

    let ix = withdraw_ix(
        &fx.ctx.program_id,
        &attacker.pubkey(),
        &fx.plan,
        &fx.vault,
        &attacker_ata,
        &fx.mint,
        &fx.ctx.token_program,
        USDC_UNIT,
    );
    let res = fx.ctx.send(ix, &attacker, &[]);
    assert!(res.is_err(), "attacker withdraw must fail");
}

#[test]
fn update_plan_status_pauses_new_subscriptions() {
    let mut fx = PlanFixture::new(10 * USDC_UNIT, PERIOD_DAY);
    let creator = fx.creator.insecure_clone();

    let pause = status_ix(&fx.ctx.program_id, &creator.pubkey(), &fx.plan, false);
    fx.ctx.send(pause, &creator, &[]).unwrap();

    assert!(!fx.ctx.get_plan(&fx.plan).active);

    let (subscriber, subscriber_ata, subscription_pda) = fx.new_subscriber(100 * USDC_UNIT);
    let res = fx.subscribe(&subscriber, &subscriber_ata, &subscription_pda, 100 * USDC_UNIT);
    assert!(res.is_err(), "subscribe on paused plan must fail");

    // Unpause + subscribe succeeds.
    let resume = status_ix(&fx.ctx.program_id, &creator.pubkey(), &fx.plan, true);
    fx.ctx.send(resume, &creator, &[]).unwrap();
    fx.subscribe(&subscriber, &subscriber_ata, &subscription_pda, 100 * USDC_UNIT)
        .unwrap();
}

#[test]
fn update_plan_status_rejects_non_creator() {
    let mut fx = PlanFixture::new(10 * USDC_UNIT, PERIOD_DAY);
    let attacker = Keypair::new();
    fx.ctx.fund(&attacker.pubkey(), 5_000_000_000);

    let ix = status_ix(&fx.ctx.program_id, &attacker.pubkey(), &fx.plan, false);
    let res = fx.ctx.send(ix, &attacker, &[]);
    assert!(res.is_err(), "attacker status flip must fail");
}

#[test]
fn close_plan_rejects_with_active_subscribers() {
    let (mut fx, _sub, _sub_ata, _) = subscribed_fixture();
    let creator = fx.creator.insecure_clone();

    let creator_ata = fx.ctx.create_ata(&creator, &creator.pubkey(), &fx.mint);
    let price = fx.price;
    let w = withdraw_ix(
        &fx.ctx.program_id,
        &creator.pubkey(),
        &fx.plan,
        &fx.vault,
        &creator_ata,
        &fx.mint,
        &fx.ctx.token_program,
        price,
    );
    fx.ctx.send(w, &creator, &[]).unwrap();

    let close = close_ix(
        &fx.ctx.program_id,
        &creator.pubkey(),
        &fx.plan,
        &fx.vault,
        &fx.mint,
        &fx.ctx.token_program,
    );
    let res = fx.ctx.send(close, &creator, &[]);
    assert!(res.is_err(), "close with active subs must fail");
}

#[test]
fn close_plan_succeeds_after_cancel_and_withdraw() {
    let (mut fx, subscriber, _sub_ata, subscription_pda) = subscribed_fixture();

    let cancel = cancel_ix(
        &fx.ctx.program_id,
        &subscriber.pubkey(),
        &fx.plan,
        &subscription_pda,
    );
    fx.ctx.send(cancel, &subscriber, &[]).unwrap();

    let creator = fx.creator.insecure_clone();
    let creator_ata = fx.ctx.create_ata(&creator, &creator.pubkey(), &fx.mint);
    let price = fx.price;
    let w = withdraw_ix(
        &fx.ctx.program_id,
        &creator.pubkey(),
        &fx.plan,
        &fx.vault,
        &creator_ata,
        &fx.mint,
        &fx.ctx.token_program,
        price,
    );
    fx.ctx.send(w, &creator, &[]).unwrap();

    let close = close_ix(
        &fx.ctx.program_id,
        &creator.pubkey(),
        &fx.plan,
        &fx.vault,
        &fx.mint,
        &fx.ctx.token_program,
    );
    fx.ctx.send(close, &creator, &[]).unwrap();
}
