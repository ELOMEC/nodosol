//! Sad-path coverage for event_tickets admin (Config) ix-evi —
//! Phase 3 P2-008 closing gap.
//!
//! Every admin ix is gated by `has_one = authority` on the Config
//! PDA. A non-authority signer must fail. Plus value-clamp gates:
//! update_fee_bps caps at MAX_FEE_BPS, update_tier_price rejects 0.

mod common;

use common::{
    create_event_ix, create_tier_ix, update_config_authority_ix, update_fee_bps_ix,
    update_pause_ix, update_tier_price_ix, update_treasury_ix, Fixture, START_UNIX,
};
use solana_keypair::Keypair;
use solana_signer::Signer;

const MAX_FEE_BPS: u16 = 1_000;
const EVENT_ID: u64 = 1;
const TIER_ID: u16 = 0;

// ---------------------------------------------------------------------------
// has_one = authority gates (5 admin ix-evi)
// ---------------------------------------------------------------------------

#[test]
fn update_pause_rejects_when_signer_is_not_config_authority() {
    let mut f = Fixture::new_with_fee(0, 0);
    let attacker = Keypair::new();
    f.ctx.fund(&attacker.pubkey(), 5_000_000_000);

    let ix = update_pause_ix(&f.ctx.program_id, &attacker.pubkey(), &f.config, true);
    let result = f.ctx.send(vec![ix], &attacker, &[]);
    assert!(
        result.is_err(),
        "update_pause by non-authority must fail (Unauthorized via has_one)"
    );
    assert!(
        !f.ctx.get_config(&f.config).paused,
        "config.paused must remain false after rejected update"
    );
}

#[test]
fn update_fee_bps_rejects_above_max_and_unauthorized_signer() {
    let mut f = Fixture::new_with_fee(0, 0);

    // (a) clamp violation by the legitimate authority.
    let ix_clamp = update_fee_bps_ix(
        &f.ctx.program_id,
        &f.config_authority.pubkey(),
        &f.config,
        MAX_FEE_BPS + 1,
    );
    let result = f.ctx.send(vec![ix_clamp], &f.config_authority, &[]);
    assert!(
        result.is_err(),
        "fee_bps > MAX_FEE_BPS must fail (FeeBpsTooHigh)"
    );

    // (b) unauthorized signer (even with a valid value).
    let attacker = Keypair::new();
    f.ctx.fund(&attacker.pubkey(), 5_000_000_000);
    let ix_auth = update_fee_bps_ix(&f.ctx.program_id, &attacker.pubkey(), &f.config, 250);
    let result = f.ctx.send(vec![ix_auth], &attacker, &[]);
    assert!(
        result.is_err(),
        "update_fee_bps by non-authority must fail (Unauthorized)"
    );

    // Config unchanged on both rejections.
    let cfg = f.ctx.get_config(&f.config);
    assert_eq!(cfg.fee_bps, 0);
}

#[test]
fn update_treasury_rejects_when_signer_is_not_config_authority() {
    let mut f = Fixture::new_with_fee(0, 0);

    // Mint a fresh token account to use as the proposed new treasury.
    let new_owner = Keypair::new();
    let new_treasury = f
        .ctx
        .create_ata(&f.payment_mint_authority, &new_owner.pubkey(), &f.payment_mint);

    let attacker = Keypair::new();
    f.ctx.fund(&attacker.pubkey(), 5_000_000_000);

    let ix = update_treasury_ix(
        &f.ctx.program_id,
        &attacker.pubkey(),
        &f.config,
        &new_treasury,
    );
    let result = f.ctx.send(vec![ix], &attacker, &[]);
    assert!(
        result.is_err(),
        "update_treasury by non-authority must fail (Unauthorized)"
    );

    let cfg = f.ctx.get_config(&f.config);
    assert_eq!(
        cfg.treasury, f.treasury,
        "treasury must remain unchanged after rejected update"
    );
}

#[test]
fn update_config_authority_rejects_when_signer_is_not_current_authority() {
    let mut f = Fixture::new_with_fee(0, 0);
    let attacker = Keypair::new();
    f.ctx.fund(&attacker.pubkey(), 5_000_000_000);

    // Attacker tries to rotate the authority to themselves.
    let ix = update_config_authority_ix(
        &f.ctx.program_id,
        &attacker.pubkey(),
        &f.config,
        &attacker.pubkey(),
    );
    let result = f.ctx.send(vec![ix], &attacker, &[]);
    assert!(
        result.is_err(),
        "update_config_authority by non-authority must fail (Unauthorized)"
    );

    let cfg = f.ctx.get_config(&f.config);
    assert_eq!(
        cfg.authority,
        f.config_authority.pubkey(),
        "authority must remain unchanged after rejected rotation"
    );
}

// ---------------------------------------------------------------------------
// Creator-gated update_tier_price gate
// ---------------------------------------------------------------------------

#[test]
fn update_tier_price_rejects_zero_price() {
    let mut f = Fixture::new_with_fee(0, 0);
    let (event, _) = f.ctx.event_pda(&f.creator.pubkey(), EVENT_ID);
    let (vault, _) = f.ctx.vault_pda(&event);
    f.ctx
        .send(
            vec![create_event_ix(
                &f.ctx.program_id,
                &f.creator.pubkey(),
                &f.payment_mint,
                &event,
                &vault,
                &f.ctx.token_program,
                EVENT_ID,
                10_000_000,
                100,
                START_UNIX,
                START_UNIX + 86_400,
                "Admin Test".into(),
                "ADM".into(),
                "https://example/ad.json".into(),
            )],
            &f.creator,
            &[],
        )
        .unwrap();
    let (tier, _) = f.ctx.tier_pda(&event, TIER_ID);
    f.ctx
        .send(
            vec![create_tier_ix(
                &f.ctx.program_id,
                &f.creator.pubkey(),
                &event,
                &tier,
                TIER_ID,
                "Floor".into(),
                "F".into(),
                25_000_000,
                10,
                *b"00FF00",
            )],
            &f.creator,
            &[],
        )
        .unwrap();

    // Attempt to set price = 0 — must fail.
    let ix = update_tier_price_ix(&f.ctx.program_id, &f.creator.pubkey(), &event, &tier, 0);
    let result = f.ctx.send(vec![ix], &f.creator, &[]);
    assert!(
        result.is_err(),
        "update_tier_price with new_price=0 must fail (InvalidPrice)"
    );

    let state = f.ctx.get_tier(&tier);
    assert_eq!(state.price, 25_000_000, "tier price must be unchanged");
}

#[test]
fn update_tier_price_rejects_when_signer_is_not_event_creator() {
    let mut f = Fixture::new_with_fee(0, 0);
    let (event, _) = f.ctx.event_pda(&f.creator.pubkey(), EVENT_ID);
    let (vault, _) = f.ctx.vault_pda(&event);
    f.ctx
        .send(
            vec![create_event_ix(
                &f.ctx.program_id,
                &f.creator.pubkey(),
                &f.payment_mint,
                &event,
                &vault,
                &f.ctx.token_program,
                EVENT_ID,
                10_000_000,
                100,
                START_UNIX,
                START_UNIX + 86_400,
                "Admin Test 2".into(),
                "AD2".into(),
                "https://example/ad2.json".into(),
            )],
            &f.creator,
            &[],
        )
        .unwrap();
    let (tier, _) = f.ctx.tier_pda(&event, TIER_ID);
    f.ctx
        .send(
            vec![create_tier_ix(
                &f.ctx.program_id,
                &f.creator.pubkey(),
                &event,
                &tier,
                TIER_ID,
                "Floor".into(),
                "F".into(),
                25_000_000,
                10,
                *b"00FF00",
            )],
            &f.creator,
            &[],
        )
        .unwrap();

    let attacker = Keypair::new();
    f.ctx.fund(&attacker.pubkey(), 5_000_000_000);

    let ix = update_tier_price_ix(
        &f.ctx.program_id,
        &attacker.pubkey(),
        &event,
        &tier,
        1, // any non-zero
    );
    let result = f.ctx.send(vec![ix], &attacker, &[]);
    assert!(
        result.is_err(),
        "update_tier_price by non-creator must fail (NotCreator)"
    );

    let state = f.ctx.get_tier(&tier);
    assert_eq!(state.price, 25_000_000);
}
