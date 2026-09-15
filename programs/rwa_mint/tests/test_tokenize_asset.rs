mod common;

use common::{tokenize_asset_ix, Fixture};
use rwa_mint::state::{AssetCategory, AssetStatus};
use solana_signer::Signer;

#[test]
fn tokenize_wheat_package_success() {
    let mut f = Fixture::new();
    let (asset_pda, bump) = f.ctx.asset_pda(&f.issuer_owner.pubkey(), 1);

    let ix = tokenize_asset_ix(
        &f.ctx.mint_program_id,
        &f.issuer_owner.pubkey(),
        &f.issuer_pda,
        &asset_pda,
        &f.mint,
        &f.issuer_ata,
        &f.ctx.token_program,
        1,
        AssetCategory::Commodity,
        5,
        true,
        "Organic Wheat Package".into(),
        "OWP".into(),
        "ipfs://QmWheat".into(),
    );
    f.ctx.send(ix, &f.issuer_owner, &[]).unwrap();

    let asset = f.ctx.get_asset(&asset_pda);
    assert_eq!(asset.asset_id, 1);
    assert_eq!(asset.category, AssetCategory::Commodity);
    assert_eq!(asset.status, AssetStatus::Active);
    assert_eq!(asset.quantity, 5);
    assert_eq!(asset.burned_amount, 0);
    assert!(asset.delivery_required);
    assert_eq!(asset.name, "Organic Wheat Package");
    assert_eq!(asset.symbol, "OWP");
    assert_eq!(asset.metadata_uri, "ipfs://QmWheat");
    assert_eq!(asset.mint, f.mint);
    assert_eq!(asset.issuer_owner, f.issuer_owner.pubkey());
    assert_eq!(asset.bump, bump);
    assert!(asset.created_at > 0);

    assert_eq!(f.ctx.token_balance(&f.issuer_ata), 5);
    assert_eq!(f.ctx.mint_supply(&f.mint), 5);
    // Mint authority must be revoked so supply is capped.
    assert_eq!(f.ctx.mint_authority(&f.mint), None);
}

#[test]
fn tokenize_rejects_non_authorised_class() {
    let mut f = Fixture::new();
    let (asset_pda, _) = f.ctx.asset_pda(&f.issuer_owner.pubkey(), 1);

    // Issuer has Commodity + Ticket but not RealEstate.
    let ix = tokenize_asset_ix(
        &f.ctx.mint_program_id,
        &f.issuer_owner.pubkey(),
        &f.issuer_pda,
        &asset_pda,
        &f.mint,
        &f.issuer_ata,
        &f.ctx.token_program,
        1,
        AssetCategory::RealEstate,
        1,
        false,
        "Villa".into(),
        "VLA".into(),
        "".into(),
    );
    let result = f.ctx.send(ix, &f.issuer_owner, &[]);
    assert!(result.is_err(), "unauthorised asset class must be rejected");
}

#[test]
fn tokenize_rejects_zero_quantity() {
    let mut f = Fixture::new();
    let (asset_pda, _) = f.ctx.asset_pda(&f.issuer_owner.pubkey(), 1);
    let ix = tokenize_asset_ix(
        &f.ctx.mint_program_id,
        &f.issuer_owner.pubkey(),
        &f.issuer_pda,
        &asset_pda,
        &f.mint,
        &f.issuer_ata,
        &f.ctx.token_program,
        1,
        AssetCategory::Commodity,
        0,
        true,
        "Empty".into(),
        "EMP".into(),
        "".into(),
    );
    let result = f.ctx.send(ix, &f.issuer_owner, &[]);
    assert!(result.is_err(), "quantity=0 must be rejected");
}

#[test]
fn tokenize_rejects_inactive_issuer() {
    use common::register_issuer_ix;
    use rwa_registry::constants::ASSET_CLASS_COMMODITY;
    use rwa_registry::state::IssuerStatus;
    use solana_keypair::Keypair;
    use solana_signer::Signer;

    let mut f = Fixture::new();

    // Register a second issuer with Suspended status.
    let suspended_owner = Keypair::new();
    f.ctx.fund(&suspended_owner.pubkey(), 5_000_000_000);
    let (suspended_issuer_pda, _) = f.ctx.issuer_pda(&suspended_owner.pubkey());
    let reg_ix = register_issuer_ix(
        &f.ctx.registry_program_id,
        &f.registry_authority.pubkey(),
        &f.registry_config,
        &suspended_issuer_pda,
        suspended_owner.pubkey(),
        vec![*b"SRB"],
        ASSET_CLASS_COMMODITY,
        "KYC-SUS".into(),
        IssuerStatus::Suspended,
    );
    f.ctx.send(reg_ix, &f.registry_authority, &[]).unwrap();

    let mint = f.ctx.create_rwa_mint(&suspended_owner, 0);
    let ata = f
        .ctx
        .create_ata(&suspended_owner, &suspended_owner.pubkey(), &mint);

    let (asset_pda, _) = f.ctx.asset_pda(&suspended_owner.pubkey(), 1);
    let ix = tokenize_asset_ix(
        &f.ctx.mint_program_id,
        &suspended_owner.pubkey(),
        &suspended_issuer_pda,
        &asset_pda,
        &mint,
        &ata,
        &f.ctx.token_program,
        1,
        AssetCategory::Commodity,
        10,
        false,
        "Blocked".into(),
        "BLK".into(),
        "".into(),
    );
    let result = f.ctx.send(ix, &suspended_owner, &[]);
    assert!(result.is_err(), "inactive issuer must be rejected");
}

#[test]
fn tokenize_rejects_cross_issuer_mint_authority() {
    use solana_keypair::Keypair;
    use solana_signer::Signer;

    let mut f = Fixture::new();

    // Mint is owned by a different authority, not the issuer.
    let other = Keypair::new();
    f.ctx.fund(&other.pubkey(), 5_000_000_000);
    let other_mint = f.ctx.create_rwa_mint(&other, 0);
    let other_ata = f.ctx.create_ata(&f.issuer_owner, &f.issuer_owner.pubkey(), &other_mint);

    let (asset_pda, _) = f.ctx.asset_pda(&f.issuer_owner.pubkey(), 1);
    let ix = tokenize_asset_ix(
        &f.ctx.mint_program_id,
        &f.issuer_owner.pubkey(),
        &f.issuer_pda,
        &asset_pda,
        &other_mint,
        &other_ata,
        &f.ctx.token_program,
        1,
        AssetCategory::Commodity,
        5,
        false,
        "X".into(),
        "X".into(),
        "".into(),
    );
    let result = f.ctx.send(ix, &f.issuer_owner, &[]);
    assert!(result.is_err(), "mismatched mint authority must be rejected");
}
