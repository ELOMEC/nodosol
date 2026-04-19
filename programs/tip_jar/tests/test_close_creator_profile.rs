mod common;

use anchor_lang::{InstructionData, ToAccountMetas};
use common::{send_tip_ix, withdraw_ix, Fixture};
use solana_keypair::Keypair;
use solana_pubkey::Pubkey;
use solana_signer::Signer;

const USDC_UNIT: u64 = 1_000_000;

fn close_ix(
    program_id: &Pubkey,
    owner: &Pubkey,
    creator_profile: &Pubkey,
    vault: &Pubkey,
    mint: &Pubkey,
    token_program: &Pubkey,
) -> anchor_lang::solana_program::instruction::Instruction {
    anchor_lang::solana_program::instruction::Instruction {
        program_id: *program_id,
        accounts: tip_jar::accounts::CloseCreatorProfile {
            owner: *owner,
            creator_profile: *creator_profile,
            vault: *vault,
            mint: *mint,
            token_program: *token_program,
        }
        .to_account_metas(None),
        data: tip_jar::instruction::CloseCreatorProfile {}.data(),
    }
}

#[test]
fn close_creator_profile_succeeds_when_vault_empty() {
    let mut fx = Fixture::new(0);
    let creator = fx.creator.insecure_clone();

    let ix = close_ix(
        &fx.ctx.program_id,
        &creator.pubkey(),
        &fx.creator_profile,
        &fx.vault,
        &fx.mint,
        &fx.ctx.token_program,
    );
    fx.ctx.send(ix, &creator, &[]).unwrap();

    // Profile account should no longer exist.
    assert!(
        fx.ctx.svm.get_account(&fx.creator_profile).map(|a| a.data.is_empty()).unwrap_or(true),
        "creator profile should be closed"
    );
}

#[test]
fn close_creator_profile_rejects_when_vault_has_funds() {
    let mut fx = Fixture::new(100 * USDC_UNIT);

    let tip = send_tip_ix(
        &fx.ctx.program_id,
        &fx.tipper.pubkey(),
        &fx.tipper_ata,
        &fx.creator_profile,
        &fx.vault,
        &fx.config,
        &fx.treasury,
        &fx.mint,
        &fx.ctx.token_program,
        10 * USDC_UNIT,
    );
    fx.ctx.send(tip, &fx.tipper, &[]).unwrap();

    let creator = fx.creator.insecure_clone();
    let ix = close_ix(
        &fx.ctx.program_id,
        &creator.pubkey(),
        &fx.creator_profile,
        &fx.vault,
        &fx.mint,
        &fx.ctx.token_program,
    );
    let res = fx.ctx.send(ix, &creator, &[]);
    assert!(
        res.is_err(),
        "close with non-empty vault must fail"
    );
}

#[test]
fn close_creator_profile_succeeds_after_full_withdraw() {
    let mut fx = Fixture::new(100 * USDC_UNIT);

    let tip = send_tip_ix(
        &fx.ctx.program_id,
        &fx.tipper.pubkey(),
        &fx.tipper_ata,
        &fx.creator_profile,
        &fx.vault,
        &fx.config,
        &fx.treasury,
        &fx.mint,
        &fx.ctx.token_program,
        20 * USDC_UNIT,
    );
    fx.ctx.send(tip, &fx.tipper, &[]).unwrap();

    let creator = fx.creator.insecure_clone();
    let creator_ata = fx.ctx.create_ata(&creator, &creator.pubkey(), &fx.mint);

    let w = withdraw_ix(
        &fx.ctx.program_id,
        &creator.pubkey(),
        &fx.creator_profile,
        &fx.vault,
        &creator_ata,
        &fx.mint,
        &fx.ctx.token_program,
        20 * USDC_UNIT,
    );
    fx.ctx.send(w, &creator, &[]).unwrap();

    let ix = close_ix(
        &fx.ctx.program_id,
        &creator.pubkey(),
        &fx.creator_profile,
        &fx.vault,
        &fx.mint,
        &fx.ctx.token_program,
    );
    fx.ctx.send(ix, &creator, &[]).unwrap();
}

#[test]
fn close_creator_profile_rejects_non_owner() {
    let mut fx = Fixture::new(0);
    let attacker = Keypair::new();
    fx.ctx.fund(&attacker.pubkey(), 5_000_000_000);

    let ix = close_ix(
        &fx.ctx.program_id,
        &attacker.pubkey(),
        &fx.creator_profile,
        &fx.vault,
        &fx.mint,
        &fx.ctx.token_program,
    );
    let res = fx.ctx.send(ix, &attacker, &[]);
    assert!(res.is_err(), "non-owner close must fail");
}
