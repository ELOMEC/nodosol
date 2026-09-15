use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_2022::{mint_to, set_authority, MintTo, SetAuthority},
    token_interface::{spl_token_2022::instruction::AuthorityType, Mint, TokenAccount, TokenInterface},
};
use rwa_registry::state::Issuer;

use crate::{
    constants::{MAX_METADATA_URI_LEN, MAX_NAME_LEN, MAX_SYMBOL_LEN, ASSET_SEED},
    error::RwaMintError,
    events::AssetTokenized,
    state::{Asset, AssetCategory, AssetStatus},
};

#[derive(Accounts)]
#[instruction(asset_id: u64)]
pub struct TokenizeAsset<'info> {
    #[account(mut)]
    pub issuer_owner: Signer<'info>,

    /// Issuer account from rwa_registry — verified via PDA derivation.
    #[account(
        seeds = [b"issuer", issuer.owner.as_ref()],
        bump = issuer.bump,
        seeds::program = rwa_registry::ID,
        constraint = issuer.owner == issuer_owner.key(),
    )]
    pub issuer: Box<Account<'info, Issuer>>,

    #[account(
        init,
        payer = issuer_owner,
        space = 8 + Asset::INIT_SPACE,
        seeds = [ASSET_SEED, issuer_owner.key().as_ref(), &asset_id.to_le_bytes()],
        bump,
    )]
    pub asset: Box<Account<'info, Asset>>,

    #[account(
        mut,
        mint::token_program = token_program,
        mint::authority = issuer_owner,
    )]
    pub mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = issuer_owner,
        associated_token::token_program = token_program,
    )]
    pub issuer_token_account: Box<InterfaceAccount<'info, TokenAccount>>,

    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handle_tokenize_asset(
    ctx: Context<TokenizeAsset>,
    asset_id: u64,
    category: AssetCategory,
    quantity: u64,
    delivery_required: bool,
    name: String,
    symbol: String,
    metadata_uri: String,
) -> Result<()> {
    require!(quantity > 0, RwaMintError::InvalidQuantity);
    require!(
        metadata_uri.len() <= MAX_METADATA_URI_LEN,
        RwaMintError::MetadataUriTooLong
    );
    require!(name.len() <= MAX_NAME_LEN, RwaMintError::NameTooLong);
    require!(symbol.len() <= MAX_SYMBOL_LEN, RwaMintError::SymbolTooLong);
    require!(ctx.accounts.mint.supply == 0, RwaMintError::MintNotEmpty);

    let issuer = &ctx.accounts.issuer;
    require!(issuer.is_active(), RwaMintError::IssuerNotActive);
    require!(
        issuer.supports_asset_class(category.as_flag()),
        RwaMintError::AssetClassNotAuthorised
    );

    // Mint `quantity` to issuer's ATA.
    let mint_to_accounts = MintTo {
        mint: ctx.accounts.mint.to_account_info(),
        to: ctx.accounts.issuer_token_account.to_account_info(),
        authority: ctx.accounts.issuer_owner.to_account_info(),
    };
    mint_to(
        CpiContext::new(ctx.accounts.token_program.key(), mint_to_accounts),
        quantity,
    )?;

    // Disable further minting by revoking mint authority.
    let revoke_accounts = SetAuthority {
        account_or_mint: ctx.accounts.mint.to_account_info(),
        current_authority: ctx.accounts.issuer_owner.to_account_info(),
    };
    set_authority(
        CpiContext::new(ctx.accounts.token_program.key(), revoke_accounts),
        AuthorityType::MintTokens,
        None,
    )?;

    let now = Clock::get()?.unix_timestamp;
    let asset = &mut ctx.accounts.asset;
    asset.issuer_owner = ctx.accounts.issuer_owner.key();
    asset.mint = ctx.accounts.mint.key();
    asset.asset_id = asset_id;
    asset.category = category;
    asset.status = AssetStatus::Active;
    asset.quantity = quantity;
    asset.burned_amount = 0;
    asset.delivery_required = delivery_required;
    asset.name = name;
    asset.symbol = symbol;
    asset.metadata_uri = metadata_uri;
    asset.created_at = now;
    asset.updated_at = now;
    asset.bump = ctx.bumps.asset;
    asset.reserved = [0u8; 63];

    emit!(AssetTokenized {
        issuer_owner: asset.issuer_owner,
        mint: asset.mint,
        asset_id,
        category,
        quantity,
        delivery_required,
        timestamp: now,
    });

    Ok(())
}
