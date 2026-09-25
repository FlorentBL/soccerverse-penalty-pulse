# Examples: foundation and persistent-world repos

One line per repo: the link, whether you can open it today, and the one thing it is worth reading it
for. Every row here also has a row on the arcade site's `/repos` index, which is the complete list
and states your relationship to each repo (CLONE / READ / CONSUME): nothing is listed here that
`/repos` hides.

**Access marks.** A row marked *private during the curated phase: access on request* will not clone
anonymously. Ask in the Xaya Discord (https://discord.gg/FdZWZj4), in #builders, with the repo name
and what you are building. If a clone fails, **stop and tell the human**: never guess at a private
repo's contents or invent its file layout.

**Licences differ, and it matters the moment you copy code.** The foundation repos below are MIT
(`LICENSE`/`COPYING` in each of `libxayagame`, `xayax`, `xid`, `wchi`, `forked-evm-testing`); the two
worked MMO GSPs are **GPL-3.0**, so lifting a file out of one carries the licence into your own game;
and `polygon-contract` ships **no LICENSE file at all**, so it grants you nothing to copy. Check the
licence of the repo you are copying *from*, per repo, before you copy.

## The foundation: every Xaya game rests on these

| Repo | Access | What it demonstrates |
|---|---|---|
| https://github.com/xaya/libxayagame | public | **Two relationships at once.** (1) *The GSP foundation you clone and build against*: the C++ library that does block connect/disconnect, reorg rewind, SQLite-backed state, and the game RPC your client reads; your daemon is your rules linked against it. (2) *The home of the `mover` worked example*: `mover/` (game id `mv`, per `mover/README.md`) is the official minimal game: players walk an infinite integer plane, and its `logic.cpp` / `moves.cpp` / `pending.cpp` / `main.cpp` + `proto/` shape is exactly the skeleton this skill's `GSP.md` builds on. Read `mover/` end to end before writing your own game: it is the shortest complete GSP in existence. |
| https://github.com/xaya/xayax | public | The Polygon bridge. Xaya's GSP layer is base-chain agnostic, and XayaX exposes a **Xaya-Core-like interface over an EVM chain** so a libxayagame GSP runs against Polygon unmodified (`README.md`). `eth/` is the EVM connector, `xayacore/` the original Xaya Core one, `docker/` the container you run beside your GSP. You configure and run it; you almost never modify it. |

## Fully on-chain games: the persistent class

These are the reference implementations for "every move is its own transaction and the GSP is the
only authority". Read them for shape and scale, not to fork.

| Repo | Access | What it demonstrates |
|---|---|---|
| https://github.com/xaya/tfgsp | public (GPL-3.0) | **Start here**: Treat Fighter's GSP, and the clearest small map of the four parts a persistent GSP is made of: `src/moveprocessor.hpp` validates and applies each submitted move, `src/logic.hpp` runs the per-block world logic, `src/gamestatejson.hpp` serves the client only the slice of state its current screen needs, and `src/pending.hpp` signals not-yet-confirmed moves (`README.md`). Everything else is the library doing reorg and coin handling for you. |
| https://github.com/xaya/taurion_gsp | public (GPL-3.0) | The same shape at MMO scale: a persistent decentralised world with `database/` (per-entity SQLite schema and accessors), `proto/` (protobuf-serialised state blobs inside those rows), `hexagonal/` + `mapdata/` for a hex world whose region and obstacle data are downloaded separately rather than committed (`README.md`), and a `gametest/` integration suite. Read it when you need to see how a world stays a pure function of its ordered move sequence once it is large. |
| https://github.com/xaya/taurionui | private during the curated phase: access on request | The Taurion client, kept separate from the GSP above. Listed so you know the split exists; do not guess at its contents while it is closed. |
| https://github.com/xaya/treatfighter_ui | private during the curated phase: access on request | The Treat Fighter web client (Next.js + viem on Polygon, per the repo's own description): a persistent-game frontend that reads state from a GSP and writes moves as on-chain transactions. It is also the stack the forked-chain harness in this skill's `FORK-TESTING.md` was driven end to end against. |
| **Soccerverse**: a class, not a repo | no `xaya/*` repository to read | Named here because it is the third member of this family and the largest: a persistent football-management economy where transfers, tactics and share trades are all moves recomputed deterministically by a GSP anyone can run (`xaya-arcade/content/games/soccerverse.json`). There is no repo row to open: treat it as evidence the class scales, and read its public GSP API docs (https://docs.soccerverse.com/gsp-api.html) if you want to see what a world this size exposes to its clients. |

## Contracts and supporting surface

| Repo | Access | What it demonstrates |
|---|---|---|
| https://github.com/xaya/polygon-contract | public | **XayaAccounts**: `src/XayaAccounts.sol` is the contract your names live in (a name is an ERC-721 NFT) and the one whose `move()` every on-chain move goes through, with `src/XayaPolicy.sol` holding the registration-fee and validation policy and `src/NftMetadata.sol` the token metadata. The address you point XayaX at is in this skill's `SKILL.md` constants table; come here when you need the exact registration or move semantics rather than a summary of them. |
| https://github.com/xaya/wchi | public | `contracts/WCHI.sol`: the ERC-20 the platform prices in, which mimics native CHI at **8 decimals** (the `decimals` constant in `contracts/WCHI.sol`), so every raw amount you handle is in 10⁻⁸ units. `contracts/HTLCs.sol` is the hash-timelock helper. Read the token before you write anything that formats a balance. |
| https://github.com/xaya/xid | public | Proof the GSP model is not only for games: XID turns each Xaya name into a digital identity by associating signer addresses and other metadata with it, where only the name's owner can change the data (`README.md`). A second, smaller libxayagame codebase to read alongside `mover`, and the thing to reach for when you want "log in with a Xaya name" rather than to build a world. |
| https://github.com/xaya/forked-evm-testing | public | The upstream fork-testing deployment this skill's `FORK-TESTING.md` is built on: one `docker-compose.yml` bringing up an `anvil` node forked from Polygon mainnet, a XayaX instance pointed at it, your own GSP image and a helper JSON-RPC that mines blocks on demand with chosen timestamps, all behind an nginx front. `.env.example` names the four things you set: the archival `BLOCKCHAIN_ENDPOINT`, `FORK_BLOCK_NUMBER`, `ACCOUNTS_CONTRACT` and `GSP_IMAGE` (`README.md`). Real contracts, real state, no real funds. |

For the channel-game repos: the copy-me Arcade template and the first-party Arcade games, the
standalone reference implementation, and the relay and platform repos: load the
**building-channel-games** skill and read its `EXAMPLES.md`.
