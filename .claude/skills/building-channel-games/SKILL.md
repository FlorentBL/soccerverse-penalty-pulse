---
name: building-channel-games
description: "Build multiplayer Xaya game-channel games with signed off-chain moves and on-chain disputes. Covers the hosted Xaya Arcade (the default: WASM rules plus a React/Next frontend) and standalone channel games. Use for arcade games, rules.wasm, GameAdapter, @xayaarcade/sdk, deterministic WASM, state proofs, session keys, relay, disputes, timeouts, optional wagering, or submitting a tested repository commit through GitHub. Includes source guidance for arcade-platform and the arcade game templates. Hosting an arcade server is optional. For persistent worlds or games where every move is an on-chain transaction, use building-persistent-games instead."
---

# Building channel games on Xaya

> **This corpus describes `@xayaarcade/sdk` 0.20.7.** Check the vendored
> `vendor/PLATFORM-COMMIT` and `npm run sdk:freshness` against the platform checkout
> before upgrading. The SDK's `CHANGELOG.md` owns migration details. Remote tags
> may omit releases; the platform's `sdk/package.json` is the version authority.

A **game channel** is two to four named players agreeing off-chain: every move is signed and exchanged peer-to-peer, and only open / join / close /
dispute ever touch the chain. The chain is the referee of last resort, not the transport.

**If you just want to ship a game: read ARCADE.md and stop.** That file is the whole path - rules blob, board UI, tests, GitHub review and listing - and you need nothing
else here unless it sends you back.

| Your game | Read |
|---|---|
| Hosted on the **Xaya Arcade**: you write rules + a board UI, prove it on an arcade of your own, run no servers once it is listed. **The default - start here.** | **ARCADE.md**, then **WASM.md §A** for the rules blob |
| **Standalone**: you deploy and operate your own referee GSP, relay and frontend | **STANDALONE.md**, then **WASM.md §B** |
| A persistent world, an MMO, or a game where every move is its own on-chain transaction | not a channel - use the **building-persistent-games** skill |

Also here: **WAGERING.md** (WCHI stakes on a match), **HIDDEN-INFORMATION.md** (secrets on a channel whose every state is public), **COMMIT-REVEAL.md** (simultaneous moves at N
seats), **PITFALLS.md** (traps by category), **EXAMPLES.md** (real repos), `scripts/` (copy-and-adapt templates). The rest of this file is the protocol both paths share: read it once; it is what makes a channel game different from any other
multiplayer game you have written.

## 1. When to use a channel

| | On-chain moves | Game channel |
|---|---|---|
| Cadence | seconds–minutes | sub-second, every tick |
| Players | any number | 2+: every seat signs |
| Gas per move | one tx | zero (only create/join/close/dispute touch chain) |
| Privacy between moves | none | off-chain until resolved |

Xaya channels are N-participant capable at the protocol level (`metadata.participants`), and N>2 is not theoretical: the shared relay lifted its
2-participant join cap (`MAX_PARTICIPANTS`, an operator setting in `xaya-relay`). On the Arcade the ceiling is hard: a submission must satisfy `2 <=
min <= max <= MAX_SEATS`, and `MAX_SEATS` is 4 (`arcade-platform/submissions/src/preflight.ts`, clamped to the chain's own board-player
maximum). Going wider than two seats means budgeting for N-seat turn rotation, proofs carrying every live seat's signature, and an N-way settlement
policy: none of which the 1v1 patterns in STANDALONE.md give you for free. And if moves are infrequent and gas is fine, do not build a channel at
all: it costs you a relay, signed proofs, disputes and a WebAssembly build. Channels buy latency and free moves, nothing else.

## 2. Protocol lifecycle

```
1. Player 0 creates on-chain:  {"c":{"addr":"0xSessionKey0"}}
2. Player 1 joins on-chain:    {"j":{"id":"<channelIdHex>","addr":"0xSessionKey1"}}
3. Both exchange moves off-chain over the WebSocket relay, signed with session keys (no wallet popups).
4. State proofs accumulate: initialState + a chain of signed transitions.
5. Game ends -> the WINNER auto-sends a resolution on-chain (never the loser: the loser has no
   incentive to pay gas for their own loss).
6. Opponent goes offline mid-game -> the other side files a dispute -> after DISPUTE_BLOCKS blocks
   with no resolution, the channel force-closes in the disputer's favor.
```

A separate channel-timeout constant is **unrelated** to disputes: it only reaps channels that never got a second participant. STANDALONE.md carries
both block constants with the referee GSP's source line as their authority: do not quote a value for either from memory.

## 3. The XayaX sign prefix (get this exact or every proof is silently rejected)

The referee verifies state-proof signatures via XayaX's `verifymessage` JSON-RPC, which does EIP-191 recovery over a **chain-prefixed** message:

```
keccak256("\x19Ethereum Signed Message:\n" + len(prefixed) + prefixed)
  where prefixed = "Xaya signature for chain {chainId}:\n\n" + original_message
```

Exact string, from `arcade-platform/sdk/src/lib/crypto/eth-signatures.ts`, where `xayaPrefixMessage()` is nothing but `XAYA_SIGN_PREFIX +
message`:

```ts
const XAYA_CHAIN_ID = 137; // Polygon mainnet
const XAYA_SIGN_PREFIX = `Xaya signature for chain ${XAYA_CHAIN_ID}:\n\n`;
```

That prefixing is applied on **every** off-chain sign and every verify. Signer and verifier must agree byte-for-byte or the referee recovers a
different address and rejects the whole proof chain, with no error saying so; you just see every proof refused. There is no partial-prefix or lenient
mode. This section is the literal's only home in either skill: copy it from here, never retype it.

## 4. Turn model, and turn-interleaving for simultaneous games

Xaya channels are strictly **turn-based** at the protocol level: `WhoseTurn()` returns a single participant index (or "no turn" once finished), and
the proof chain requires strict P0 -> P1 -> P0 alternation. A turn-based board game maps on directly: each player submits one input per net tick, and
the next player's move both records their own input and (if this is the second submitter for the round) advances the shared game tick.

For a genuinely **simultaneous-action** game (racing, FPS) on that same strictly-turn-based protocol, the standard pattern is **turn-interleaving**. A
round takes two protocol messages - P0 submits and the turn switches, P1 submits and the tick advances - but neither input is applied alone: both go
into the physics **together**, so neither player can react to the other within the same tick batch.

```cpp
if (!pb.has_pending_input()) {
  *newState.mutable_pending_input() = input;   // P0's turn: store input, switch to P1
  newState.set_turn(1);
} else {
  PlayerInputs playerInputs;                   // P1's turn: apply BOTH through game ticks
  playerInputs[0] = ProtoToInput(pb.pending_input());
  playerInputs[1] = ProtoToInput(input);
  for (int i = 0; i < TICKS_PER_NET_TICK; i++) gs = updateGameState(gs, playerInputs);
  newState.clear_pending_input();
  newState.set_net_tick(pb.net_tick() + 1);
}
```

This is *why* rules built around the turn-based protocol cannot simply "advance one tick for one player's input" for local prediction: see §6.

**Turn-interleaving has a hard limit, and it is not stated often enough: P1 can read P0's stored input out of the state before choosing.** The pattern is fair only when the
second submitter gains nothing from seeing the first: a physics batch, where both inputs land in the same tick and neither player could have reacted anyway. When the *choice
itself* is the secret (a thrown attack, a bid, anything rock-paper-scissors shaped), turn-interleaving is broken and no amount of care with `pending_input` fixes it: the value is
sitting in a state the opponent holds a signed copy of. The answer is a commitment: each seat publishes a hash of its choice, and only once every seat has committed does anyone
reveal. **COMMIT-REVEAL.md** is that protocol, at N seats, including what the rules do when a seat commits and never reveals.

## 4b. Hidden information, in one sentence

Every participant holds the full signed state and the referee re-executes every transition, so **there is no such thing as state one seat cannot read**. A hidden hand placed in
the board state is readable out of the proof chain by the opponent. Secrets live client-side; what crosses the wire is a *commitment* to a secret and later a proof about it.
**HIDDEN-INFORMATION.md** is the full pattern: fog of war, graduated disclosure, and the payoff table that makes refusing to reveal the losing move.

## 5. Dispute vs resolution

| Move | JSON | Effect |
|---|---|---|
| Dispute | `{"d":{...}}` | Starts the `DISPUTE_BLOCKS` timer. Requires the game still in progress: **a dispute for an already-finished game is rejected.** |
| Resolution | `{"r":{...}}` | Updates on-chain state immediately; if the proven state has a winner, the channel closes right away. |

When the game ends the **winner** sends the resolution, never the loser (no incentive to spend gas declaring your own loss). Detect it in the channel
manager: if it is nobody's turn and this client won, send the resolution; if the opponent is unresponsive mid-game, send a dispute instead: STANDALONE.md
carries the TypeScript for both branches. One exception: a **draw** has no winner, so no win path fires; the **lowest-index participant** sends the
closing resolution instead, or the channel hangs open forever. For a wagered game the draw close is also what triggers settlement (WAGERING.md).

**A dispute-timeout close never marks the board `finished`.** The referee closes the channel without advancing the on-chain state to a finished
position, so a UI that gates "you won" / "return to lobby" on a `finished` flag hangs forever ("I disputed, it stayed open"). Derive **that the match
is over** from the channel **leaving the referee's open set**: `matchOver = finished OR (seen-open AND now-gone)`.

**Do NOT infer who won from the last dispute's `whoseTurn`.** Being on the clock when a dispute expires does not decide the match: the Arcade referee
asks the game's own blob (`arcade_resolve_timeout`) at *every* seat count and settles on its answer, which may name the seat that timed out as the
winner, or split the pot by `arcade_share_weights`: falling back to the survivor close only when that answer is unusable
(`arcade-platform/engine/gsp/logic.cpp`, `ProcessExpiredDisputes`). The SDK deliberately removed exactly that `lastDisputeTurn === playerIndex ? 'lose'
: 'win'` mirror, because it tells the loser they won and the winner they forfeited (`sdk/src/lib/channel/match-outcome.ts`: read its header). On a
closed-but-not-finished channel report a neutral "match over, return to lobby"; only a `finished` board's own `winner` is authoritative.

**What the player sees when it ends, if you render the SDK's screens.** As of SDK 0.15.5 the close recap **holds until the player presses Back to Lobby, paid or free**: the free
channel's old auto-navigation is gone and its "Returning to lobby…" line now reads "Match settled." (`sdk/CHANGELOG.md`, 0.15.5). `ChannelGame`'s props and exports are unchanged,
so a game rendering it gets this for free; a custom shell that *relied* on the free-channel auto-navigation must now leave through the recap button. Since 0.18.0 the player who ends
the match **themselves** gets that screen too: pressing Close (Forfeit) used to drop them straight back to the lobby with nothing said while their opponent got the full result
overlay, and it now shows "You Lose!" with the reason - or, above two seats where the channel stays open behind them, "You left - the match continues without you." and later "Your
seat has been timed out.". A leave the wallet rejected, or one whose timeout did not land on the leaver's own seat, shows no recap at all, because nothing happened. None of this
changes the derivation above: the close is still detected by seen-open-then-gone, and nothing may gate on `finished`.

The SDK owns proof compression: `encodeProof` in
`arcade-platform/sdk/src/lib/channel/proof-encoding.ts` compresses the complete serialized proof
with fixed settings while preserving signed board bytes. Standard Polygon senders discover support
from the GSP before sending; old, unavailable or syncing referees keep legacy transport. Do not
add compression to individual rules blobs. The format, bounds and coordinated activation are
specified in `arcade-platform/docs/PROOF-COMPRESSION.md`; a custom sender must establish support
before enabling compression.

## 6. Making it feel real-time, and timing security

Channels are turn-based at the wire level: P0 sends -> relay -> P1 processes -> P1 sends -> relay -> P0 processes. For a fast game, waiting for that
round trip before updating the display causes visible stutter. The fix is a **client-side local simulation** independent of the proof exchange:

```
WITHOUT local sim (stutters): Input -> rules -> sign -> relay -> wait... -> relay <- verify <- render
WITH local sim (smooth):      Input -> LocalSim (fixed rate) -> Renderer     (immediate feedback)
                                          | async, in the background
                                       ProofChain (rules) <-> relay <-> peer
                                          v  reconcile: snap LocalSim to the authoritative proof state
```

**You write all four pieces yourself**: the SDK ships no local simulation, latency tracker or reconciliation helper (its whole real-time surface is
`timing: 'realtime'` on the adapter, which switches the in-game telemetry strip to show the net tick and nothing more), so read the sketch below as
shape, not API. The **local simulation** is an **integer-for-integer TypeScript mirror of the blob's physics**: the same fixed-point arithmetic,
the same tick order, the same rounding: **pinned to the blob by a test** that replays the committed golden trace (WASM.md §A4) through the mirror and
asserts every step byte-identical to the trace; a mirror that drifts by a sign, a rounding mode or a `-0` fails that test before it reaches a player.
A **board-state converter** turns the authoritative board JSON back into the mirror's state shape; a **latency tracker** measures proof round-trip
locally via `performance.now()` and derives a command delay `D`; a **game loop** ticks the mirror every frame and reconciles it on each new proof.

```ts
onFrame((delta) => {                    // every frame: drives rendering, never waits for proofs
  sim.setInput(playerIndex, currentInput);
  while (accumulator >= tickInterval) { localState = sim.tick(); accumulator -= tickInterval; }
});
onBoardState((boardState) => {          // whenever a new authoritative state arrives
  sim.applyAuthoritativeState(boardStateToLocalState(boardState, ctx), netTick);
  sim.setCommandDelay(latencyTracker.getRecommendedD());
});
```

- **Reconciliation**: on each authoritative proof, load its state into the mirror and **replay the local inputs issued after that proof's tick** from
  the pending-input buffer, so the player's own view stays ahead of the wire without diverging from it; smoothing over a few frames absorbs whatever
  correction remains. Because the mirror is bit-exact, a replay from an authoritative state reproduces exactly what the blob will compute for those
  inputs: the correction is only ever the opponent's unknown inputs, never arithmetic.
  **Pause condition**: `lagMs = (localGameTick - syncNetTick * ticksPerNetTick) * msPerTick`; pause and show a waiting overlay when `lagMs >
  commandDelayMs`.
- **Rate limiters**: both sides submit on a fixed timer, not as fast as possible; an auto-move helper must return `null` when there is no pending
  input, or a tight loop runs the game at double speed; a ticks-per-net-tick multiplier holds wall-clock speed constant when you change that timer:
  drop the submit rate for a bad link and raise the multiplier by the same factor.
- **None of those rates are platform constants.** The protocol fixes no tick rate, submit interval or command delay, and neither the SDK nor the
  referee reads one: they are per-game tuning. For scale only: xayaman defaults to a 120 ms submit interval
  (`INPUT_INTERVAL_MS` in `arcade-xayaman/src/hooks/use-xayaman-input.ts`) and 6 sim ticks per net tick (`TICKS_PER_NET_TICK` in
  `arcade-xayaman/src/game/types.ts`, mirroring `rules/game/constants.hpp`). Measure your own game; never inherit another's numbers as defaults.
- **Latency behaviour**: while corrections are small they are invisible; as latency climbs, the *opponent's* rendering shows correction artifacts; once
  lag exceeds `D`, or on disconnect, the game pauses with "Waiting for opponent…". Your own view is **always** smooth: it reads local input directly.
- Reach for this layer only when the core loop needs sub-turn responsiveness (movement, aiming, physics): a turn-based board game does not need it.

**Board-state converter pattern.** Convert the authoritative board JSON into whatever shape your renderer or local sim consumes, carrying a persisted
context (loaded assets, static geometry, your player index) for everything *not* in the proof: never invent it. Handle the pre-join shape (`{ phase:
"waiting for opponent" }`) explicitly; it is not an error state. Any field that is derived state but NOT part of the signed proof (a "time since X"
seeded from `0` and corrected on the next snap) must be documented at the call site: silently defaulting one to 0 makes an effect expire instantly
when its base tick is wrong. EXAMPLES.md has a real board JSON.

**Timing security.** The protocol carries **no timestamps**. All timing is local: `performance.now()` on send and receive, RTT from the gap between a
submission and the next proof, `D` derived purely from local measurements. Nothing clock-related crosses the wire, so there is nothing to fake;
combined with the relay being a dumb forwarder, there is no relay-side surface for a timing exploit, and relay logic would only add latency and attack
surface. **Debug diagnostics**: a compact always-visible bar plus a toggleable panel showing tick, sync net-tick, lag, latency, turn
count, referee height and alert flags (paused / divergence count / peer disconnect), pushed from the loops you already run.

## 7. Invariants you must not break

- **Wire-frozen constants.** The judge ABI, the move envelope, the shell's postMessage protocol and registered game ids never change meaning; new
  messages may only be appended. ARCADE.md §4 has the exact frozen list.
- **Rules must ignore invalid moves, never crash.** Anyone can send any JSON at your game; an unparseable or illegal move is a no-op, not a fatal
  error.
- **Verify every proof you receive; never trust the wire.** Walk every transition, re-execute each move through your own rules and compare the result
  against the claimed state, check each signature via `ecrecover` with the chain prefix (§3), and **drop an invalid proof entirely**: never partially
  apply it; surface it as a divergence indicator in the UI. A cheater's rules must produce byte-identical results to yours or the proof dies locally,
  before it ever reaches the chain.
- **Validation runs on attacker-controlled bytes, before any signature is checked.** During dispute and resolution the referee parses an
  attacker-supplied state and validates it pre-auth. If a malformed state passes validation and later reaches an abort, every node crashes identically
  on the same on-chain move: a **consensus-fatal, pre-auth denial of service**, one cheap move halting the game. So: validation *returns false*,
  never aborts; compare unsigned fields unsigned; bound every value used as an index; cap the total count of every attacker-sized collection so
  proof-iteration cost stays bounded; and gate it with a test feeding hand-crafted malicious states in that asserts each is rejected. STANDALONE.md
  has the three-layer C++ implementation, ARCADE.md the rules-blob equivalent.

## 8. Foundation facts you need even if you never load the other skill

- **Names and moves** go through the XayaAccounts contract on Polygon: the address is in building-persistent-games' constants table; load that skill
  for the full section.
- **WCHI has 8 decimals** (`arcade-platform/sdk/src/lib/wager/format-wchi.ts`): a stake is a `bigint` in those units, never a float.
- **The off-chain sign prefix** is §3 above, and §3 is its only home in either skill.
- **Invalid moves are ignored, not fatal**: for your rules and for the referee alike.
- **The determinism law**: the same ordered moves must produce byte-identical state on every node, so no floats, no wall clock, no unseeded RNG, no
  hash-map iteration order in anything feeding a signed proof; load the building-persistent-games skill for the full section, and see WASM.md for the
  gates that prove it.
- **Names are permanent**: a registered Xaya name is an ERC-721 you own, and a registered game's on-chain identity cannot be renamed: choose ids
  once, deliberately.

## 9. How to verify a claim in this skill

Authority beats this file, and this file beats memory. Four sources settle everything here:

1. `arcade-platform/engine/judge/wasm_judge.cpp`: the rules-blob ABI as executed: the required-export list (`kRequiredFuncs`) and the fuel, memory
   and output-buffer caps.
2. `arcade-platform/docs/ARCADE-ABI.md` - the written contract for that same ABI, kept beside the judge; if the two disagree, the judge wins.
3. `arcade-platform/submissions/src/preflight.ts` - every submission gate: artifact size caps, the seat range, the cfg suffix, the base-path check,
   slug and gameType rules.
4. `arcade-platform/sdk/src/`: the SDK surface you code against; `sdk/package.json` is the only authority for its version (never quote one from a
   document), and `sdk/src/lib/crypto/eth-signatures.ts` backs §3.

Endpoints are never a fact you hardcode: your bundle reads them from the `arcade-config.json` served beside it at runtime, and the arcade's move
namespace is whatever that file serves: it differs per plane, so `curl` it rather than remembering it.
