mod common;

use common::{
    burn_tokens_ix, close_asset_ix, tokenize_asset_ix, update_asset_status_ix, Fixture,
};
use rwa_mint::state::{AssetCategory, AssetStatus};
use solana_signer::Signer;

fn tokenize_5(f: &mut Fixture) -> solana_pubkey::Pubkey {
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
        5,
        true,
        "Wheat".into(),
        "W".into(),
        "".into(),
    );
    f.ctx.send(ix, &f.issuer_owner, &[]).unwrap();
    asset_pda
}

#[test]
fn burn_reduces_circulating_supply() {
    let mut f = Fixture::new();
    let asset_pda = tokenize_5(&mut f);

    let burn = burn_tokens_ix(
        &f.ctx.mint_program_id,
        &f.issuer_owner.pubkey(),
        &asset_pda,
        &f.mint,
        &f.issuer_ata,
        &f.ctx.token_program,
        2,
    );
    f.ctx.send(burn, &f.issuer_owner, &[]).unwrap();

    let asset = f.ctx.get_asset(&asset_pda);
    assert_eq!(asset.burned_amount, 2);
    assert_eq!(asset.circulating_supply(), 3);
    assert_eq!(f.ctx.token_balance(&f.issuer_ata), 3);
    assert_eq!(f.ctx.mint_supply(&f.mint), 3);
}

#[test]
fn burn_cannot_exceed_supply() {
    let mut f = Fixture::new();
    let asset_pda = tokenize_5(&mut f);

    let burn = burn_tokens_ix(
        &f.ctx.mint_program_id,
        &f.issuer_owner.pubkey(),
        &asset_pda,
        &f.mint,
        &f.issuer_ata,
        &f.ctx.token_program,
        6,
    );
    let result = f.ctx.send(burn, &f.issuer_owner, &[]);
    assert!(result.is_err(), "burn > supply must fail");
}

#[test]
fn status_active_to_paused_to_retired_but_retired_is_terminal() {
    let mut f = Fixture::new();
    let asset_pda = tokenize_5(&mut f);

    for target in [AssetStatus::Paused, AssetStatus::Retired] {
        let ix = update_asset_status_ix(
            &f.ctx.mint_program_id,
            &f.issuer_owner.pubkey(),
            &asset_pda,
            target,
        );
        f.ctx.send(ix, &f.issuer_owner, &[]).unwrap();
        assert_eq!(f.ctx.get_asset(&asset_pda).status, target);
    }

    // Retired → Active must fail.
    let reject = update_asset_status_ix(
        &f.ctx.mint_program_id,
        &f.issuer_owner.pubkey(),
        &asset_pda,
        AssetStatus::Active,
    );
    assert!(f.ctx.send(reject, &f.issuer_owner, &[]).is_err());
}

#[test]
fn close_requires_retired_and_zero_supply() {
    let mut f = Fixture::new();
    let asset_pda = tokenize_5(&mut f);

    // Try close while Active → reject.
    let try_close = close_asset_ix(&f.ctx.mint_program_id, &f.issuer_owner.pubkey(), &asset_pda);
    assert!(f.ctx.send(try_close, &f.issuer_owner, &[]).is_err());

    // Retire.
    let retire = update_asset_status_ix(
        &f.ctx.mint_program_id,
        &f.issuer_owner.pubkey(),
        &asset_pda,
        AssetStatus::Retired,
    );
    f.ctx.send(retire, &f.issuer_owner, &[]).unwrap();

    // Retired but supply > 0 → still rejected.
    let try_close_2 = close_asset_ix(&f.ctx.mint_program_id, &f.issuer_owner.pubkey(), &asset_pda);
    assert!(f.ctx.send(try_close_2, &f.issuer_owner, &[]).is_err());

    // Burn all.
    let burn_all = burn_tokens_ix(
        &f.ctx.mint_program_id,
        &f.issuer_owner.pubkey(),
        &asset_pda,
        &f.mint,
        &f.issuer_ata,
        &f.ctx.token_program,
        5,
    );
    f.ctx.send(burn_all, &f.issuer_owner, &[]).unwrap();

    // Now close succeeds.
    let close = close_asset_ix(&f.ctx.mint_program_id, &f.issuer_owner.pubkey(), &asset_pda);
    f.ctx.send(close, &f.issuer_owner, &[]).unwrap();

    assert!(
        f.ctx.svm.get_account(&asset_pda).is_none()
            || f.ctx.svm.get_account(&asset_pda).unwrap().data.is_empty()
    );
}
