use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Mint};

declare_id!("ATgCyKtLjQy4A2J3GGb2mvr2X3KoDPtDN6RFRLkYpmis");

#[program]
pub mod race_solana {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let race_pool = &mut ctx.accounts.race_pool;
        race_pool.authority = ctx.accounts.authority.key();
        race_pool.burn_wallet = ctx.accounts.burn_wallet.key();
        Ok(())
    }

    pub fn create_pool(ctx: Context<CreatePool>, entry_amount: u64) -> Result<()> {
        let pool = &mut ctx.accounts.pool;
        require!(
            [50_000_000, 100_000_000, 250_000_000, 500_000_000, 1_000_000_000].contains(&entry_amount),
            ErrorCode::InvalidEntryAmount
        );
        pool.entry_amount = entry_amount;
        pool.participants = Vec::new();
        pool.is_active = true;
        Ok(())
    }

    pub fn join_race(ctx: Context<JoinRace>) -> Result<()> {
        let pool = &mut ctx.accounts.pool;
        let player = ctx.accounts.player.key();

        require!(pool.is_active, ErrorCode::RaceNotActive);
        require!(!pool.participants.contains(&player), ErrorCode::AlreadyJoined);

        // Exchange SOL for RACE tokens
        anchor_lang::system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                anchor_lang::system_program::Transfer {
                    from: ctx.accounts.player_sol_account.to_account_info(),
                    to: ctx.accounts.pool_sol_account.to_account_info(),
                },
            ),
            pool.entry_amount,
        )?;

        // Mint RACE tokens to player
        let cpi_accounts = token::MintTo {
            mint: ctx.accounts.race_mint.to_account_info(),
            to: ctx.accounts.player_race_account.to_account_info(),
            authority: ctx.accounts.race_pool.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        token::mint_to(cpi_ctx, pool.entry_amount)?;

        pool.participants.push(player);

        Ok(())
    }

    pub fn end_race(ctx: Context<EndRace>, winners: Vec<Pubkey>) -> Result<()> {
        let pool = &mut ctx.accounts.pool;
        // let race_pool = &ctx.accounts.race_pool;

        require!(pool.is_active, ErrorCode::RaceNotActive);
        require!(!winners.is_empty(), ErrorCode::NoWinners);
        require!(winners.len() <= pool.participants.len(), ErrorCode::TooManyWinners);

        #[allow(unused_variables)]
        let total_reward = pool.entry_amount * pool.participants.len() as u64;

        // match winners.len() {
        //     1 => {
        //         distribute_reward(ctx, winners[0], (total_reward * 90) / 100)?;
        //         distribute_reward(ctx, race_pool.burn_wallet, (total_reward * 10) / 100)?;
        //     }
        //     2 => {
        //         distribute_reward(ctx, winners[0], (total_reward * 60) / 100)?;
        //         distribute_reward(ctx, winners[1], (total_reward * 30) / 100)?;
        //         distribute_reward(ctx, race_pool.burn_wallet, (total_reward * 10) / 100)?;
        //     }
        //     _ => {
        //         distribute_reward(ctx, winners[0], (total_reward * 50) / 100)?;
        //         distribute_reward(ctx, winners[1], (total_reward * 25) / 100)?;
        //         distribute_reward(ctx, winners[2], (total_reward * 15) / 100)?;
        //         distribute_reward(ctx, race_pool.burn_wallet, (total_reward * 10) / 100)?;
        //     }
        // }

        pool.is_active = false;
        pool.participants.clear();

        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(init, payer = authority, space = 8 + 32 + 32)]
    pub race_pool: Account<'info, RacePool>,
    #[account(mut)]
    pub authority: Signer<'info>,
    /// CHECK: This is not dangerous because we don't read or write from this account
    pub burn_wallet: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CreatePool<'info> {
    #[account(mut)]
    pub race_pool: Account<'info, RacePool>,
    #[account(init, payer = authority, space = 8 + 8 + 32 * 100 + 1)]
    pub pool: Account<'info, Pool>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct JoinRace<'info> {
    #[account(mut)]
    pub pool: Account<'info, Pool>,
    #[account(mut)]
    pub player: Signer<'info>,
    #[account(mut)]
    /// CHECK:
    pub player_sol_account: AccountInfo<'info>,
    #[account(mut)]
    /// CHECK:
    pub pool_sol_account: AccountInfo<'info>,
    pub race_pool: Account<'info, RacePool>,
    #[account(mut)]
    pub race_mint: Account<'info, Mint>,
    #[account(mut)]
    pub player_race_account: Account<'info, TokenAccount>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct EndRace<'info> {
    #[account(mut)]
    pub race_pool: Account<'info, RacePool>,
    #[account(mut)]
    pub pool: Account<'info, Pool>,
    #[account(mut)]
    /// CHECK:
    pub pool_sol_account: AccountInfo<'info>,
    /// CHECK: This is not dangerous because we don't read or write from this account
    #[account(mut)]
    pub winner_sol_account: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
}

#[account]
pub struct RacePool {
    pub authority: Pubkey,
    pub burn_wallet: Pubkey,
}

#[account]
pub struct Pool {
    pub entry_amount: u64,
    pub participants: Vec<Pubkey>,
    pub is_active: bool,
}

#[error_code]
pub enum ErrorCode {
    #[msg("Race is not active")]
    RaceNotActive,
    #[msg("Player has already joined this race")]
    AlreadyJoined,
    #[msg("No winners provided")]
    NoWinners,
    #[msg("Too many winners provided")]
    TooManyWinners,
    #[msg("Invalid entry amount")]
    InvalidEntryAmount,
}

// fn distribute_reward<'info>(ctx: &Context<EndRace<'info>>, recipient: Pubkey, amount: u64) -> Result<()> {
//     let cpi_accounts = Transfer {
//         from: ctx.accounts.pool_sol_account.to_account_info(),
//         to: ctx.accounts.winner_sol_account.to_account_info(),
//         authority: ctx.accounts.pool.to_account_info(),
//     };
//     let cpi_program = ctx.accounts.system_program.to_account_info();
//     let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
//     anchor_lang::system_program::transfer(cpi_ctx, amount)?;
//     Ok(())
// }