use anchor_lang::prelude::*;
use anchor_spl::token::TokenAccount;

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

pub mod error;
pub mod state;
pub mod swaps;

use error::ErrorCode;
use state::SwapState;
use swaps::*;

#[program]
pub mod arbitrage {
    use super::*;

    /// Initialize the swap state account (run once)
    pub fn init_swap_state(ctx: Context<InitSwapState>) -> Result<()> {
        let swap_state = &mut ctx.accounts.swap_state;
        swap_state.swap_input = 0;
        swap_state.start_balance = 0;
        swap_state.is_valid = false;
        swap_state.authority = ctx.accounts.authority.key();
        Ok(())
    }

    /// Record starting balance before arbitrage sequence begins
    pub fn start_swap(ctx: Context<TokenAndSwapState>, swap_input: u64) -> Result<()> {
        let swap_state = &mut ctx.accounts.swap_state;
        require!(
            swap_state.authority == ctx.accounts.authority.key(),
            ErrorCode::Unauthorized
        );
        swap_state.start_balance = ctx.accounts.src.amount;
        swap_state.swap_input = swap_input;
        swap_state.is_valid = true;
        Ok(())
    }

    /// Final instruction — reverts entire transaction if no profit made
    /// This is the atomic safety guarantee: either profit or nothing happens
    pub fn profit_or_revert(ctx: Context<TokenAndSwapState>) -> Result<()> {
        let swap_state = &mut ctx.accounts.swap_state;
        swap_state.is_valid = false;

        let init_balance = swap_state.start_balance;
        let final_balance = ctx.accounts.src.amount;

        msg!(
            "Arb result: start={} end={} profit={}",
            init_balance,
            final_balance,
            final_balance.saturating_sub(init_balance)
        );

        require!(final_balance > init_balance, ErrorCode::NoProfit);
        Ok(())
    }

    /// Raydium AMM v4 swap (legacy pools — highest liquidity)
    pub fn raydium_swap<'info>(
        ctx: Context<'_, '_, '_, 'info, RaydiumSwap<'info>>,
        amount_in: u64,
        minimum_amount_out: u64,
    ) -> Result<()> {
        let amount = prepare_swap(&ctx.accounts.swap_state, amount_in)?;
        swaps::raydium::swap(&ctx, amount, minimum_amount_out)?;
        finalize_swap(&mut ctx.accounts.swap_state, &ctx.accounts.user_dst)?;
        Ok(())
    }

    /// Raydium CLMM swap (concentrated liquidity pools)
    pub fn raydium_clmm_swap<'info>(
        ctx: Context<'_, '_, '_, 'info, RaydiumClmmSwap<'info>>,
        amount_in: u64,
        minimum_amount_out: u64,
        sqrt_price_limit: u128,
    ) -> Result<()> {
        let amount = prepare_swap(&ctx.accounts.swap_state, amount_in)?;
        swaps::raydium_clmm::swap(&ctx, amount, minimum_amount_out, sqrt_price_limit)?;
        finalize_swap(&mut ctx.accounts.swap_state, &ctx.accounts.user_dst)?;
        Ok(())
    }

    /// Orca Whirlpool swap (concentrated liquidity)
    pub fn orca_whirlpool_swap<'info>(
        ctx: Context<'_, '_, '_, 'info, OrcaWhirlpoolSwap<'info>>,
        amount_in: u64,
        other_amount_threshold: u64,
        sqrt_price_limit: u128,
        amount_specified_is_input: bool,
        a_to_b: bool,
    ) -> Result<()> {
        let amount = prepare_swap(&ctx.accounts.swap_state, amount_in)?;
        swaps::orca::whirlpool_swap(
            &ctx,
            amount,
            other_amount_threshold,
            sqrt_price_limit,
            amount_specified_is_input,
            a_to_b,
        )?;
        let dst = if a_to_b {
            &ctx.accounts.token_vault_b
        } else {
            &ctx.accounts.token_vault_a
        };
        finalize_swap(&mut ctx.accounts.swap_state, dst)?;
        Ok(())
    }

    /// Meteora DLMM swap (dynamic liquidity market maker)
    pub fn meteora_swap<'info>(
        ctx: Context<'_, '_, '_, 'info, MeteoraSwap<'info>>,
        amount_in: u64,
        minimum_amount_out: u64,
        swap_for_y: bool,
    ) -> Result<()> {
        let amount = prepare_swap(&ctx.accounts.swap_state, amount_in)?;
        swaps::meteora::swap(&ctx, amount, minimum_amount_out, swap_for_y)?;
        let dst = if swap_for_y {
            &ctx.accounts.reserve_y
        } else {
            &ctx.accounts.reserve_x
        };
        finalize_swap(&mut ctx.accounts.swap_state, dst)?;
        Ok(())
    }
}

/// Read current swap amount, validate state is active
pub fn prepare_swap(swap_state: &Account<SwapState>, override_amount: u64) -> Result<u64> {
    require!(swap_state.is_valid, ErrorCode::InvalidState);
    let amount = if override_amount > 0 {
        override_amount
    } else {
        swap_state.swap_input
    };
    msg!("swap in: {}", amount);
    Ok(amount)
}

/// Record output of swap as next input
pub fn finalize_swap(
    swap_state: &mut Account<SwapState>,
    user_dst: &Account<TokenAccount>,
) -> Result<()> {
    user_dst.reload()?;
    let out = user_dst.amount;
    msg!("swap out: {}", out);
    swap_state.swap_input = out;
    Ok(())
}

#[derive(Accounts)]
pub struct InitSwapState<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + SwapState::LEN,
        seeds = [b"swap_state", authority.key().as_ref()],
        bump,
    )]
    pub swap_state: Account<'info, SwapState>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct TokenAndSwapState<'info> {
    pub src: Account<'info, TokenAccount>,
    #[account(
        mut,
        seeds = [b"swap_state", authority.key().as_ref()],
        bump,
        has_one = authority,
    )]
    pub swap_state: Account<'info, SwapState>,
    pub authority: Signer<'info>,
}
