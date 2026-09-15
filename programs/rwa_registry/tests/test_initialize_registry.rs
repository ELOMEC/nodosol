mod common;

use common::{initialize_registry_ix, TestCtx};
use solana_keypair::Keypair;
use solana_signer::Signer;

#[test]
fn initialize_registry_success() {
    let mut ctx = TestCtx::new();
    let authority = Keypair::new();
    ctx.fund(&authority.pubkey(), 5_000_000_000);

    let (config, bump) = ctx.config_pda();
    let ix = initialize_registry_ix(&ctx.program_id, &authority.pubkey(), &config);

    ctx.send(ix, &authority, &[]).unwrap();

    let state = ctx.get_config(&config);
    assert_eq!(state.authority, authority.pubkey());
    assert_eq!(state.issuer_count, 0);
    assert_eq!(state.bump, bump);
    assert_eq!(state.reserved, [0u8; 63]);
}

#[test]
fn initialize_registry_is_idempotent_blocking() {
    let mut ctx = TestCtx::new();
    let authority = Keypair::new();
    ctx.fund(&authority.pubkey(), 5_000_000_000);

    let (config, _) = ctx.config_pda();
    let ix = initialize_registry_ix(&ctx.program_id, &authority.pubkey(), &config);
    ctx.send(ix.clone(), &authority, &[]).unwrap();

    let second = ctx.send(ix, &authority, &[]);
    assert!(second.is_err(), "re-init must fail — config PDA already exists");
}
