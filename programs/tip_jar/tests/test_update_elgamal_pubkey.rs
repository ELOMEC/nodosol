mod common;

use common::{update_elgamal_pubkey_ix, Fixture};
use solana_keypair::Keypair;
use solana_signer::Signer;

#[test]
fn update_elgamal_pubkey_sets_bytes() {
    let mut fx = Fixture::new(0);

    let new_pubkey: [u8; 32] = [7u8; 32];

    let ix = update_elgamal_pubkey_ix(
        &fx.ctx.program_id,
        &fx.creator.pubkey(),
        &fx.creator_profile,
        new_pubkey,
    );
    fx.ctx.send(ix, &fx.creator, &[]).unwrap();

    let profile = fx.ctx.get_profile(&fx.creator_profile);
    assert_eq!(profile.elgamal_pubkey, new_pubkey);
}

#[test]
fn update_elgamal_pubkey_can_rotate() {
    let mut fx = Fixture::new(0);

    let first = [1u8; 32];
    let second = [2u8; 32];

    for pk in [first, second] {
        let ix = update_elgamal_pubkey_ix(
            &fx.ctx.program_id,
            &fx.creator.pubkey(),
            &fx.creator_profile,
            pk,
        );
        fx.ctx.send(ix, &fx.creator, &[]).unwrap();
    }

    let profile = fx.ctx.get_profile(&fx.creator_profile);
    assert_eq!(profile.elgamal_pubkey, second);
}

#[test]
fn update_elgamal_pubkey_rejects_non_owner() {
    let mut fx = Fixture::new(0);

    let attacker = Keypair::new();
    fx.ctx.fund(&attacker.pubkey(), 5_000_000_000);

    let ix = update_elgamal_pubkey_ix(
        &fx.ctx.program_id,
        &attacker.pubkey(),
        &fx.creator_profile,
        [9u8; 32],
    );

    let res = fx.ctx.send(ix, &attacker, &[]);
    assert!(res.is_err(), "attacker must not update another creator's elgamal pubkey");
}
