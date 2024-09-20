// import * as anchor from '@project-serum/anchor';
// import { Program } from '@project-serum/anchor';
// import { RacePool } from '../target/types/race_pool';
// import { PublicKey, SystemProgram, Keypair } from '@solana/web3.js';
// import {
//   TOKEN_PROGRAM_ID,
//   createMint,
//   getOrCreateAssociatedTokenAccount,
//   mintTo,
// } from '@solana/spl-token';
// import * as assert from 'assert';

// describe('race_pool', () => {
//   // Configure the client to use the local cluster.
//   anchor.setProvider(anchor.AnchorProvider.env());

//   const provider = anchor.getProvider();
//   const connection = provider.connection;
//   const wallet = provider.wallet;

//   const program = anchor.workspace.RacePool as Program<RacePool>;

//   let racePoolAccount: anchor.web3.Keypair;
//   let burnWallet: anchor.web3.Keypair;
//   let raceMint: PublicKey;
//   let poolAccount: anchor.web3.Keypair;
//   let poolSolAccount: PublicKey;

//   const entryAmount = new anchor.BN(100_000_000); // 0.1 SOL in lamports

//   const player1 = anchor.web3.Keypair.generate();
//   const player2 = anchor.web3.Keypair.generate();

//   before(async () => {
//     // Generate keypairs for race pool and burn wallet
//     racePoolAccount = anchor.web3.Keypair.generate();
//     burnWallet = anchor.web3.Keypair.generate();

//     // Airdrop some SOL to burn wallet
//     const signature = await connection.requestAirdrop(
//       burnWallet.publicKey,
//       2 * anchor.web3.LAMPORTS_PER_SOL
//     );
//     await connection.confirmTransaction(signature);

//     // Create RACE token mint
//     raceMint = await createMint(
//       connection,
//       wallet.payer,
//       wallet.publicKey,
//       null,
//       9 // decimals
//     );

//     // Create the pool's SOL account (for simplicity, use the wallet's public key)
//     poolSolAccount = wallet.publicKey;
//   });

//   it('Initializes the race pool', async () => {
//     await program.methods
//       .initialize()
//       .accounts({
//         racePool: racePoolAccount.publicKey,
//         authority: wallet.publicKey,
//         burnWallet: burnWallet.publicKey,
//         systemProgram: SystemProgram.programId,
//       })
//       .signers([racePoolAccount])
//       .rpc();

//     // Fetch the race pool account to check if initialized correctly
//     const racePool = await program.account.racePool.fetch(
//       racePoolAccount.publicKey
//     );

//     assert.ok(racePool.authority.equals(wallet.publicKey));
//     assert.ok(racePool.burnWallet.equals(burnWallet.publicKey));
//   });

//   it('Creates a pool', async () => {
//     poolAccount = anchor.web3.Keypair.generate();

//     await program.methods
//       .createPool(entryAmount)
//       .accounts({
//         racePool: racePoolAccount.publicKey,
//         pool: poolAccount.publicKey,
//         authority: wallet.publicKey,
//         systemProgram: SystemProgram.programId,
//       })
//       .signers([poolAccount])
//       .rpc();

//     // Fetch the pool account to check if initialized correctly
//     const pool = await program.account.pool.fetch(poolAccount.publicKey);

//     assert.ok(pool.entryAmount.eq(entryAmount));
//     assert.ok(pool.isActive);
//     assert.ok(pool.participants.length === 0);
//   });

//   it('Players join the race', async () => {
//     // Airdrop SOL to players
//     for (let player of [player1, player2]) {
//       const signature = await connection.requestAirdrop(
//         player.publicKey,
//         2 * anchor.web3.LAMPORTS_PER_SOL
//       );
//       await connection.confirmTransaction(signature);
//     }

//     // Player 1 joins the race
//     const player1RaceAccount = await getOrCreateAssociatedTokenAccount(
//       connection,
//       wallet.payer,
//       raceMint,
//       player1.publicKey
//     );

//     await program.methods
//       .joinRace()
//       .accounts({
//         pool: poolAccount.publicKey,
//         player: player1.publicKey,
//         playerSolAccount: player1.publicKey,
//         poolSolAccount: poolSolAccount,
//         racePool: racePoolAccount.publicKey,
//         raceMint: raceMint,
//         playerRaceAccount: player1RaceAccount.address,
//         systemProgram: SystemProgram.programId,
//         tokenProgram: TOKEN_PROGRAM_ID,
//       })
//       .signers([player1])
//       .rpc();

//     // Player 2 joins the race
//     const player2RaceAccount = await getOrCreateAssociatedTokenAccount(
//       connection,
//       wallet.payer,
//       raceMint,
//       player2.publicKey
//     );

//     await program.methods
//       .joinRace()
//       .accounts({
//         pool: poolAccount.publicKey,
//         player: player2.publicKey,
//         playerSolAccount: player2.publicKey,
//         poolSolAccount: poolSolAccount,
//         racePool: racePoolAccount.publicKey,
//         raceMint: raceMint,
//         playerRaceAccount: player2RaceAccount.address,
//         systemProgram: SystemProgram.programId,
//         tokenProgram: TOKEN_PROGRAM_ID,
//       })
//       .signers([player2])
//       .rpc();

//     // Fetch the pool account to check participants
//     const pool = await program.account.pool.fetch(poolAccount.publicKey);

//     assert.ok(pool.participants.length === 2);
//     assert.ok(pool.participants[0].equals(player1.publicKey));
//     assert.ok(pool.participants[1].equals(player2.publicKey));
//   });

//   it('Ends the race and distributes rewards', async () => {
//     const winners = [player1.publicKey];

//     await program.methods
//       .endRace(winners)
//       .accounts({
//         racePool: racePoolAccount.publicKey,
//         pool: poolAccount.publicKey,
//         poolSolAccount: poolSolAccount,
//         winnerSolAccount: player1.publicKey,
//         systemProgram: SystemProgram.programId,
//       })
//       .signers([])
//       .rpc();

//     // Fetch the pool account to verify it's inactive and participants are cleared
//     const pool = await program.account.pool.fetch(poolAccount.publicKey);
//     assert.ok(!pool.isActive);
//     assert.ok(pool.participants.length === 0);
//   });
// });

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
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());

  const provider = anchor.getProvider();
  const connection = provider.connection;
  const wallet = provider.wallet;

  const program = anchor.workspace.RaceSolana as Program<RaceSolana>;

  let racePoolAccount: anchor.web3.Keypair;
  let burnWallet: anchor.web3.Keypair;
  let raceMint: PublicKey;
  let poolAccount: anchor.web3.Keypair;
  let poolSolAccount: PublicKey;

  const entryAmount = new anchor.BN(100_000_000); // 0.1 SOL in lamports

  const player1 = anchor.web3.Keypair.generate();
  const player2 = anchor.web3.Keypair.generate();

  before(async () => {
    // Generate keypairs for race pool and burn wallet
    racePoolAccount = anchor.web3.Keypair.generate();
    burnWallet = anchor.web3.Keypair.generate();

    // Airdrop some SOL to burn wallet
    const signature = await connection.requestAirdrop(
      burnWallet.publicKey,
      2 * anchor.web3.LAMPORTS_PER_SOL
    );
    await connection.confirmTransaction(signature);

    // Create RACE token mint
    raceMint = await createMint(
      connection,
      wallet.payer,
      wallet.publicKey,
      null,
      9 // decimals
    );

    // Create the pool's SOL account (for simplicity, use the wallet's public key)
    poolSolAccount = wallet.publicKey;
  });

  it('Initializes the race pool', async () => {
    await program.methods
      .initialize()
      .accounts({
        racePool: racePoolAccount.publicKey,
        authority: wallet.publicKey,
        burnWallet: burnWallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([racePoolAccount])
      .rpc();

    // Fetch the race pool account to check if initialized correctly
    const racePool = await program.account.racePool.fetch(
      racePoolAccount.publicKey
    );

    assert.ok(racePool.authority.equals(wallet.publicKey));
    assert.ok(racePool.burnWallet.equals(burnWallet.publicKey));
  });

  it('Creates a pool', async () => {
    poolAccount = anchor.web3.Keypair.generate();

    await program.methods
      .createPool(entryAmount)
      .accounts({
        racePool: racePoolAccount.publicKey,
        pool: poolAccount.publicKey,
        authority: wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([poolAccount])
      .rpc();

    // Fetch the pool account to check if initialized correctly
    const pool = await program.account.pool.fetch(poolAccount.publicKey);

    assert.ok(pool.entryAmount.eq(entryAmount));
    assert.ok(pool.isActive);
    assert.ok(pool.participants.length === 0);
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
        playerSolAccount: player1.publicKey,
        poolSolAccount: poolSolAccount,
        racePool: racePoolAccount.publicKey,
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
        playerSolAccount: player2.publicKey,
        poolSolAccount: poolSolAccount,
        racePool: racePoolAccount.publicKey,
        raceMint: raceMint,
        playerRaceAccount: player2RaceAccount.address,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([player2])
      .rpc();

    // Fetch the pool account to check participants
    const pool = await program.account.pool.fetch(poolAccount.publicKey);

    assert.ok(pool.participants.length === 2);
    assert.ok(pool.participants[0].equals(player1.publicKey));
    assert.ok(pool.participants[1].equals(player2.publicKey));
  });

  it('Ends the race and distributes rewards', async () => {
    const winners = [player1.publicKey];

    await program.methods
      .endRace(winners)
      .accounts({
        racePool: racePoolAccount.publicKey,
        pool: poolAccount.publicKey,
        poolSolAccount: poolSolAccount,
        winnerSolAccount: player1.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([])
      .rpc();

    // Fetch the pool account to verify it's inactive and participants are cleared
    const pool = await program.account.pool.fetch(poolAccount.publicKey);
    assert.ok(!pool.isActive);
    assert.ok(pool.participants.length === 0);
  });
});
