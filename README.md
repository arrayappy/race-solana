<div align="center">
  <h1>Race Solana</h1>
  <a href="#overview">Overview</a>
  <span>&nbsp;&nbsp;•&nbsp;&nbsp;</span>
  <a href="#repo-structure">Repo Structure</a>
  <span>&nbsp;&nbsp;•&nbsp;&nbsp;</span>
  <a href="#prerequisites">Prerequisites</a>
  <span>&nbsp;&nbsp;•&nbsp;&nbsp;</span>
  <a href="#development">Development</a>
  <span>&nbsp;&nbsp;•&nbsp;&nbsp;</span>
  <a href="#deployment">Deployment</a>
  <br />
  <hr />
</div>

## Overview

This project implements a racing game on the Solana blockchain. Players can join race pools with varying entry amounts, exchange SOL for in-game currency (RACE), and compete for winnings.

### Key Features
- Smart contracts for race pools with entry amounts: 0.05 SOL, 0.1 SOL, 0.25 SOL, 0.5 SOL, and 1 SOL.
- Automated collection of race entry fees and distribution of winnings.
- Support for different race types:
  - 1vs1 race: 90% to the winner, 10% to a burn wallet.
  - 3-player race: 60% to the winner, 30% to second place, 10% to a burn wallet.
  - 4+ players: 50% to the winner, 25% to second, 15% to third, and 10% to a burn wallet.
- Secure wallet connection and interaction for game players.

## Repo Structure

This repo contains the Solana program source code and client-side program tests written in TypeScript.
```.
├── programs             # Solana program source code
│   └── race-solana      # Program source folder
│       └── src
│           └── lib.rs   # Main program logic
├── tests                # TypeScript tests source folder
│   └── race-solana.ts   # Test file for the program
├── ...                  # Other misc. project config files
└── README.md
```

## Prerequisites

- Install [Rust](https://www.rust-lang.org/tools/install)
- Install [Solana](https://docs.solana.com/cli/install-solana-cli-tools)
- Install [Anchor](https://project-serum.github.io/anchor/getting-started/installation.html) (version 0.29.0 or compatible)
- Install [Node.js](https://nodejs.org/) (version 18 or higher)

## Development

### Setup steps:

1. Clone the repository and navigate to the project directory
2. Install dependencies: `npm install`
3. Build the program: `anchor build`
4. Deploy the program: `anchor deploy`

### Running Tests:
- Run the test suite: `anchor test`

### Key Components:

1. `lib.rs`: Contains the main program logic, including instructions for initializing the race admin, creating pools, joining races, and ending races with reward distribution.

2. `race-solana.ts`: Includes tests for the program, covering initialization, pool creation, race joining, and race ending with reward distribution.

For more detailed information on each component, please refer to the source code and comments within the files.

## Deployment

### Deploying to Devnet

1. Configure Solana CLI for devnet:
   ```
   solana config set --url https://api.devnet.solana.com
   ```

2. Create a new keypair for deployment (if you haven't already):
   ```
   solana-keygen new --outfile ~/.config/solana/devnet.json
   ```

3. Set the new keypair as default:
   ```
   solana config set --keypair ~/.config/solana/devnet.json
   ```

4. Airdrop some SOL to your new account:
   ```
   solana airdrop 2
   ```

5. Build the program:
   ```
   anchor build
   ```

6. Deploy the program to devnet:
   ```
   anchor deploy
   ```

7. Update the `declare_id!()` in `lib.rs` with the new program ID output from the deploy command.

8. Update the `Anchor.toml` file with the new program ID.

9. Rebuild and redeploy the program:
   ```
   anchor build
   anchor deploy
   ```

Remember to keep your devnet keypair secure and never use it for mainnet deployments.

For more detailed information on each component, please refer to the source code and comments within the files.