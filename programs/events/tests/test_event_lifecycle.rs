mod common;

use anchor_lang::{InstructionData, ToAccountMetas};
use common::{withdraw_revenue_ix, EventFixture, USDC_UNIT};
use solana_keypair::Keypair;
use solana_pubkey::Pubkey;
use solana_signer::Signer;

fn status_ix(
    program_id: &Pubkey,
    creator: &Pubkey,
    event: &Pubkey,
    active: bool,
) -> anchor_lang::solana_program::instruction::Instruction {
    anchor_lang::solana_program::instruction::Instruction {
        program_id: *program_id,
        accounts: events::accounts::UpdateEventStatus {
            creator: *creator,
            event: *event,
        }
        .to_account_metas(None),
        data: events::instruction::UpdateEventStatus { active }.data(),
    }
}

fn close_ix(
    program_id: &Pubkey,
    creator: &Pubkey,
    event: &Pubkey,
    vault: &Pubkey,
    mint: &Pubkey,
    token_program: &Pubkey,
) -> anchor_lang::solana_program::instruction::Instruction {
    anchor_lang::solana_program::instruction::Instruction {
        program_id: *program_id,
        accounts: events::accounts::CloseEvent {
            creator: *creator,
            event: *event,
            vault: *vault,
            mint: *mint,
            token_program: *token_program,
        }
        .to_account_metas(None),
        data: events::instruction::CloseEvent {}.data(),
    }
}

#[test]
fn update_event_status_blocks_new_ticket_sales_when_paused() {
    let mut fx = EventFixture::new(USDC_UNIT, 0);
    let creator = fx.creator.insecure_clone();

    let pause = status_ix(&fx.ctx.program_id, &creator.pubkey(), &fx.event, false);
    fx.ctx.send(pause, &creator, &[]).unwrap();
    assert!(!fx.ctx.get_event(&fx.event).active);

    let (a, a_ata, ticket) = fx.new_attendee(100 * USDC_UNIT);
    let res = fx.buy(&a, &a_ata, &ticket);
    assert!(res.is_err(), "buy on paused event must fail");

    let resume = status_ix(&fx.ctx.program_id, &creator.pubkey(), &fx.event, true);
    fx.ctx.send(resume, &creator, &[]).unwrap();
    fx.buy(&a, &a_ata, &ticket).unwrap();
}

#[test]
fn update_event_status_rejects_non_creator() {
    let mut fx = EventFixture::new(USDC_UNIT, 0);
    let attacker = Keypair::new();
    fx.ctx.fund(&attacker.pubkey(), 5_000_000_000);

    let ix = status_ix(&fx.ctx.program_id, &attacker.pubkey(), &fx.event, false);
    let res = fx.ctx.send(ix, &attacker, &[]);
    assert!(res.is_err(), "attacker flip must fail");
}

#[test]
fn close_event_rejects_when_vault_has_funds() {
    let mut fx = EventFixture::new(5 * USDC_UNIT, 0);
    let (a, a_ata, ticket) = fx.new_attendee(100 * USDC_UNIT);
    fx.buy(&a, &a_ata, &ticket).unwrap();

    let creator = fx.creator.insecure_clone();
    let ix = close_ix(
        &fx.ctx.program_id,
        &creator.pubkey(),
        &fx.event,
        &fx.vault,
        &fx.mint,
        &fx.ctx.token_program,
    );
    let res = fx.ctx.send(ix, &creator, &[]);
    assert!(res.is_err(), "close with non-empty vault must fail");
}

#[test]
fn close_event_succeeds_after_full_withdraw() {
    let price = 5 * USDC_UNIT;
    let mut fx = EventFixture::new(price, 0);
    let (a, a_ata, ticket) = fx.new_attendee(100 * USDC_UNIT);
    fx.buy(&a, &a_ata, &ticket).unwrap();

    let creator = fx.creator.insecure_clone();
    let creator_ata = fx.ctx.create_ata(&creator, &creator.pubkey(), &fx.mint);
    let w = withdraw_revenue_ix(
        &fx.ctx.program_id,
        &creator.pubkey(),
        &fx.event,
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
        &fx.event,
        &fx.vault,
        &fx.mint,
        &fx.ctx.token_program,
    );
    fx.ctx.send(close, &creator, &[]).unwrap();
}

#[test]
fn close_event_rejects_non_creator() {
    let mut fx = EventFixture::new(0, 0);

    let attacker = Keypair::new();
    fx.ctx.fund(&attacker.pubkey(), 5_000_000_000);

    let ix = close_ix(
        &fx.ctx.program_id,
        &attacker.pubkey(),
        &fx.event,
        &fx.vault,
        &fx.mint,
        &fx.ctx.token_program,
    );
    let res = fx.ctx.send(ix, &attacker, &[]);
    assert!(res.is_err(), "attacker close must fail");
}
