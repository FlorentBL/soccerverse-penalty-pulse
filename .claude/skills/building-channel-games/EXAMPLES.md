# Examples: channel-game repos

One line per repo: the link, whether you can open it today, and the one thing it is worth reading
it for. The Arcade site's `/repos` index lists project roles and access information.
The examples below are selected for implementation patterns, not an exhaustive catalogue.

**Access marks.** A row marked *private during the curated phase: access on request* will not
clone anonymously. Ask in the Xaya Discord (https://discord.gg/FdZWZj4), in #builders, with the
repo name and what you are building. If a clone fails, **stop and tell the human**: never guess at
a private repo's contents or invent its file layout.

The Xaya foundation repos are deliberately not listed here: the GSP library, the XayaX Polygon
bridge and the `mover` worked example live in the **building-persistent-games** skill's
`EXAMPLES.md`: load that skill when you need them.

## Arcade games: the hosted path

| Repo | Access | What it demonstrates |
|---|---|---|
| https://github.com/xaya/arcade-xayaman | private during the curated phase: access on request | **THE copy-me template.** A real-time simultaneous-move grid game, registered at **2..3 seats**: reproducible zero-import rules blob, board UI on the arcade SDK, e2e + determinism harnesses. You fork this one repo and no other. |
| https://github.com/xaya/arcade-xayaships | private during the curated phase: access on request | **Two seats, the born-packed codec, a freestanding SHA-256, and the commit-reveal coin flip for "who starts?"**: the pattern for unpredictability when the judge ABI hands you no entropy (below). Its rules carry their own SHA-256 (`rules/ships_sha256.hpp`) because a blob is freestanding, with no libcrypto to link. Also **a worked example of a tap-native game on a phone**: one of the shipped games that declare `fullFrameOnTouch` and mount no pad (Vector Sumo is another): it gates a tap-to-aim + Fire bar on `useCoarsePointer()` and drops from two boards to one off a measured cell size rather than a device check (`fullFrameOnTouch` in `src/lib/arcade/presentation.ts`, `src/lib/games/xayaships-adapter.tsx`). And the worked **empty-cfgSuffix** example (the "Config" section of `blob/MANIFEST.md`). |
| https://github.com/xaya/arcade-xayatrails | private during the curated phase: access on request | A neon trail-battle game at **2..4 seats**, and the proof the builder path works end to end: **the first game built and shipped by a builder with no prior arcade knowledge**, from a template fork to live with one operator Accept. Also two reference details worth stealing: a real **multi-field `cfgSuffix`** byte table at 2..4 seats (the "Config" section of `blob/MANIFEST.md`), and a **deliberate winner-take-all** `arcade_share_weights` - it exports the surface only to keep the payout path uniform, which is the honest way to choose winner-take-all rather than choosing it by omission (`rules/arcade_core.cpp`). |
| https://github.com/xaya/arcade-dungeonchannel | private during the curated phase: access on request | **The hidden-information channel game**, at **2..4 seats**. Secret per-seat knowledge that never enters the shared signed state, and the commitment/disclosure discipline that keeps it verifiable by a judge that sees only the packed bytes. Read it when your game has fog of war, a hidden hand, or anything one seat may not learn from the proof chain: this skill's `HIDDEN-INFORMATION.md` is built on it. Also: the minimal non-empty `cfgSuffix` (`01`, and it must never be empty), a **verdict-aware** share-weights split that cannot pay a convicted cheater, and a shipped game that **requires a secure context** and says so at boot (`src/game/game-shell.ts`). |
| https://github.com/xaya/arcade-vector-sumo | private during the curated phase: access on request | **Simultaneous moves by commit-reveal on a strictly turn-based protocol, at 2..4 seats**: the general pattern `SKILL.md` §4's turn-interleaving cannot express, at N seats, including what the rules do when a seat commits and never reveals. This skill's `COMMIT-REVEAL.md` is built on it. Also the opposite secure-context choice to Dungeon Channel: it ships its own **synchronous** SHA-256 (`src/lib/vector-sumo/sha256.ts`) specifically so it plays over a plain-HTTP LAN IP, and it registers **no cfg suffix at all**: its blob accepts only a zero-byte cfg. |

| https://github.com/xaya/arcade-taurion-racer | private during the curated phase: access on request | Real-time racing; touch controls in `src/lib/games/racer-adapter.ts`, payout weights and an explicit zero-ejection mask in `rules/arcade_abi.cpp`. |
| https://github.com/xaya/arcade-fps-duel | private during the curated phase: access on request | Desktop FPS tech demo with deterministic rules. The stack's `scripts/games-table.sh` marks it free-only. |
| https://github.com/xaya/arcade-taurion-rts | private during the curated phase: access on request | RTS tech demo with deterministic rules and optional skill wagers. Profile saturated states and long matches when adapting it. |

**Trap:** `https://github.com/xaya/xayaman` - no `arcade-` prefix - is the **frozen pre-split
monorepo**, not the template. Never build on it. The template is `xaya/arcade-xayaman`. The same
trap exists for `xaya/polyxayaships` against `xaya/arcade-xayaships`.

**The commit-reveal coin flip (arcade-xayaships).** The judge ABI supplies no randomness, so a
fair "who starts?" has to be built out of the players' own secrets: each side commits to a 32-byte
seed by hash, one seed is revealed, and the starting player is a single bit of a hash over the two
seeds back to back: `SHA256(seed_preimage || seed_1)[0] & 1`, with `1` meaning player 1 goes first
(`applySeedReveal` and `computeFlip` in `rules/ships_core.cpp`). Neither side can steer it without breaking the hash, and both
sides recompute it identically inside the blob. Reuse the shape whenever your rules need an
outcome no participant can predict or bias.

**Ships and Vector Sumo solve different problems and you want both rows.** Ships is commit-reveal as
a **one-shot randomness beacon**: a fair coin, once, at the start. Vector Sumo is commit-reveal as a
**per-round simultaneous-move protocol at N seats**, where the commitment hides a *choice* rather
than seeding a draw, and the hard part is what happens when someone never opens theirs. That is
`COMMIT-REVEAL.md`.

### The xayaman board JSON

This is the shape a board state converter turns into renderer types. **The blob emits no JSON**:
the `arcade_*` ABI has no JSON export and exchanges packed bytes only. This object is produced
entirely TS-side by the game's own `ParsedBoardState.toJson()`: in the template,
`XayamanPackedBoardRules.toJson()` calling `decodePackedState()` in
`src/lib/xayaman/packed-codec.ts`, a hand-maintained TypeScript mirror of the packed encoder in
`rules/arcade_core.cpp` that a fork must keep in step with its C++. It is then consumed by
`src/lib/xayaman/board-state-converter.ts`:

```
{ netTick, gameTick, finished, side, turn?, winner?,
  grid:int[169],
  players:[{cell,x,y,alive,maxBombs,bombsActive,blastRange,moveCooldown}],
  bombs:[{cell,x,y,owner,fuse,range}],
  fires:[{cell,x,y,ttl}],
  powerups:[{cell,x,y,type}] }
```

or, before the second participant joins: `{ phase: "waiting for opponent" }`, which likewise comes
from the SDK-side placeholder state, not from the blob (the referee short-circuits the empty
on-chain state without ever calling the judge). Handle this pre-join shape explicitly; it is **not**
an error state. `grid` is a flat cell array whose length is the
game's own `CELLS` constant (`src/game/types.ts` defines `CELLS = SIDE * SIDE`, 169 for
xayaman's square board). Read the converter's own header comment before copying it: the proto-era
oracle under `rules/heritage/` also has a `ToJson`, it is **not** part of the blob, and it is not
the source of this shape.

General conversion pattern:

```ts
function boardStateToGameState(boardJson, ctx /* persisted: maps, track, playerIndex */) {
  const gameTick = boardJson.gameTick ?? 0;
  return {
    tick: gameTick,
    // map WASM arrays → your renderer's types here
    // carry ctx fields forward: anything not IN the proof (loaded assets,
    // static geometry) must be supplied from context, never invented
  };
}
```

Any field that is derived state but **not** part of the signed proof (e.g. a "time since X" field
seeded from `0` and corrected on the next snap) must be documented at the call site: silently
defaulting such a field to zero has caused real bugs, such as an effect's expiry computed from the
wrong base tick and expiring instantly instead of on schedule.

## Standalone channel games: you run the GSP and the relay

| Repo | Access | What it demonstrates |
|---|---|---|
| https://github.com/xaya/xayaman | private during the curated phase: access on request; **superseded - do not start here** | The pre-split reference implementation cited throughout `STANDALONE.md`: one game running its OWN GSP + relay + frontend (channel manager, state proofs, session keys, relay client). Read it, never fork it. |
| https://github.com/xaya/soccer2d | private during the curated phase: access on request | Continuous-motion sport on the channel protocol: a deterministic Q16.16 C++ engine held to native==WASM parity, with a web client renderer over the top. |
| https://github.com/xaya/xayarts | private during the curated phase: access on request | A 2-player browser RTS: many units under one seat, showing the protocol does not assume one avatar per participant. |
| https://github.com/xaya/xayafpsdemo | private during the curated phase: access on request | The twitch-latency end of the protocol - a browser 3D shooter. Its divergences from a turn-based game are the patterns below. |
| https://github.com/xaya/taurion_racer | private during the curated phase: access on request | A 2-player real-time racer, and **the whole standalone stack in one repo**: deterministic C++ under `racer-cpp/` - Q19.12 fixed-point (`racer-cpp/math/fixed.hpp` documents 12 fractional bits, 19 integer bits and a sign bit in 32), the channel `BoardRules` (`racer-cpp/board/board.cpp`) and its own GSP daemon (`racer-cpp/gsp/`): all compiled from one source tree, with relay + frontend + GSP standing up as three services (`docker/docker-compose.yml` defines `relay`, `frontend` and `racerd`). It also **splits prediction from authority**: a TypeScript local sim for smooth visuals snapping to the signed WASM state (`README.md`), the opposite of xayafpsdemo's single-engine choice below. |
| https://github.com/xaya/xayaships_frontend | public | **Superseded: do not start here.** The Xaya Core-era ships frontend; it name-collides with `arcade-xayaships` and predates everything in this skill. |
| https://github.com/xaya/polyxayaships | private during the curated phase: access on request; **superseded - do not start here** | The frozen pre-split Polygon-era ships monorepo, kept for history. |

### Simultaneous-input / FPS patterns (xayafpsdemo)

For a genuinely twitch-latency game sitting on this same channel protocol, these diverge from a
turn-based game like xayaman: stated as patterns, not tied to any private path:

- **WASM does both prediction and authority**: no separate TypeScript local sim. The module
  exposes two entry points: a deterministic `applyNetTick(inputs[], fixedDt)` used for signed
  proofs, and a non-deterministic `applyPredictionTick(input, variableDt)` used purely for smooth
  local rendering (variable dt from the render loop). Only the net-tick path is ever signed or
  sent. The net tick is itself a fixed run of physics steps: `game-cpp/include/fps_types.h`
  defines `TICKS_PER_NET = 6`. `taurion_racer` takes the other route, keeping a TypeScript sim for
  visuals; both are legitimate, and the choice is yours.
- **Q16.16 fixed-point**: CORDIC sin/cos for angles, all arithmetic through
  `fxMul`/`fxDiv`/`fxSqrt`, and `game-cpp/include/fps_fixed.h` sets `FX_SHIFT = 16` for the
  fractional half of the word. Not xayaman's board-cell integer math, and not the Q19.12
  `taurion_racer` uses (`racer-cpp/math/fixed.hpp` sets `SHIFT = 12`). No floating point
  anywhere in anything that feeds a signed proof.
- **Input-only protocol as anti-cheat by construction**: players submit only
  `{forward, backward, left, right, jump, shoot, yaw, pitch}` (the `PlayerInput` struct at
  `game-cpp/include/fps_types.h`), never positions or health. The
  engine deterministically derives everything else under hard physics constraints (speed cap +
  friction, AABB collision, hitscan ray computed from the derived eye position, fixed damage and
  cooldown), so speed hacks and teleporting are structurally impossible rather than merely
  detected.
- **BSP collision determinism**: if collision geometry comes from an external map format parsed
  client-side, the authority's compiled-in collision data and the client's parsed data must be the
  *exact same* extracted AABBs, produced by one canonical extraction tool, or the two sides
  silently diverge on physics.
- **Vanilla renderer, no framework requirement**: the channel protocol itself has zero opinion
  about React/Next vs a plain render loop with a DOM HUD; the relay and channel-manager code are
  framework-agnostic. (The hosted Arcade path is the exception: its SDK is React/Next only today.)

## Infrastructure and platform: read or run, never fork

| Repo | Access | What it demonstrates |
|---|---|---|
| https://github.com/xaya/xaya-relay | private during the curated phase: access on request | The universal WebSocket relay a standalone channel game runs **one instance of per game**: a dumb forwarder for signed off-chain traffic, plus peer-join/leave events. Arcade games never deploy one. |
| a fork-testing deployment | the operator's deployment repo, not published | A forked-EVM deployment of the whole stack (forked chain + helper + relay + site) run locally with no real funds. Operator-grade - nothing a builder does needs it, and the public substrate it extends, `forked-evm-testing`, is listed in the building-persistent-games skill's `EXAMPLES.md`. |
| https://github.com/xaya/arcade-platform | private during the curated phase: access on request | The host GSP, the SDK you build against, the bundle server and the submissions service. It is the authority you verify ABI and judge claims against (`engine/judge/wasm_judge.cpp`, `docs/ARCADE-ABI.md`). |
| https://github.com/xaya/xaya-arcade | private during the curated phase: access on request | The arcade website itself - lobby, `/docs`, the (closed) submission front, and the shell that frames your game in an iframe. Consumed, never forked. |
| https://github.com/xaya/xaya-stack | private during the curated phase: access on request | The arcade deployment - substrate, beta, playground, chat, edge: every service a pinned submodule, `./stack up <plane>` to bring one up. Optional infrastructure for self-hosted integration testing; not required for a GitHub submission (`ARCADE.md` §3 step 4). |

For the persistent-world examples: the GSP library and its `mover` sample, the XayaX bridge, and
the on-chain MMO-class games: load the **building-persistent-games** skill and read its
`EXAMPLES.md`.

Every access mark above was read from `gh repo view xaya/<slug> --json visibility`; re-run it before trusting a row, because a repo can be opened up at any time. The file-and-line citations are `arcade-xayaman/src/lib/xayaman/board-state-converter.ts`, `arcade-xayaman/src/game/types.ts`, `arcade-xayaships/rules/ships_core.cpp`, `xayafpsdemo/game-cpp/include/fps_types.h`, `xayafpsdemo/game-cpp/include/fps_fixed.h`, `taurion_racer/racer-cpp/math/fixed.hpp`, `taurion_racer/docker/docker-compose.yml` and `taurion_racer/README.md`; the Discord invite above is the one the site itself publishes (`xaya-arcade/src/lib/constraints.ts`, `DISCORD_INVITE`).
