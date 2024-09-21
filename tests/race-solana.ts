import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { RaceSolana } from '../target/types/race_solana';
import { PublicKey, SystemProgram, Keypair } from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from '@solana/spl-token';
import * as assert from 'assert';

describe('race_solana', () => {
  anchor.setProvider(anchor.AnchorProvider.env());

  const provider = anchor.getProvider();
  const connection = provider.connection;
  const wallet = provider.wallet as anchor.Wallet;
  console.log('wallet', wallet.publicKey.toBase58());

  const program = anchor.workspace.RaceSolana as Program<RaceSolana>;
  console.log(program.programId);

  let racePoolAccount: PublicKey;
  let racePoolBump: number;
  let burnWallet: anchor.web3.Keypair;
  let raceMint: PublicKey;
  let poolAccount: anchor.web3.Keypair;
  let poolSolAccount: Keypair; // 1 const seed, 1 dynmaic seed - pool id

  const entryAmount = new anchor.BN(100_000_000); // 0.1 SOL in lamports

  const player1 = anchor.web3.Keypair.generate();
  const player2 = anchor.web3.Keypair.generate();

  before(async () => {
    // Find PDA for race pool
    [racePoolAccount, racePoolBump] = await PublicKey.findProgramAddress(
      [Buffer.from("race_pool")],
      program.programId
    );

    burnWallet = anchor.web3.Keypair.generate();
    poolSolAccount = anchor.web3.Keypair.generate();

    // Airdrop some SOL to burn wallet and pool SOL account
    for (let account of [burnWallet.publicKey, poolSolAccount.publicKey]) {
      const signature = await connection.requestAirdrop(
        account,
        2 * anchor.web3.LAMPORTS_PER_SOL
      );
      await connection.confirmTransaction(signature);
    }

    // Create RACE token mint
    raceMint = await createMint(
      connection,
      wallet.payer,
      racePoolAccount,
      null,
      9 // decimals
    );
  });

  it('Initializes the race pool', async () => {
    await program.methods
      .initialize()
      .accounts({
        racePool: racePoolAccount,
        authority: provider.publicKey,
        burnWallet: burnWallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const racePool = await program.account.racePool.fetch(racePoolAccount);

    assert.ok(racePool.authority.equals(wallet.publicKey));
    assert.ok(racePool.burnWallet.equals(burnWallet.publicKey));
  });

  it('Creates a pool', async () => {
    poolAccount = anchor.web3.Keypair.generate();

    await program.methods
      .createPool(new anchor.BN(2), entryAmount)
      .accounts({
        racePool: racePoolAccount,
        pool: poolAccount.publicKey,
        authority: provider.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([poolAccount])
      .rpc();

    const pool = await program.account.pool.fetch(poolAccount.publicKey);

    console.log(pool.participants.map((p) => p.toBase58()));

    assert.ok(pool.entryAmount.eq(entryAmount));
    assert.ok(pool.isActive);
    assert.strictEqual(pool.participants.length, 0);
  });

  it('Players join the race', async () => {
    // Airdrop SOL to players
    for (let player of [player1, player2]) {
      const signature = await connection.requestAirdrop(
        player.publicKey,
        2 * anchor.web3.LAMPORTS_PER_SOL
      );
      await connection.confirmTransaction(signature);
    }

    // Player 1 joins the race
    const player1RaceAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      wallet.payer,
      raceMint,
      player1.publicKey
    );

    await program.methods
      .joinRace()
      .accounts({
        pool: poolAccount.publicKey,
        player: player1.publicKey,
        poolSolAccount: poolSolAccount.publicKey,
        racePool: racePoolAccount,
        raceMint: raceMint,
        playerRaceAccount: player1RaceAccount.address,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([player1])
      .rpc();

    // Player 2 joins the race
    const player2RaceAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      wallet.payer,
      raceMint,
      player2.publicKey
    );

    await program.methods
      .joinRace()
      .accounts({
        pool: poolAccount.publicKey,
        player: player2.publicKey,
        poolSolAccount: poolSolAccount.publicKey,
        racePool: racePoolAccount,
        raceMint: raceMint,
        playerRaceAccount: player2RaceAccount.address,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([player2])
      .rpc();

    // Fetch the pool account to check participants
    const pool = await program.account.pool.fetch(poolAccount.publicKey);
    console.log(pool.participants.map((p) => p.toBase58()));
    assert.strictEqual(pool.participants.length, 2);
    assert.ok(pool.participants[0].equals(player1.publicKey));
    assert.ok(pool.participants[1].equals(player2.publicKey));

    // Check if RACE tokens were minted to players
    const player1Balance = await connection.getTokenAccountBalance(player1RaceAccount.address);
    const player2Balance = await connection.getTokenAccountBalance(player2RaceAccount.address);

    assert.strictEqual(player1Balance.value.uiAmount, 0.1); // 0.1 RACE tokens
    assert.strictEqual(player2Balance.value.uiAmount, 0.1); // 0.1 RACE tokens
  });

  it('Ends the race and distributes rewards', async () => {
    // Get initial balances
    const initialPlayer1Balance = await connection.getBalance(player1.publicKey);
    const initialPlayer2Balance = await connection.getBalance(player2.publicKey);
    const initialBurnWalletBalance = await connection.getBalance(burnWallet.publicKey);

    // End the race with 2 winners
    await program.methods
      .endRace()
      .accounts({
        pool: poolAccount.publicKey,
        racePool: racePoolAccount,
        poolSolAccount: poolSolAccount.publicKey,
        authority: wallet.publicKey,
      })
      .remainingAccounts([
        { pubkey: player1.publicKey, isWritable: true, isSigner: false },
        { pubkey: player2.publicKey, isWritable: true, isSigner: false },
        { pubkey: burnWallet.publicKey, isWritable: true, isSigner: false },
      ])
      .signers([poolSolAccount])
      .rpc();

    // Get final balances
    const finalPlayer1Balance = await connection.getBalance(player1.publicKey);
    const finalPlayer2Balance = await connection.getBalance(player2.publicKey);
    const finalBurnWalletBalance = await connection.getBalance(burnWallet.publicKey);

    // Calculate expected rewards
    const totalReward = entryAmount.toNumber() * 2; // 2 participants
    const expectedPlayer1Reward = (totalReward * 60) / 100;
    const expectedPlayer2Reward = (totalReward * 30) / 100;
    const expectedBurnWalletReward = (totalReward * 10) / 100;

    // Assert balances
    assert.strictEqual(
      finalPlayer1Balance - initialPlayer1Balance,
      expectedPlayer1Reward,
      "Player 1 didn't receive the correct reward"
    );
    assert.strictEqual(
      finalPlayer2Balance - initialPlayer2Balance,
      expectedPlayer2Reward,
      "Player 2 didn't receive the correct reward"
    );
    assert.strictEqual(
      finalBurnWalletBalance - initialBurnWalletBalance,
      expectedBurnWalletReward,
      "Burn wallet didn't receive the correct amount"
    );

    // Check if the pool is no longer active
    const pool = await program.account.pool.fetch(poolAccount.publicKey);
    assert.strictEqual(pool.isActive, false, "Pool should be inactive after race ends");
    assert.strictEqual(pool.participants.length, 0, "Pool participants should be cleared");
  });
});