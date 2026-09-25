---
name: building-persistent-games
description: "Build and operate Xaya games whose state lives on chain: persistent worlds, MMOs, economies and games where each move is an on-chain transaction. Covers libxayagame GSPs, the XayaX Polygon bridge, names and moves, WCHI, deterministic state, Docker deployment, SQLite WAL growth, ZMQ staleness, resync and forked-chain testing. Use for building a persistent Xaya game, running or troubleshooting a GSP, configuring XayaX, registering a name, sending a move or checking game determinism. Route by where state lives, not by turn speed. For signed off-chain game channels, the Xaya Arcade, rules.wasm or @xayaarcade/sdk, use building-channel-games instead."
---

# Building persistent games on Xaya (Polygon)

**If two to four named players play each other directly - in real time or in fast turns - that is a game channel, not a persistent game: load the
building-channel-games skill instead.** Everything below assumes the chain holds the state.

This skill covers the fully-on-chain game class - persistent worlds, MMOs, economies, async and turn-based games - **and** the platform foundation
every Xaya game rests on, channel games included: names and moves through XayaAccounts, the XayaX bridge, the libxayagame GSP, the determinism law,
the dockerized deploy and day-2 operations. Start here; each deep topic has its own module file.

| Your game | Read |
|---|---|
| A persistent world, MMO, economy, or any async/turn-based game where **every move is its own on-chain transaction** | the rest of this file, then **GSP.md** to build it and **DETERMINISM.md** to prove it |
| Already built - deploying it, or a GSP that is stuck, out of sync or eating disk | **OPS.md**, with **FORK-TESTING.md** to reproduce the failure against a forked chain and no real funds |
| Two to four named players playing each other directly, moves signed off-chain, only open / join / close / dispute on chain | not persistent - use the **building-channel-games** skill |

## Skill files

| File | Read it when |
|---|---|
| **SKILL.md** (this file) | always: what persistent means, the router, the verified Polygon constants |
| **GSP.md** | building the GSP: game id, scaffolding, the chain case and genesis height, the version check, the build, XayaX and GSP flags, sending moves, registering names, verification |
| **DETERMINISM.md** | the law - what makes state byte-identical everywhere - and how to prove it |
| **OPS.md** | day 2: the dockerized deploy, WAL growth, ZMQ staleness wedges, resync, running several games on one host |
| **FORK-TESTING.md** | driving the full move → GSP → state loop against a forked Polygon chain with no real funds |
| **PITFALLS.md** | debugging something mysterious: the trap list for the on-chain path |
| **EXAMPLES.md** | real repos: libxayagame and its `mover` example, xayax, taurion, treatfighter, and the supporting public surface |

## Overview

A Xaya game = a **GSP** (Game State Processor: libxayagame plus your own game logic) that deterministically derives game state from moves stored on a
blockchain, fed by the **XayaX** bridge, which translates Polygon into the Xaya-Core-style JSON-RPC + ZMQ interface libxayagame expects.

```
Polygon ──(XayaAccounts move events)──> XayaX ──(JSON-RPC + ZMQ)──> your GSP ──(JSON-RPC)──> any client or tool
```

Data flows **one way**. The GSP never writes to the chain: players send moves to the chain from their own wallets, and every GSP reads.

**Trust this file over memory**: agents reconstructing these facts from memory invent XayaX flags, hedge on addresses, and get RPC semantics wrong.
Where a claim below names an authority path, open that file rather than believing the sentence.

The verified templates for building one - chain patch, Dockerfile, compose, move-send and name-registration scripts, real log output - are in
**GSP.md**. The worked reference implementation is the `mover/` example in the public repo **github.com/xaya/libxayagame**: `mover/logic.cpp`,
`moves.cpp`, `main.cpp` and `proto/` are small enough to read end to end, and they are the shape everything else here assumes.

## What "persistent" actually means

Four properties. If your game does not have all four, read the router again.

1. **Every move is its own on-chain transaction.** A player calls `XayaAccounts.move('p', <name>, <moveJson>, …)` from their own wallet and pays the
   gas. There is no off-chain transport, no signed state proof, no relay, no peer session: the chain *is* the transport, and the block order *is* the
   move order. Cadence is therefore bounded by block time and gas, not by your netcode, which is exactly why this architecture suits worlds,
   economies and async play and does not suit twitch play.
2. **The GSP is the only authority.** Nothing holds authoritative state except the derivation itself. Anyone can run a GSP; everyone running the same
   GSP code over the same chain gets the same state, and a client that disagrees with the GSP is simply wrong. You never "write state" anywhere: you
   send a move, and the state is whatever your rules make of it on the next block.
3. **State is a pure function of the ordered move sequence.** A genesis state at a genesis height you choose once and never change, then one
   `ProcessForward(oldState, block)` per block: `GetInitialStateInternal` and `ProcessForwardInternal` in
   `libxayagame/xayagame/gamelogic.hpp` (`GetInitialStateInternal`, `ProcessForwardInternal`). Nothing from outside the block may enter: no wall clock, no ambient input, no network read. Reorgs
   are why `ProcessBackwardsInternal` exists (same header): you emit undo data alongside every forward step so a rewind replays backwards
   instead of resyncing from genesis. The acceptance test for the whole property is two independently synced GSPs returning byte-identical
   `gamestate`; DETERMINISM.md has the law and how to prove it.
4. **There is no pending feed you should design around.** libxayagame answers `getpendingstate` with `pending moves are not tracked`
   (the `pending moves are not tracked` error in `libxayagame/xayagame/game.cpp`) unless the connector actually delivers pending moves. XayaX's `eth` connector *can* deliver them, but only
   when given **both** a websocket endpoint and an explicit watch list: `--eth_ws_url` and `--watch_for_pending_moves`
   (the `eth_ws_url` and `watch_for_pending_moves` flags in `xayax/eth/main.cpp`), and with no websocket endpoint it logs "Not using WebSocket subscriptions" and subscribes to nothing
   (the `EthChain` constructor in `xayax/eth/ethchain.cpp`). The deployed Polygon configuration runs neither flag
   (the `xayax` service in `arcade-platform/docker/docker-compose.yml`). So `pending.cpp` is optional, your UI shows a move as "sent, waiting for a block" from its own
   transaction receipt rather than from the GSP, and nothing in your rules may depend on seeing a move before it is mined.

Two foundation rules that bite fully-on-chain games hardest:

- **Invalid moves are ignored, never fatal.** Anyone can send any JSON at your game id for the price of one transaction. An unparseable or illegal
  move is a logged no-op. A move that crashes, throws or aborts your GSP is a **consensus-fatal denial of service**: every node dies identically on
  the same block, and the game stops for everyone until you ship a fix and they all resync.
- **Names are permanent.** A registered Xaya name is an ERC-721 owned by a wallet, and neither a player name nor the `g/<id>` name your game answers
  to can be renamed afterwards. Choose ids once, deliberately.

## Verified constants (Polygon mainnet)

This table is the one home for these constants in the skill tree. Every row names where to check it; re-derive rather than copy when the row says so.

| Item | Value | Authority |
|---|---|---|
| XayaAccounts (ERC-721 names + moves) | `0x8C12253F71091b9582908C8a44F78870Ec6F304F` | `XAYA_ACCOUNTS_ADDRESS` in `arcade-platform/sdk/src/lib/chain/xaya-accounts.ts` |
| WCHI token (ERC-20, **8 decimals**) | `0xE79feAAA457ad7899357E8E2065a3267aC9eE601` | `WCHI_ADDRESS` in `arcade-platform/sdk/src/lib/chain/xaya-accounts.ts`; the 8 decimals in `formatWchi` at `arcade-platform/sdk/src/lib/wager/format-wchi.ts` |
| Registration policy contract | Read `XayaAccounts.policy()` | **re-derive live** via `XayaAccounts.policy()` before approving WCHI to it: the registry can repoint its policy, and a hardcoded copy sends your approval to the wrong address (the `policy` entry of `xayaAccountsAbi` in `arcade-platform/sdk/src/lib/chain/xaya-accounts.ts`) |
| Name registration fee | Read the current policy fee | **re-derive live** via `policy.checkRegistration('p', <name>)` (the `checkRegistration` entry of the policy ABI in `arcade-platform/sdk/src/lib/chain/xaya-accounts.ts`), which is also the only way to price a name your policy treats specially |
| Chain id → chain name the GSP reports | `137` → `"polygon"` | the chain-id table in `xayax/eth/ethchain.cpp` |
| Public Polygon RPC run by the Xaya team | `https://polygon-node.xaya.io` | `arcade-platform/docker/.env.example` |
| Docker images | bridge `xaya/xayax`; build base `xaya/libxayagame` | the `xayax` service image in `arcade-platform/docker/docker-compose.yml`; the "Docker Image" section of `libxayagame/README.md` (its Docker Hub link) |
| Move namespaces | `p` for player moves; `g` for game names: an admin move rides the game's own `g/<id>` name | `PLAYER_NAMESPACE` in `arcade-platform/sdk/src/lib/chain/xaya-accounts.ts`; the `register('g', GAME_ID)` and `move('g', GAME_ID, …)` calls in `arcade-platform/scripts/onchain-e2e.ts` |

A move is one Polygon transaction and its gas is small, but price it against the current POL market yourself: never against a figure written in a
document.

Repository access: `libxayagame` and `xayax` are public on GitHub (`github.com/xaya/libxayagame`, `github.com/xaya/xayax`); `arcade-platform`, cited
above for the checked-in constants the live deployment uses, is private during the curated phase: access on request.

Channel games additionally sign their off-chain state proofs over a Xaya-specific, chain-id-prefixed message that the referee recovers byte-for-byte:
that is a channel concern, not a persistent-game one, and the exact literal lives in the building-channel-games skill's sign-prefix section; load that
skill if you need it.
