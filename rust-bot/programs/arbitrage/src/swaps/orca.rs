use anchor_lang::prelude::*;
use anchor_lang::solana_program::{
    instruction::{AccountMeta, Instruction},
    program::invoke,
};
use anchor_spl::token::TokenAccount;

// Orca Whirlpool program ID (mainnet)
pub const ORCA_WHIRLPOOL_PROGRAM: &str = "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc";

// Swap instruction discriminator for Orca Whirlpool
const SWAP_DISCRIMINATOR: [u8; 8] = [248, 198, 158, 145, 225, 117, 135, 200];

#[derive(Accounts)]
pub struct OrcaWhirlpoolSwap<'info> {
    /// CHECK: Whirlpool program
    pub whirlpool_program: UncheckedAccount<'info>,
    /// Token program
    pub token_program: Program<'info, anchor_spl::token::Token>,
    /// The payer / swap authority
    pub token_authority: Signer<'info>,
    /// CHECK: Whirlpool state
    #[account(mut)]
    pub whirlpool: UncheckedAccount<'info>,
    /// User token A account (source or destination depending on direction)
    #[account(mut)]
    pub token_owner_account_a: Account<'info, TokenAccount>,
    /// CHECK: Vault A of the whirlpool
    #[account(mut)]
    pub token_vault_a: UncheckedAccount<'info>,
    /// User token B account
    #[account(mut)]
    pub token_owner_account_b: Account<'info, TokenAccount>,
    /// CHECK: Vault B of the whirlpool
    #[account(mut)]
    pub token_vault_b: UncheckedAccount<'info>,
    /// CHECK: Tick array 0
    #[account(mut)]
    pub tick_array_0: UncheckedAccount<'info>,
    /// CHECK: Tick array 1
    #[account(mut)]
    pub tick_array_1: UncheckedAccount<'info>,
    /// CHECK: Tick array 2
    #[account(mut)]
    pub tick_array_2: UncheckedAccount<'info>,
    /// CHECK: Oracle account for the whirlpool
    pub oracle: UncheckedAccount<'info>,
    /// Swap state PDA
    pub swap_state: Account<'info, crate::state::SwapState>,
}

pub fn swap<'info>(
    ctx: &Context<'_, '_, '_, 'info, OrcaWhirlpoolSwap<'info>>,
    amount: u64,
    other_amount_threshold: u64,
    sqrt_price_limit: u128,
    amount_specified_is_input: bool,
    a_to_b: bool,
) -> Result<()> {
    let mut data = SWAP_DISCRIMINATOR.to_vec();
    data.extend_from_slice(&amount.to_le_bytes());
    data.extend_from_slice(&other_amount_threshold.to_le_bytes());
    data.extend_from_slice(&sqrt_price_limit.to_le_bytes());
    data.push(amount_specified_is_input as u8);
    data.push(a_to_b as u8);

    let accounts = vec![
        AccountMeta::new_readonly(*ctx.accounts.token_program.key, false),
        AccountMeta::new_readonly(*ctx.accounts.token_authority.key, true),
        AccountMeta::new(*ctx.accounts.whirlpool.key, false),
        AccountMeta::new(*ctx.accounts.token_owner_account_a.key(), false),
        AccountMeta::new(*ctx.accounts.token_vault_a.key, false),
        AccountMeta::new(*ctx.accounts.token_owner_account_b.key(), false),
        AccountMeta::new(*ctx.accounts.token_vault_b.key, false),
        AccountMeta::new(*ctx.accounts.tick_array_0.key, false),
        AccountMeta::new(*ctx.accounts.tick_array_1.key, false),
        AccountMeta::new(*ctx.accounts.tick_array_2.key, false),
        AccountMeta::new_readonly(*ctx.accounts.oracle.key, false),
    ];

    let ix = Instruction {
        program_id: *ctx.accounts.whirlpool_program.key,
        accounts,
        data,
    };

    let account_infos = vec![
        ctx.accounts.token_program.to_account_info(),
        ctx.accounts.token_authority.to_account_info(),
        ctx.accounts.whirlpool.to_account_info(),
        ctx.accounts.token_owner_account_a.to_account_info(),
        ctx.accounts.token_vault_a.to_account_info(),
        ctx.accounts.token_owner_account_b.to_account_info(),
        ctx.accounts.token_vault_b.to_account_info(),
        ctx.accounts.tick_array_0.to_account_info(),
        ctx.accounts.tick_array_1.to_account_info(),
        ctx.accounts.tick_array_2.to_account_info(),
        ctx.accounts.oracle.to_account_info(),
    ];

    invoke(&ix, &account_infos)?;
    Ok(())
}
