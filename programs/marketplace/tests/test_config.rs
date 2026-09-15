mod common;

use common::{initialize_config_ix, update_fee_bps_ix, Fixture, TestCtx};
use solana_keypair::Keypair;
use solana_signer::Signer;

#[test]
fn initialize_config_success() {
    let f = Fixture::new_with_fee(250, 0, 0);
    let cfg = f.ctx.get_config(&f.config);
    assert_eq!(cfg.authority, f.config_authority.pubkey());
    assert_eq!(cfg.treasury, f.treasury);
    assert_eq!(cfg.fee_bps, 250);
}

#[test]
fn initialize_config_rejects_fee_over_max() {
    let mut ctx = TestCtx::new();
    let auth = Keypair::new();
    ctx.fund(&auth.pubkey(), 5_000_000_000);
    let payment_authority = Keypair::new();
    ctx.fund(&payment_authority.pubkey(), 5_000_000_000);
    let payment_mint = ctx.create_mint(&payment_authority, 6);
    let treasury_owner = Keypair::new();
    let treasury = ctx.create_ata(&auth, &treasury_owner.pubkey(), &payment_mint);
    let (config, _) = ctx.config_pda();

    let ix = initialize_config_ix(&ctx.program_id, &auth.pubkey(), &config, &treasury, 1500);
    let result = ctx.send(ix, &auth, &[]);
    assert!(result.is_err(), "fee 15% must be rejected (cap 10%)");
}

#[test]
fn update_fee_bps_success_and_authority_check() {
    let mut f = Fixture::new_with_fee(0, 0, 0);
    let ix = update_fee_bps_ix(&f.ctx.program_id, &f.config_authority.pubkey(), &f.config, 400);
    f.ctx.send(ix, &f.config_authority, &[]).unwrap();
    assert_eq!(f.ctx.get_config(&f.config).fee_bps, 400);

    // impostor rejected
    let impostor = Keypair::new();
    f.ctx.fund(&impostor.pubkey(), 1_000_000_000);
    let ix = update_fee_bps_ix(&f.ctx.program_id, &impostor.pubkey(), &f.config, 0);
    let result = f.ctx.send(ix, &impostor, &[]);
    assert!(result.is_err(), "non-authority must be rejected");
}
