#![allow(dead_code)]

use {
    anchor_lang::{solana_program::instruction::Instruction, InstructionData, ToAccountMetas},
    litesvm::LiteSVM,
    rwa_registry::state::IssuerStatus,
    solana_keypair::Keypair,
    solana_message::{Message, VersionedMessage},
    solana_pubkey::Pubkey,
    solana_signer::Signer,
    solana_transaction::versioned::VersionedTransaction,
};

pub struct TestCtx {
    pub svm: LiteSVM,
    pub program_id: Pubkey,
}

impl TestCtx {
    pub fn new() -> Self {
        let mut svm = LiteSVM::new();
        let program_id = rwa_registry::id();

        let bytes = include_bytes!("../../../../target/deploy/rwa_registry.so");
        svm.add_program(program_id, bytes).unwrap();

        let mut clock = svm.get_sysvar::<solana_clock::Clock>();
        clock.unix_timestamp = 1_735_689_600; // 2025-01-01
        svm.set_sysvar::<solana_clock::Clock>(&clock);

        Self { svm, program_id }
    }

    pub fn fund(&mut self, pubkey: &Pubkey, lamports: u64) {
        self.svm.airdrop(pubkey, lamports).unwrap();
    }

    pub fn send(
        &mut self,
        ix: Instruction,
        payer: &Keypair,
        extra_signers: &[&Keypair],
    ) -> litesvm::types::TransactionResult {
        let blockhash = self.svm.latest_blockhash();
        let msg = Message::new_with_blockhash(&[ix], Some(&payer.pubkey()), &blockhash);
        let mut signers: Vec<&Keypair> = vec![payer];
        signers.extend_from_slice(extra_signers);
        let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &signers).unwrap();
        let result = self.svm.send_transaction(tx);
        // Expire blockhash so that subsequent identical transactions (e.g. the
        // same instruction retried after a fix) get a fresh signature instead
        // of hitting LiteSVM's AlreadyProcessed cache.
        self.svm.expire_blockhash();
        result
    }

    pub fn config_pda(&self) -> (Pubkey, u8) {
        Pubkey::find_program_address(&[b"config"], &self.program_id)
    }

    pub fn issuer_pda(&self, owner: &Pubkey) -> (Pubkey, u8) {
        Pubkey::find_program_address(&[b"issuer", owner.as_ref()], &self.program_id)
    }

    pub fn get_config(&self, config: &Pubkey) -> rwa_registry::state::RegistryConfig {
        use anchor_lang::AccountDeserialize;
        let account = self.svm.get_account(config).unwrap();
        rwa_registry::state::RegistryConfig::try_deserialize(&mut &account.data[..]).unwrap()
    }

    pub fn get_issuer(&self, issuer: &Pubkey) -> rwa_registry::state::Issuer {
        use anchor_lang::AccountDeserialize;
        let account = self.svm.get_account(issuer).unwrap();
        rwa_registry::state::Issuer::try_deserialize(&mut &account.data[..]).unwrap()
    }
}

pub fn initialize_registry_ix(
    program_id: &Pubkey,
    authority: &Pubkey,
    config: &Pubkey,
) -> Instruction {
    Instruction {
        program_id: *program_id,
        accounts: rwa_registry::accounts::InitializeRegistry {
            authority: *authority,
            config: *config,
            system_program: anchor_lang::system_program::ID,
        }
        .to_account_metas(None),
        data: rwa_registry::instruction::InitializeRegistry {}.data(),
    }
}

pub fn update_registry_authority_ix(
    program_id: &Pubkey,
    authority: &Pubkey,
    config: &Pubkey,
    new_authority: &Pubkey,
) -> Instruction {
    Instruction {
        program_id: *program_id,
        accounts: rwa_registry::accounts::UpdateRegistryAuthority {
            authority: *authority,
            config: *config,
            new_authority: *new_authority,
        }
        .to_account_metas(None),
        data: rwa_registry::instruction::UpdateRegistryAuthority {}.data(),
    }
}

pub fn register_issuer_ix(
    program_id: &Pubkey,
    authority: &Pubkey,
    config: &Pubkey,
    issuer: &Pubkey,
    owner: Pubkey,
    jurisdictions: Vec<[u8; 3]>,
    asset_classes: u16,
    kyc_ref: String,
    initial_status: IssuerStatus,
) -> Instruction {
    Instruction {
        program_id: *program_id,
        accounts: rwa_registry::accounts::RegisterIssuer {
            authority: *authority,
            config: *config,
            issuer: *issuer,
            system_program: anchor_lang::system_program::ID,
        }
        .to_account_metas(None),
        data: rwa_registry::instruction::RegisterIssuer {
            owner,
            jurisdictions,
            asset_classes,
            kyc_ref,
            initial_status,
        }
        .data(),
    }
}

pub fn update_issuer_status_ix(
    program_id: &Pubkey,
    authority: &Pubkey,
    config: &Pubkey,
    issuer: &Pubkey,
    new_status: IssuerStatus,
) -> Instruction {
    Instruction {
        program_id: *program_id,
        accounts: rwa_registry::accounts::UpdateIssuerStatus {
            authority: *authority,
            config: *config,
            issuer: *issuer,
        }
        .to_account_metas(None),
        data: rwa_registry::instruction::UpdateIssuerStatus { new_status }.data(),
    }
}

pub fn update_issuer_metadata_ix(
    program_id: &Pubkey,
    authority: &Pubkey,
    config: &Pubkey,
    issuer: &Pubkey,
    jurisdictions: Vec<[u8; 3]>,
    asset_classes: u16,
    kyc_ref: String,
) -> Instruction {
    Instruction {
        program_id: *program_id,
        accounts: rwa_registry::accounts::UpdateIssuerMetadata {
            authority: *authority,
            config: *config,
            issuer: *issuer,
        }
        .to_account_metas(None),
        data: rwa_registry::instruction::UpdateIssuerMetadata {
            jurisdictions,
            asset_classes,
            kyc_ref,
        }
        .data(),
    }
}

pub fn close_issuer_ix(
    program_id: &Pubkey,
    authority: &Pubkey,
    config: &Pubkey,
    issuer: &Pubkey,
) -> Instruction {
    Instruction {
        program_id: *program_id,
        accounts: rwa_registry::accounts::CloseIssuer {
            authority: *authority,
            config: *config,
            issuer: *issuer,
        }
        .to_account_metas(None),
        data: rwa_registry::instruction::CloseIssuer {}.data(),
    }
}

/// Fixture with an initialised registry and funded authority.
pub struct Fixture {
    pub ctx: TestCtx,
    pub authority: Keypair,
    pub config: Pubkey,
}

impl Fixture {
    pub fn new() -> Self {
        let mut ctx = TestCtx::new();
        let authority = Keypair::new();
        ctx.fund(&authority.pubkey(), 5_000_000_000);
        let (config, _) = ctx.config_pda();
        let ix = initialize_registry_ix(&ctx.program_id, &authority.pubkey(), &config);
        ctx.send(ix, &authority, &[]).unwrap();
        Self {
            ctx,
            authority,
            config,
        }
    }
}
