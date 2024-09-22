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

// New function to create mint with custom authority
async function createMintWithAuthority(
  connection: anchor.web3.Connection,
  payer: anchor.web3.Keypair,
  mintAuthority: PublicKey,
  decimals: number = 9
): Promise<PublicKey> {
  const mint = await createMint(
    connection,
    payer,
    mintAuthority,
    null,
    decimals
  );
  console.log('mint', mint.toBase58());
  return mint;
}

describe('race_solana', () => {
  anchor.setProvider(anchor.AnchorProvider.env());

  const provider = anchor.getProvider();
  const connection = provider.connection;
  const wallet = provider.wallet as anchor.Wallet;
  console.log('wallet', wallet.publicKey.toBase58());

  const program = anchor.workspace.RaceSolana as Program<RaceSolana>;
  console.log(program.programId);

  let raceAdminAccount: PublicKey;
  let raceAdminBump: number;
  let burnWallet: anchor.web3.Keypair;
  let raceMint: PublicKey;
  let poolAccount: PublicKey;
  let poolBump: number;
  let poolSolAccount: Keypair;
  let mintAuthority: Keypair;

  const entryAmount = new anchor.BN(100_000_000); // 0.1 SOL in lamports

  const player1 = anchor.web3.Keypair.generate();
  const player2 = anchor.web3.Keypair.generate();

  before(async () => {
    // Find PDA for race admin
    [raceAdminAccount, raceAdminBump] = await PublicKey.findProgramAddress(
      [Buffer.from("race_admin")],
      program.programId
    );

    burnWallet = anchor.web3.Keypair.generate();
    poolSolAccount = anchor.web3.Keypair.generate();
    mintAuthority = anchor.web3.Keypair.generate();

    // Airdrop some SOL to burn wallet, pool SOL account, and mint authority
    for (let account of [burnWallet.publicKey, poolSolAccount.publicKey, mintAuthority.publicKey]) {
      const signature = await connection.requestAirdrop(
        account,
        2 * anchor.web3.LAMPORTS_PER_SOL
      );
      await connection.confirmTransaction(signature);
    }

    // Create RACE token mint with custom authority
    raceMint = await createMintWithAuthority(
      connection,
      wallet.payer,
      mintAuthority.publicKey
    );

    // Find PDA for pool account
    [poolAccount, poolBump] = await PublicKey.findProgramAddress(
      [Buffer.from("pool"), wallet.publicKey.toBuffer()],
      program.programId
    );
  });

  it('Initializes the race admin', async () => {
    await program.methods
      .initialize()
      .accounts({
        raceAdmin: raceAdminAccount,
        authority: provider.publicKey,
        burnWallet: burnWallet.publicKey,
        mintAuthority: mintAuthority.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const raceAdmin = await program.account.raceAdmin.fetch(raceAdminAccount);

    assert.ok(raceAdmin.authority.equals(wallet.publicKey));
    assert.ok(raceAdmin.burnWallet.equals(burnWallet.publicKey));
    assert.ok(raceAdmin.mintAuthority.equals(mintAuthority.publicKey));
  });

  it('Creates a pool', async () => {
    await program.methods
      .createPool(new anchor.BN(2), entryAmount)
      .accounts({
        raceAdmin: raceAdminAccount,
        pool: poolAccount,
        authority: provider.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const pool = await program.account.pool.fetch(poolAccount);

    console.log(pool.participants.map((p) => p.toBase58()));

    assert.ok(pool.entryAmount.eq(entryAmount));
    assert.ok(pool.isActive);
    assert.strictEqual(pool.participants.length, 0);
    assert.ok(pool.authority.equals(provider.publicKey));
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
        pool: poolAccount,
        player: player1.publicKey,
        poolSolAccount: poolSolAccount.publicKey,
        raceAdmin: raceAdminAccount,
        raceMint: raceMint,
        playerRaceAccount: player1RaceAccount.address,
        mintAuthority: mintAuthority.publicKey,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([player1, mintAuthority])
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
        pool: poolAccount,
        player: player2.publicKey,
        poolSolAccount: poolSolAccount.publicKey,
        raceAdmin: raceAdminAccount,
        raceMint: raceMint,
        playerRaceAccount: player2RaceAccount.address,
        mintAuthority: mintAuthority.publicKey,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([player2, mintAuthority])
      .rpc();

    // Fetch the pool account to check participants
    const pool = await program.account.pool.fetch(poolAccount);
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
        pool: poolAccount,
        raceAdmin: raceAdminAccount,
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
    const pool = await program.account.pool.fetch(poolAccount);
    assert.strictEqual(pool.isActive, false, "Pool should be inactive after race ends");
    assert.strictEqual(pool.participants.length, 0, "Pool participants should be cleared");
  });
  it('Fails to create a pool with invalid entry amount', async () => {
    const invalidEntryAmount = new anchor.BN(75_000_000); // 0.075 SOL
    const [newPoolAccount] = await PublicKey.findProgramAddress(
      [Buffer.from("pool"), wallet.publicKey.toBuffer()],
      program.programId
    );
    
    try {
      await program.methods
        .createPool(new anchor.BN(2), invalidEntryAmount)
        .accounts({
          raceAdmin: raceAdminAccount,
          pool: newPoolAccount,
          authority: provider.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      assert.fail('Should have thrown an error');
    } catch (error) {
      assert.ok(error.toString().includes('InvalidEntryAmount'));
    }
  });

  it('Fails to create a pool with invalid participant count', async () => {
    const [newPoolAccount] = await PublicKey.findProgramAddress(
      [Buffer.from("pool"), wallet.publicKey.toBuffer()],
      program.programId
    );
    
    try {
      await program.methods
        .createPool(new anchor.BN(1), entryAmount)
        .accounts({
          raceAdmin: raceAdminAccount,
          pool: newPoolAccount,
          authority: provider.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      assert.fail('Should have thrown an error');
    } catch (error) {
      assert.ok(error.toString().includes('InvalidParticipantCount'));
    }
  });

  it('Refunds the pool creator when nobody joined the race', async () => {
    // Create a new pool
    const [newPoolAccount, newPoolBump] = await PublicKey.findProgramAddress(
      [Buffer.from("pool"), provider.publicKey.toBuffer()],
      program.programId
    );

    const newPoolSolAccount = anchor.web3.Keypair.generate();
    await connection.requestAirdrop(newPoolSolAccount.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL);

    await program.methods
      .createPool(new anchor.BN(2), entryAmount)
      .accounts({
        raceAdmin: raceAdminAccount,
        pool: newPoolAccount,
        authority: provider.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    // Get initial balances
    const initialAuthorityBalance = await connection.getBalance(provider.publicKey);
    const initialPoolSolBalance = await connection.getBalance(newPoolSolAccount.publicKey);

    // End the race with no participants
    await program.methods
      .endRace()
      .accounts({
        pool: newPoolAccount,
        raceAdmin: raceAdminAccount,
        poolSolAccount: newPoolSolAccount.publicKey,
        authority: provider.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([newPoolSolAccount])
      .rpc();

    // Get final balances
    const finalAuthorityBalance = await connection.getBalance(provider.publicKey);
    const finalPoolSolBalance = await connection.getBalance(newPoolSolAccount.publicKey);

    // Assert balances
    assert.strictEqual(
      finalAuthorityBalance - initialAuthorityBalance,
      entryAmount.toNumber(),
      "Pool creator didn't receive the correct refund"
    );
    assert.strictEqual(
      initialPoolSolBalance - finalPoolSolBalance,
      entryAmount.toNumber(),
      "Pool SOL account balance didn't decrease correctly"
    );

    // Check if the pool is no longer active
    const pool = await program.account.pool.fetch(newPoolAccount);
    assert.strictEqual(pool.isActive, false, "Pool should be inactive after refund");
    assert.strictEqual(pool.participants.length, 0, "Pool participants should be empty");
  });
});