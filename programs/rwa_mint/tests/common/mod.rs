#![allow(dead_code)]

use {
    anchor_lang::{solana_program::instruction::Instruction, InstructionData, ToAccountMetas},
    anchor_spl::token_interface::spl_token_2022,
    litesvm::LiteSVM,
    litesvm_token::{CreateAssociatedTokenAccount, CreateMint},
    rwa_mint::state::{AssetCategory, AssetStatus},
    rwa_registry::state::IssuerStatus,
    solana_keypair::Keypair,
    solana_message::{Message, VersionedMessage},
    solana_pubkey::Pubkey,
    solana_signer::Signer,
    solana_transaction::versioned::VersionedTransaction,
};

pub struct TestCtx {
    pub svm: LiteSVM,
    pub mint_program_id: Pubkey,
    pub registry_program_id: Pubkey,
    pub token_program: Pubkey,
}

impl TestCtx {
    pub fn new() -> Self {
        let mut svm = LiteSVM::new();
        let mint_program_id = rwa_mint::id();
        let registry_program_id = rwa_registry::id();

        let mint_bytes = include_bytes!("../../../../target/deploy/rwa_mint.so");
        svm.add_program(mint_program_id, mint_bytes).unwrap();
        let registry_bytes = include_bytes!("../../../../target/deploy/rwa_registry.so");
        svm.add_program(registry_program_id, registry_bytes).unwrap();

        let mut clock = svm.get_sysvar::<solana_clock::Clock>();
        clock.unix_timestamp = 1_735_689_600;
        svm.set_sysvar::<solana_clock::Clock>(&clock);

        Self {
            svm,
            mint_program_id,
            registry_program_id,
            token_program: spl_token_2022::ID,
        }
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
        self.svm.expire_blockhash();
        result
    }

    pub fn registry_config_pda(&self) -> (Pubkey, u8) {
        Pubkey::find_program_address(&[b"config"], &self.registry_program_id)
    }

    pub fn issuer_pda(&self, owner: &Pubkey) -> (Pubkey, u8) {
        Pubkey::find_program_address(&[b"issuer", owner.as_ref()], &self.registry_program_id)
    }

    pub fn asset_pda(&self, issuer_owner: &Pubkey, asset_id: u64) -> (Pubkey, u8) {
        Pubkey::find_program_address(
            &[b"asset", issuer_owner.as_ref(), &asset_id.to_le_bytes()],
            &self.mint_program_id,
        )
    }

    pub fn create_rwa_mint(&mut self, authority: &Keypair, decimals: u8) -> Pubkey {
        CreateMint::new(&mut self.svm, authority)
            .token_program_id(&self.token_program)
            .decimals(decimals)
            .authority(&authority.pubkey())
            .send()
            .unwrap()
    }

    pub fn create_ata(&mut self, payer: &Keypair, owner: &Pubkey, mint: &Pubkey) -> Pubkey {
        CreateAssociatedTokenAccount::new(&mut self.svm, payer, mint)
            .token_program_id(&self.token_program)
            .owner(owner)
            .send()
            .unwrap()
    }

    pub fn token_balance(&self, ata: &Pubkey) -> u64 {
        use litesvm_token::get_spl_account;
        use spl_token_2022::state::Account as Token2022Account;
        get_spl_account::<Token2022Account>(&self.svm, ata)
            .unwrap()
            .amount
    }

    pub fn mint_supply(&self, mint: &Pubkey) -> u64 {
        use litesvm_token::get_spl_account;
        use spl_token_2022::state::Mint as Token2022Mint;
        get_spl_account::<Token2022Mint>(&self.svm, mint)
            .unwrap()
            .supply
    }

    pub fn mint_authority(&self, mint: &Pubkey) -> Option<Pubkey> {
        use litesvm_token::get_spl_account;
        use spl_token_2022::state::Mint as Token2022Mint;
        let mint_state = get_spl_account::<Token2022Mint>(&self.svm, mint).unwrap();
        if mint_state.mint_authority.is_some() {
            Some(Pubkey::from(mint_state.mint_authority.unwrap().to_bytes()))
        } else {
            None
        }
    }

    pub fn get_asset(&self, asset: &Pubkey) -> rwa_mint::state::Asset {
        use anchor_lang::AccountDeserialize;
        let account = self.svm.get_account(asset).unwrap();
        rwa_mint::state::Asset::try_deserialize(&mut &account.data[..]).unwrap()
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

pub fn tokenize_asset_ix(
    mint_program_id: &Pubkey,
    issuer_owner: &Pubkey,
    issuer: &Pubkey,
    asset: &Pubkey,
    mint: &Pubkey,
    issuer_token_account: &Pubkey,
    token_program: &Pubkey,
    asset_id: u64,
    category: AssetCategory,
    quantity: u64,
    delivery_required: bool,
    name: String,
    symbol: String,
    metadata_uri: String,
) -> Instruction {
    Instruction {
        program_id: *mint_program_id,
        accounts: rwa_mint::accounts::TokenizeAsset {
            issuer_owner: *issuer_owner,
            issuer: *issuer,
            asset: *asset,
            mint: *mint,
            issuer_token_account: *issuer_token_account,
            token_program: *token_program,
            associated_token_program: anchor_spl::associated_token::ID,
            system_program: anchor_lang::system_program::ID,
        }
        .to_account_metas(None),
        data: rwa_mint::instruction::TokenizeAsset {
            asset_id,
            category,
            quantity,
            delivery_required,
            name,
            symbol,
            metadata_uri,
        }
        .data(),
    }
}

pub fn burn_tokens_ix(
    mint_program_id: &Pubkey,
    issuer_owner: &Pubkey,
    asset: &Pubkey,
    mint: &Pubkey,
    issuer_token_account: &Pubkey,
    token_program: &Pubkey,
    amount: u64,
) -> Instruction {
    Instruction {
        program_id: *mint_program_id,
        accounts: rwa_mint::accounts::BurnTokens {
            issuer_owner: *issuer_owner,
            asset: *asset,
            mint: *mint,
            issuer_token_account: *issuer_token_account,
            token_program: *token_program,
        }
        .to_account_metas(None),
        data: rwa_mint::instruction::BurnTokens { amount }.data(),
    }
}

pub fn update_asset_status_ix(
    mint_program_id: &Pubkey,
    issuer_owner: &Pubkey,
    asset: &Pubkey,
    new_status: AssetStatus,
) -> Instruction {
    Instruction {
        program_id: *mint_program_id,
        accounts: rwa_mint::accounts::UpdateAssetStatus {
            issuer_owner: *issuer_owner,
            asset: *asset,
        }
        .to_account_metas(None),
        data: rwa_mint::instruction::UpdateAssetStatus { new_status }.data(),
    }
}

pub fn close_asset_ix(
    mint_program_id: &Pubkey,
    issuer_owner: &Pubkey,
    asset: &Pubkey,
) -> Instruction {
    Instruction {
        program_id: *mint_program_id,
        accounts: rwa_mint::accounts::CloseAsset {
            issuer_owner: *issuer_owner,
            asset: *asset,
        }
        .to_account_metas(None),
        data: rwa_mint::instruction::CloseAsset {}.data(),
    }
}

/// Full-stack fixture: registry initialised + one Active issuer authorised
/// for the Commodity + Ticket asset classes. The mint keypair is pre-created
/// with `issuer_owner` as mint authority, and its ATA is funded.
pub struct Fixture {
    pub ctx: TestCtx,
    pub registry_authority: Keypair,
    pub registry_config: Pubkey,
    pub issuer_owner: Keypair,
    pub issuer_pda: Pubkey,
    pub mint: Pubkey,
    pub issuer_ata: Pubkey,
}

impl Fixture {
    pub fn new() -> Self {
        use rwa_registry::constants::{ASSET_CLASS_COMMODITY, ASSET_CLASS_TICKET};

        let mut ctx = TestCtx::new();

        let registry_authority = Keypair::new();
        ctx.fund(&registry_authority.pubkey(), 5_000_000_000);
        let (registry_config, _) = ctx.registry_config_pda();
        let init_reg = initialize_registry_ix(
            &ctx.registry_program_id,
            &registry_authority.pubkey(),
            &registry_config,
        );
        ctx.send(init_reg, &registry_authority, &[]).unwrap();

        let issuer_owner = Keypair::new();
        ctx.fund(&issuer_owner.pubkey(), 5_000_000_000);
        let (issuer_pda, _) = ctx.issuer_pda(&issuer_owner.pubkey());
        let reg_ix = register_issuer_ix(
            &ctx.registry_program_id,
            &registry_authority.pubkey(),
            &registry_config,
            &issuer_pda,
            issuer_owner.pubkey(),
            vec![*b"SRB"],
            ASSET_CLASS_COMMODITY | ASSET_CLASS_TICKET,
            "KYC-ACME-001".into(),
            IssuerStatus::Active,
        );
        ctx.send(reg_ix, &registry_authority, &[]).unwrap();

        let mint = ctx.create_rwa_mint(&issuer_owner, 0);
        let issuer_ata = ctx.create_ata(&issuer_owner, &issuer_owner.pubkey(), &mint);

        Self {
            ctx,
            registry_authority,
            registry_config,
            issuer_owner,
            issuer_pda,
            mint,
            issuer_ata,
        }
    }
}
