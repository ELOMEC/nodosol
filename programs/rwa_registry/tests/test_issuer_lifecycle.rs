mod common;

use common::{
    close_issuer_ix, register_issuer_ix, update_issuer_metadata_ix, update_issuer_status_ix,
    update_registry_authority_ix, Fixture,
};
use rwa_registry::{
    constants::{ASSET_CLASS_COMMODITY, ASSET_CLASS_DEBT, ASSET_CLASS_REAL_ESTATE},
    state::IssuerStatus,
};
use solana_keypair::Keypair;
use solana_signer::Signer;

fn register_pending(f: &mut Fixture) -> (Keypair, solana_pubkey::Pubkey) {
    let owner_kp = Keypair::new();
    let owner = owner_kp.pubkey();
    let (issuer_pda, _) = f.ctx.issuer_pda(&owner);
    let ix = register_issuer_ix(
        &f.ctx.program_id,
        &f.authority.pubkey(),
        &f.config,
        &issuer_pda,
        owner,
        vec![*b"SRB"],
        ASSET_CLASS_COMMODITY,
        "KYC".into(),
        IssuerStatus::Pending,
    );
    f.ctx.send(ix, &f.authority, &[]).unwrap();
    (owner_kp, issuer_pda)
}

#[test]
fn status_pending_to_active_to_suspended_to_revoked() {
    let mut f = Fixture::new();
    let (_owner, issuer_pda) = register_pending(&mut f);

    for target in [
        IssuerStatus::Active,
        IssuerStatus::Suspended,
        IssuerStatus::Revoked,
    ] {
        let ix = update_issuer_status_ix(
            &f.ctx.program_id,
            &f.authority.pubkey(),
            &f.config,
            &issuer_pda,
            target,
        );
        f.ctx.send(ix, &f.authority, &[]).unwrap();
        assert_eq!(f.ctx.get_issuer(&issuer_pda).status, target);
    }
}

#[test]
fn status_revoked_is_terminal() {
    let mut f = Fixture::new();
    let (_owner, issuer_pda) = register_pending(&mut f);

    let revoke = update_issuer_status_ix(
        &f.ctx.program_id,
        &f.authority.pubkey(),
        &f.config,
        &issuer_pda,
        IssuerStatus::Revoked,
    );
    f.ctx.send(revoke, &f.authority, &[]).unwrap();

    let try_reactivate = update_issuer_status_ix(
        &f.ctx.program_id,
        &f.authority.pubkey(),
        &f.config,
        &issuer_pda,
        IssuerStatus::Active,
    );
    let result = f.ctx.send(try_reactivate, &f.authority, &[]);
    assert!(result.is_err(), "Revoked → Active must be rejected");
}

#[test]
fn status_noop_rejected() {
    let mut f = Fixture::new();
    let (_owner, issuer_pda) = register_pending(&mut f);
    let ix = update_issuer_status_ix(
        &f.ctx.program_id,
        &f.authority.pubkey(),
        &f.config,
        &issuer_pda,
        IssuerStatus::Pending,
    );
    let result = f.ctx.send(ix, &f.authority, &[]);
    assert!(result.is_err(), "no-op transition must fail");
}

#[test]
fn metadata_update_replaces_fields() {
    let mut f = Fixture::new();
    let (_owner, issuer_pda) = register_pending(&mut f);

    let ix = update_issuer_metadata_ix(
        &f.ctx.program_id,
        &f.authority.pubkey(),
        &f.config,
        &issuer_pda,
        vec![*b"USA", *b"CAN"],
        ASSET_CLASS_REAL_ESTATE | ASSET_CLASS_DEBT,
        "NEW-KYC".into(),
    );
    f.ctx.send(ix, &f.authority, &[]).unwrap();

    let updated = f.ctx.get_issuer(&issuer_pda);
    assert_eq!(updated.jurisdictions, vec![*b"USA", *b"CAN"]);
    assert_eq!(
        updated.asset_classes,
        ASSET_CLASS_REAL_ESTATE | ASSET_CLASS_DEBT
    );
    assert_eq!(updated.kyc_ref, "NEW-KYC");
    assert!(updated.updated_at >= updated.registered_at);
}

#[test]
fn close_requires_revoked_status() {
    let mut f = Fixture::new();
    let (_owner, issuer_pda) = register_pending(&mut f);

    let try_close = close_issuer_ix(
        &f.ctx.program_id,
        &f.authority.pubkey(),
        &f.config,
        &issuer_pda,
    );
    let result = f.ctx.send(try_close, &f.authority, &[]);
    assert!(result.is_err(), "close on Pending issuer must fail");

    let revoke = update_issuer_status_ix(
        &f.ctx.program_id,
        &f.authority.pubkey(),
        &f.config,
        &issuer_pda,
        IssuerStatus::Revoked,
    );
    f.ctx.send(revoke, &f.authority, &[]).unwrap();

    let close = close_issuer_ix(
        &f.ctx.program_id,
        &f.authority.pubkey(),
        &f.config,
        &issuer_pda,
    );
    f.ctx.send(close, &f.authority, &[]).unwrap();

    assert!(
        f.ctx.svm.get_account(&issuer_pda).is_none()
            || f.ctx.svm.get_account(&issuer_pda).unwrap().data.is_empty(),
        "issuer PDA must be closed"
    );

    let cfg = f.ctx.get_config(&f.config);
    assert_eq!(cfg.issuer_count, 0);
}

#[test]
fn authority_handover() {
    let mut f = Fixture::new();
    let new_authority = Keypair::new();
    f.ctx.fund(&new_authority.pubkey(), 5_000_000_000);

    let handover = update_registry_authority_ix(
        &f.ctx.program_id,
        &f.authority.pubkey(),
        &f.config,
        &new_authority.pubkey(),
    );
    f.ctx.send(handover, &f.authority, &[]).unwrap();

    assert_eq!(f.ctx.get_config(&f.config).authority, new_authority.pubkey());

    // Old authority can no longer register issuers.
    let stale_owner = Keypair::new().pubkey();
    let (stale_issuer, _) = f.ctx.issuer_pda(&stale_owner);
    let reject = register_issuer_ix(
        &f.ctx.program_id,
        &f.authority.pubkey(),
        &f.config,
        &stale_issuer,
        stale_owner,
        vec![*b"SRB"],
        ASSET_CLASS_COMMODITY,
        "X".into(),
        IssuerStatus::Active,
    );
    let result = f.ctx.send(reject, &f.authority, &[]);
    assert!(result.is_err(), "stale authority must be rejected");
}
