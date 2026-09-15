mod common;

use common::{register_issuer_ix, Fixture};
use rwa_registry::{
    constants::{ASSET_CLASS_COMMODITY, ASSET_CLASS_TICKET},
    state::IssuerStatus,
};
use solana_keypair::Keypair;
use solana_signer::Signer;

fn jurisdictions_srb_mne() -> Vec<[u8; 3]> {
    vec![*b"SRB", *b"MNE"]
}

#[test]
fn register_issuer_success() {
    let mut f = Fixture::new();
    let owner = Keypair::new().pubkey();
    let (issuer_pda, bump) = f.ctx.issuer_pda(&owner);

    let ix = register_issuer_ix(
        &f.ctx.program_id,
        &f.authority.pubkey(),
        &f.config,
        &issuer_pda,
        owner,
        jurisdictions_srb_mne(),
        ASSET_CLASS_COMMODITY | ASSET_CLASS_TICKET,
        "KYC-REF-42".to_string(),
        IssuerStatus::Active,
    );
    f.ctx.send(ix, &f.authority, &[]).unwrap();

    let issuer = f.ctx.get_issuer(&issuer_pda);
    assert_eq!(issuer.owner, owner);
    assert_eq!(issuer.status, IssuerStatus::Active);
    assert_eq!(issuer.jurisdictions, jurisdictions_srb_mne());
    assert_eq!(
        issuer.asset_classes,
        ASSET_CLASS_COMMODITY | ASSET_CLASS_TICKET
    );
    assert_eq!(issuer.kyc_ref, "KYC-REF-42");
    assert_eq!(issuer.bump, bump);
    assert!(issuer.registered_at > 0);
    assert_eq!(issuer.updated_at, issuer.registered_at);

    let cfg = f.ctx.get_config(&f.config);
    assert_eq!(cfg.issuer_count, 1);

    assert!(issuer.is_active());
    assert!(issuer.supports_asset_class(ASSET_CLASS_COMMODITY));
    assert!(issuer.supports_asset_class(ASSET_CLASS_TICKET));
    assert!(!issuer.supports_asset_class(1 << 5)); // CARBON not granted
}

#[test]
fn register_issuer_rejects_non_authority() {
    let mut f = Fixture::new();
    let impostor = Keypair::new();
    f.ctx.fund(&impostor.pubkey(), 5_000_000_000);
    let owner = Keypair::new().pubkey();
    let (issuer_pda, _) = f.ctx.issuer_pda(&owner);

    let ix = register_issuer_ix(
        &f.ctx.program_id,
        &impostor.pubkey(),
        &f.config,
        &issuer_pda,
        owner,
        jurisdictions_srb_mne(),
        ASSET_CLASS_COMMODITY,
        "X".into(),
        IssuerStatus::Active,
    );
    let result = f.ctx.send(ix, &impostor, &[]);
    assert!(result.is_err(), "non-authority must be rejected");
}

#[test]
fn register_issuer_rejects_empty_asset_classes() {
    let mut f = Fixture::new();
    let owner = Keypair::new().pubkey();
    let (issuer_pda, _) = f.ctx.issuer_pda(&owner);
    let ix = register_issuer_ix(
        &f.ctx.program_id,
        &f.authority.pubkey(),
        &f.config,
        &issuer_pda,
        owner,
        jurisdictions_srb_mne(),
        0,
        "X".into(),
        IssuerStatus::Active,
    );
    let result = f.ctx.send(ix, &f.authority, &[]);
    assert!(result.is_err(), "asset_classes=0 must fail");
}

#[test]
fn register_issuer_rejects_invalid_flag_bits() {
    let mut f = Fixture::new();
    let owner = Keypair::new().pubkey();
    let (issuer_pda, _) = f.ctx.issuer_pda(&owner);
    let ix = register_issuer_ix(
        &f.ctx.program_id,
        &f.authority.pubkey(),
        &f.config,
        &issuer_pda,
        owner,
        jurisdictions_srb_mne(),
        0b1000_0000_0000_0000, // bit 15 is not defined
        "X".into(),
        IssuerStatus::Active,
    );
    let result = f.ctx.send(ix, &f.authority, &[]);
    assert!(result.is_err(), "undefined class flag must fail");
}

#[test]
fn register_issuer_rejects_lowercase_jurisdiction() {
    let mut f = Fixture::new();
    let owner = Keypair::new().pubkey();
    let (issuer_pda, _) = f.ctx.issuer_pda(&owner);
    let ix = register_issuer_ix(
        &f.ctx.program_id,
        &f.authority.pubkey(),
        &f.config,
        &issuer_pda,
        owner,
        vec![*b"srb"],
        ASSET_CLASS_COMMODITY,
        "X".into(),
        IssuerStatus::Active,
    );
    let result = f.ctx.send(ix, &f.authority, &[]);
    assert!(result.is_err(), "lowercase jurisdiction must fail");
}

#[test]
fn register_issuer_rejects_duplicate() {
    let mut f = Fixture::new();
    let owner = Keypair::new().pubkey();
    let (issuer_pda, _) = f.ctx.issuer_pda(&owner);
    let ix = register_issuer_ix(
        &f.ctx.program_id,
        &f.authority.pubkey(),
        &f.config,
        &issuer_pda,
        owner,
        jurisdictions_srb_mne(),
        ASSET_CLASS_COMMODITY,
        "X".into(),
        IssuerStatus::Active,
    );
    f.ctx.send(ix.clone(), &f.authority, &[]).unwrap();
    let second = f.ctx.send(ix, &f.authority, &[]);
    assert!(second.is_err(), "re-registering same owner must fail");
}

#[test]
fn register_issuer_rejects_oversized_kyc_ref() {
    let mut f = Fixture::new();
    let owner = Keypair::new().pubkey();
    let (issuer_pda, _) = f.ctx.issuer_pda(&owner);
    let ix = register_issuer_ix(
        &f.ctx.program_id,
        &f.authority.pubkey(),
        &f.config,
        &issuer_pda,
        owner,
        jurisdictions_srb_mne(),
        ASSET_CLASS_COMMODITY,
        "X".repeat(200),
        IssuerStatus::Active,
    );
    let result = f.ctx.send(ix, &f.authority, &[]);
    assert!(result.is_err(), "oversized kyc_ref must fail");
}
