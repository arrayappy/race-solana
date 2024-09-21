use anchor_lang::{accounts::signer, prelude::*};
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

    pub fn create_pool(ctx: Context<CreatePool>, total_participants: u64, entry_amount: u64) -> Result<()> {
        let pool = &mut ctx.accounts.pool;
        require!(
            total_participants <= 10,
            ErrorCode::TooManyParticipants
        );
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

        // Transfer SOL from player to pool
        anchor_lang::system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                anchor_lang::system_program::Transfer {
                    from: ctx.accounts.player.to_account_info(),
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
        let seeds = &[
            b"race_pool".as_ref(),
            // &[*ctx.bumps.get("race_pool").unwrap()],
            &[ctx.bumps.race_pool],
        ];
        let signer_seeds = &[&seeds[..]];
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);
        token::mint_to(cpi_ctx, pool.entry_amount)?;

        pool.participants.push(player);

        Ok(())
    }

    pub fn end_race<'info>(ctx: Context<'_, '_, '_, 'info, EndRace<'info>>, winner_count: u8) -> Result<()> {
        let pool = &mut ctx.accounts.pool;
        let race_pool = &ctx.accounts.race_pool;

        require!(pool.is_active, ErrorCode::RaceNotActive);
        require!(winner_count > 0, ErrorCode::NoWinners);
        require!(
            winner_count as usize <= pool.participants.len(),
            ErrorCode::TooManyWinners
        );

        let total_reward = pool.entry_amount * pool.participants.len() as u64;
        let remaining_accounts = ctx.remaining_accounts;

        msg!("winner_count: {}", winner_count);
        msg!("remaining_accounts: {:?}", remaining_accounts);
        msg!("amount: {}", total_reward);

        let pool_sol_account = ctx.accounts.pool_sol_account.to_account_info();
        let winner = remaining_accounts[0].to_account_info();
        let burn_wallet = remaining_accounts[1].to_account_info();
        let system_program = &ctx.accounts.system_program;

        anchor_lang::system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                anchor_lang::system_program::Transfer {
                    from: pool_sol_account.clone(),
                    to: winner.to_account_info(),
                },
            ),
            (total_reward * 90) / 100,
        )?;

        // send 10 to burn
        anchor_lang::system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                anchor_lang::system_program::Transfer {
                    from: pool_sol_account.clone(),
                    to: burn_wallet.to_account_info(),
                },
            ),
            (total_reward * 10) / 100,
        )?;

        // match winner_count {
        //     1 => {
        //         distribute_reward(&remaining_accounts[0], (total_reward * 90) / 100)?;
        //         distribute_reward(&remaining_accounts[1], (total_reward * 10) / 100)?; // Burn wallet
        //     }
        //     2 => {
        //         distribute_reward(&remaining_accounts[0], (total_reward * 60) / 100)?;
        //         distribute_reward(&remaining_accounts[1], (total_reward * 30) / 100)?;
        //         distribute_reward(&remaining_accounts[2], (total_reward * 10) / 100)?; // Burn wallet
        //     }
        //     _ => {
        //         distribute_reward(&remaining_accounts[0], (total_reward * 50) / 100)?;
        //         distribute_reward(&remaining_accounts[1], (total_reward * 25) / 100)?;
        //         distribute_reward(&remaining_accounts[2], (total_reward * 15) / 100)?;
        //         distribute_reward(&remaining_accounts[3], (total_reward * 10) / 100)?; // Burn wallet
        //     }
        // }

        pool.is_active = false;
        pool.participants.clear();

        Ok(())
    }
}


// fn distribute_reward(account_info: &AccountInfo, amount: u64) -> Result<()> {
//     let recipient_starting_balance = account_info.lamports();

//     **account_info.lamports.borrow_mut() = recipient_starting_balance
//         .checked_add(amount)
//         .ok_or(ErrorCode::OverflowError)?;

//     Ok(())
// }

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + 32 + 32,
        seeds = [b"race_pool"],
        bump
    )]
    pub race_pool: Account<'info, RacePool>,
    #[account(mut)]
    pub authority: Signer<'info>,
    /// CHECK: This is not dangerous because we don't read or write from this account
    pub burn_wallet: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CreatePool<'info> {
    #[account(mut, seeds = [b"race_pool"], bump)]
    pub race_pool: Account<'info, RacePool>,
    // #[account(init, payer = authority, space = 8 + 8 + 32 * 100 + 1)]
    #[account(
        init,
        payer = authority,
        space = 8 + std::mem::size_of::<Pool>() + (2 * 32) as usize,
        signer,
    )]
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
    /// CHECK: This is the pool's SOL account
    pub pool_sol_account: AccountInfo<'info>,
    #[account(seeds = [b"race_pool"], bump)]
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
    #[account(mut, seeds = [b"race_pool"], bump)]
    pub race_pool: Account<'info, RacePool>,
    #[account(mut)]
    pub pool: Account<'info, Pool>,
    #[account(mut, signer)]
    /// CHECK: This is the pool's SOL account
    pub pool_sol_account: AccountInfo<'info>,
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
    #[msg("Missing required account")]
    MissingAccount,
    #[msg("Invalid winner account")]
    InvalidWinnerAccount,
    #[msg("Invalid burn wallet")]
    InvalidBurnWallet,
    #[msg("Missing bump seed")]
    MissingBump,
    #[msg("Arithmetic overflow")]
    OverflowError,
    #[msg("Too many participants")]
    TooManyParticipants,
}
