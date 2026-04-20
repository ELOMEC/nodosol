#![allow(dead_code)]

use {
    anchor_lang::{solana_program::instruction::Instruction, InstructionData, ToAccountMetas},
    anchor_spl::token_interface::spl_token_2022,
    litesvm::LiteSVM,
    litesvm_token::{CreateAssociatedTokenAccount, CreateMint, MintTo},
    otc_deals::state::{Config, Deal},
    solana_keypair::Keypair,
    solana_message::{Message, VersionedMessage},
    solana_pubkey::Pubkey,
    solana_signer::Signer,
    solana_transaction::versioned::VersionedTransaction,
};

pub const USDC_DECIMALS: u8 = 6;
pub const START_UNIX: i64 = 1_735_689_600; // 2025-01-01

pub struct TestCtx {
    pub svm: LiteSVM,
    pub program_id: Pubkey,
    pub token_program: Pubkey,
}

impl TestCtx {
    pub fn new() -> Self {
        let mut svm = LiteSVM::new();
        let program_id = otc_deals::id();
        let bytes = include_bytes!("../../../../target/deploy/otc_deals.so");
        svm.add_program(program_id, bytes).unwrap();

        let mut clock = svm.get_sysvar::<solana_clock::Clock>();
        clock.unix_timestamp = START_UNIX;
        svm.set_sysvar::<solana_clock::Clock>(&clock);

        Self {
            svm,
            program_id,
            token_program: spl_token_2022::ID,
        }
    }

    pub fn fund(&mut self, pubkey: &Pubkey, lamports: u64) {
        self.svm.airdrop(pubkey, lamports).unwrap();
    }

    pub fn advance_time(&mut self, seconds: i64) {
        let mut clock = self.svm.get_sysvar::<solana_clock::Clock>();
        clock.unix_timestamp = clock.unix_timestamp.saturating_add(seconds);
        self.svm.set_sysvar::<solana_clock::Clock>(&clock);
        self.svm.expire_blockhash();
    }

    pub fn now(&self) -> i64 {
        self.svm.get_sysvar::<solana_clock::Clock>().unix_timestamp
    }

    pub fn send(
        &mut self,
        ix: Instruction,
        payer: &Keypair,
        extra: &[&Keypair],
    ) -> litesvm::types::TransactionResult {
        let blockhash = self.svm.latest_blockhash();
        let msg = Message::new_with_blockhash(&[ix], Some(&payer.pubkey()), &blockhash);
        let mut signers: Vec<&Keypair> = vec![payer];
        signers.extend_from_slice(extra);
        let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &signers).unwrap();
        let result = self.svm.send_transaction(tx);
        self.svm.expire_blockhash();
        result
    }

    pub fn config_pda(&self) -> (Pubkey, u8) {
        Pubkey::find_program_address(&[b"config"], &self.program_id)
    }
    pub fn deal_pda(&self, seller: &Pubkey, buyer: &Pubkey, deal_id: u64) -> (Pubkey, u8) {
        Pubkey::find_program_address(
            &[b"deal", seller.as_ref(), buyer.as_ref(), &deal_id.to_le_bytes()],
            &self.program_id,
        )
    }
    pub fn vault_pda(&self, deal: &Pubkey) -> (Pubkey, u8) {
        Pubkey::find_program_address(&[b"vault", deal.as_ref()], &self.program_id)
    }

    pub fn create_mint(&mut self, authority: &Keypair, decimals: u8) -> Pubkey {
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
    pub fn mint_to(&mut self, mint: &Pubkey, dest: &Pubkey, authority: &Keypair, amount: u64) {
        MintTo::new(&mut self.svm, authority, mint, dest, amount)
            .token_program_id(&self.token_program)
            .send()
            .unwrap();
    }
    pub fn balance(&self, ata: &Pubkey) -> u64 {
        use litesvm_token::get_spl_account;
        use spl_token_2022::state::Account as T22Acc;
        get_spl_account::<T22Acc>(&self.svm, ata).unwrap().amount
    }
    pub fn get_config(&self, config: &Pubkey) -> Config {
        use anchor_lang::AccountDeserialize;
        let acc = self.svm.get_account(config).unwrap();
        Config::try_deserialize(&mut &acc.data[..]).unwrap()
    }
    pub fn get_deal(&self, deal: &Pubkey) -> Deal {
        use anchor_lang::AccountDeserialize;
        let acc = self.svm.get_account(deal).unwrap();
        Deal::try_deserialize(&mut &acc.data[..]).unwrap()
    }
}

pub fn initialize_config_ix(
    program_id: &Pubkey,
    authority: &Pubkey,
    config: &Pubkey,
    treasury: &Pubkey,
    fee_bps: u16,
) -> Instruction {
    Instruction {
        program_id: *program_id,
        accounts: otc_deals::accounts::InitializeConfig {
            authority: *authority,
            config: *config,
            treasury: *treasury,
            system_program: anchor_lang::system_program::ID,
        }
        .to_account_metas(None),
        data: otc_deals::instruction::InitializeConfig { fee_bps }.data(),
    }
}

pub struct ProposeDealAccounts<'a> {
    pub seller: &'a Pubkey,
    pub buyer: &'a Pubkey,
    pub asset_mint: &'a Pubkey,
    pub payment_mint: &'a Pubkey,
    pub deal: &'a Pubkey,
    pub vault: &'a Pubkey,
    pub seller_asset_account: &'a Pubkey,
    pub token_program: &'a Pubkey,
}

pub fn propose_deal_ix(
    program_id: &Pubkey,
    a: ProposeDealAccounts,
    deal_id: u64,
    quantity: u64,
    total_price: u64,
    expires_at: i64,
    memo_hash: [u8; 32],
) -> Instruction {
    Instruction {
        program_id: *program_id,
        accounts: otc_deals::accounts::ProposeDeal {
            seller: *a.seller,
            buyer: *a.buyer,
            asset_mint: *a.asset_mint,
            payment_mint: *a.payment_mint,
            deal: *a.deal,
            vault: *a.vault,
            seller_asset_account: *a.seller_asset_account,
            asset_token_program: *a.token_program,
            system_program: anchor_lang::system_program::ID,
        }
        .to_account_metas(None),
        data: otc_deals::instruction::ProposeDeal {
            deal_id,
            quantity,
            total_price,
            expires_at,
            memo_hash,
        }
        .data(),
    }
}

pub struct AcceptDealAccounts<'a> {
    pub buyer: &'a Pubkey,
    pub asset_mint: &'a Pubkey,
    pub payment_mint: &'a Pubkey,
    pub deal: &'a Pubkey,
    pub vault: &'a Pubkey,
    pub buyer_asset_account: &'a Pubkey,
    pub buyer_payment_account: &'a Pubkey,
    pub seller_payment_account: &'a Pubkey,
    pub config: &'a Pubkey,
    pub treasury: &'a Pubkey,
    pub token_program: &'a Pubkey,
}

pub fn accept_deal_ix(program_id: &Pubkey, a: AcceptDealAccounts) -> Instruction {
    Instruction {
        program_id: *program_id,
        accounts: otc_deals::accounts::AcceptDeal {
            buyer: *a.buyer,
            asset_mint: *a.asset_mint,
            payment_mint: *a.payment_mint,
            deal: *a.deal,
            vault: *a.vault,
            buyer_asset_account: *a.buyer_asset_account,
            buyer_payment_account: *a.buyer_payment_account,
            seller_payment_account: *a.seller_payment_account,
            config: *a.config,
            treasury: *a.treasury,
            asset_token_program: *a.token_program,
            payment_token_program: *a.token_program,
            associated_token_program: anchor_spl::associated_token::ID,
            system_program: anchor_lang::system_program::ID,
        }
        .to_account_metas(None),
        data: otc_deals::instruction::AcceptDeal {}.data(),
    }
}

pub fn cancel_deal_ix(
    program_id: &Pubkey,
    seller: &Pubkey,
    asset_mint: &Pubkey,
    deal: &Pubkey,
    vault: &Pubkey,
    seller_asset_account: &Pubkey,
    token_program: &Pubkey,
) -> Instruction {
    Instruction {
        program_id: *program_id,
        accounts: otc_deals::accounts::CancelDeal {
            seller: *seller,
            asset_mint: *asset_mint,
            deal: *deal,
            vault: *vault,
            seller_asset_account: *seller_asset_account,
            asset_token_program: *token_program,
        }
        .to_account_metas(None),
        data: otc_deals::instruction::CancelDeal {}.data(),
    }
}

pub fn expire_deal_ix(
    program_id: &Pubkey,
    cranker: &Pubkey,
    seller: &Pubkey,
    asset_mint: &Pubkey,
    deal: &Pubkey,
    vault: &Pubkey,
    seller_asset_account: &Pubkey,
    token_program: &Pubkey,
) -> Instruction {
    Instruction {
        program_id: *program_id,
        accounts: otc_deals::accounts::ExpireDeal {
            cranker: *cranker,
            seller: *seller,
            asset_mint: *asset_mint,
            deal: *deal,
            vault: *vault,
            seller_asset_account: *seller_asset_account,
            asset_token_program: *token_program,
        }
        .to_account_metas(None),
        data: otc_deals::instruction::ExpireDeal {}.data(),
    }
}

/// Full-stack fixture: Config initialised; asset + USDC mints; seller
/// funded with asset tokens; buyer funded with USDC.
pub struct Fixture {
    pub ctx: TestCtx,
    pub config_authority: Keypair,
    pub config: Pubkey,
    pub treasury_owner: Keypair,
    pub treasury: Pubkey,

    pub payment_mint_authority: Keypair,
    pub payment_mint: Pubkey,
    pub asset_mint_authority: Keypair,
    pub asset_mint: Pubkey,

    pub seller: Keypair,
    pub seller_asset_ata: Pubkey,
    pub seller_payment_ata: Pubkey,

    pub buyer: Keypair,
    pub buyer_payment_ata: Pubkey,
    pub buyer_asset_ata: Pubkey,
}

impl Fixture {
    pub fn new_with_fee(fee_bps: u16, seller_supply: u64, buyer_usdc: u64) -> Self {
        let mut ctx = TestCtx::new();

        let payment_mint_authority = Keypair::new();
        ctx.fund(&payment_mint_authority.pubkey(), 5_000_000_000);
        let payment_mint = ctx.create_mint(&payment_mint_authority, USDC_DECIMALS);

        let asset_mint_authority = Keypair::new();
        ctx.fund(&asset_mint_authority.pubkey(), 5_000_000_000);
        let asset_mint = ctx.create_mint(&asset_mint_authority, 0);

        let config_authority = Keypair::new();
        ctx.fund(&config_authority.pubkey(), 5_000_000_000);
        let treasury_owner = Keypair::new();
        let treasury = ctx.create_ata(&config_authority, &treasury_owner.pubkey(), &payment_mint);
        let (config, _) = ctx.config_pda();
        let init = initialize_config_ix(
            &ctx.program_id,
            &config_authority.pubkey(),
            &config,
            &treasury,
            fee_bps,
        );
        ctx.send(init, &config_authority, &[]).unwrap();

        let seller = Keypair::new();
        ctx.fund(&seller.pubkey(), 5_000_000_000);
        let seller_asset_ata = ctx.create_ata(&seller, &seller.pubkey(), &asset_mint);
        let seller_payment_ata = ctx.create_ata(&seller, &seller.pubkey(), &payment_mint);
        if seller_supply > 0 {
            ctx.mint_to(&asset_mint, &seller_asset_ata, &asset_mint_authority, seller_supply);
        }

        let buyer = Keypair::new();
        ctx.fund(&buyer.pubkey(), 5_000_000_000);
        let buyer_payment_ata = ctx.create_ata(&buyer, &buyer.pubkey(), &payment_mint);
        let buyer_asset_ata = anchor_spl::associated_token::get_associated_token_address_with_program_id(
            &buyer.pubkey(),
            &asset_mint,
            &ctx.token_program,
        );
        if buyer_usdc > 0 {
            ctx.mint_to(&payment_mint, &buyer_payment_ata, &payment_mint_authority, buyer_usdc);
        }

        Self {
            ctx,
            config_authority,
            config,
            treasury_owner,
            treasury,
            payment_mint_authority,
            payment_mint,
            asset_mint_authority,
            asset_mint,
            seller,
            seller_asset_ata,
            seller_payment_ata,
            buyer,
            buyer_payment_ata,
            buyer_asset_ata,
        }
    }
}
