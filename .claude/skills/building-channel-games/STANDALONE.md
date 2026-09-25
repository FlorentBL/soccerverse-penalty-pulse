# Standalone channel games: hosting the whole stack yourself

This is the **self-hosted** path: you build and run the on-chain referee (a libxayagame GSP), you
run a WebSocket relay, you ship your own frontend, and you own every line of the consensus code.
Nothing here is required to publish a game: if you want to ship without operating anything, read
**ARCADE.md** instead; the hosted Arcade is the default execution of this same protocol and does
every part of this file for you. Come here when you need a deployment nobody else controls, a seat
model or presentation the hosted path cannot express, or you are porting an existing standalone
game.

Read **SKILL.md** first. It carries the protocol facts this file assumes: the channel lifecycle,
the strictly turn-based model, the off-chain sign prefix, dispute vs resolution, and the
real-time reconciliation patterns. This file is the implementation half: the C++ referee, the
browser-side machinery, consensus hardening, and the deploy. Wagering on top of a channel →
**WAGERING.md**. Compiling your rules to WebAssembly → **WASM.md**.

**Reference implementation, cited throughout: the pre-split standalone Xayaman**
(`github.com/xaya/xayaman`, branch `main`) - one game running its **own** GSP + relay + frontend,
with the C++ referee in `engine/gsp/` and `engine/board/` and the browser half in
`src/lib/channel/`, `src/lib/crypto/` and `src/lib/relay/`. ⚠️ **Archived - do not start here.**
It is also **private during the curated phase: access on request**, so the file paths below are
citations telling you what the shape is, not files you can open today. Ask in Discord if you need
to read it; `/repos` on the arcade site carries the current visibility of everything named here.
It is frozen at the pre-split commit and is cited only because it is a complete, working,
end-to-end standalone stack you can read; it is **not** a template, it is not maintained, and no
new game should be forked from it. (`xayaships_frontend` / `polyxayaships` in **EXAMPLES.md**
carry the same mark.) The copy-me template for new work is the Arcade one: see ARCADE.md.

That reference stack is strictly **2-participant**, and every code sample below assumes a pair.
Going wider means budgeting for N-seat turn rotation, proofs that carry every live seat's
signature, and an N-way settlement policy: the protocol supports it
(`metadata.participants`), the reference implementation does not exercise it.

**Trust this file over memory** for the relay auth string and the session-key storage prefix.
Both are exact-match protocol details that silently break when approximated, and both are quoted
below from their authority files: re-read them at the cited paths before you deploy.

## 1. What you own, and the two block constants

| Piece | Who provides it | Notes |
|---|---|---|
| GSP referee | **you build it** | libxayagame daemon on the `xaya::ChannelGame` base: §2 |
| Board rules (C++) | **you write them** | the consensus surface; §2 and §9 |
| Channel protobufs | libxayagame, **unchanged** | `gamechannel/proto/{metadata,signatures,stateproof,broadcast}.proto` |
| WebSocket relay | shared codebase, **you run an instance** | `github.com/xaya/xaya-relay`; one instance per game; visibility is listed on the arcade's `/repos` index |
| Frontend + channel manager | **you write it** | §§3-8 |
| XayaX (Polygon → Xaya bridge) | published image | run **one** shared instance on a multi-game host: §10 |

Two block windows govern the endgame. The reference GSP's compiled-in defaults are at
`xayaman/engine/gsp/logic.hpp`: `DISPUTE_BLOCKS = 10` and `CHANNEL_TIMEOUT_BLOCKS = 12` (the
repo prefix matters: `arcade-platform` carries the same two names in its own `engine/gsp/logic.hpp`). They are
**that GSP's** values, not a platform constant: your GSP picks its own. Nor is a compiled-in
constant the only shape: the Arcade's multi-game host GSP keeps the same two names only as
*fallbacks* and reads a per-game window off its registry row instead
(`COALESCE (gr.dispute_blocks, …)` / `COALESCE (gr.channel_timeout_blocks, …)` in
`arcade-platform/engine/gsp/logic.cpp`, columns defaulting to 10 and 12 in
`arcade-platform/engine/gsp/schema.sql`). The two are unrelated: `DISPUTE_BLOCKS` is the timer a
dispute runs before the referee force-resolves the channel, while `CHANNEL_TIMEOUT_BLOCKS` only
reaps channels that never got a second participant.

## 2. The GSP referee (C++): create / join / dispute / resolve

The **consensus half** is a libxayagame GSP built on the `xaya::ChannelGame` base: the referee
that watches on-chain channel moves and force-closes disputes. Everything below is verified
against the reference GSP (`engine/gsp/`, `engine/board/`).

**Your logic class** (`engine/gsp/logic.hpp` → `YourLogic : public xaya::ChannelGame`):

```cpp
class YourLogic : public xaya::ChannelGame {
  YourBoardRules boardRules;
  const xaya::BoardRules& GetBoardRules() const override { return boardRules; }
  void SetupSchema(xaya::SQLiteDatabase& db) override;       // SetupGameChannelsSchema(db) + your tables
  void GetInitialStateBlock(unsigned& h, std::string& hash) const override;  // per-chain genesis (POLYGON case)
  void InitialiseState(xaya::SQLiteDatabase& db) override;   // empty (or the wager bootstrap: WAGERING.md)
  void UpdateState(xaya::SQLiteDatabase& db, const Json::Value& blockData) override;  // the dispatch, below
  Json::Value GetStateAsJson(const xaya::SQLiteDatabase& db) override;  // channels + stats → RPC JSON
};
```

`ChannelGame` provides `ProcessDispute()` / `ProcessResolution()`, which call `VerifyStateProof()`
for you: replaying every transition through your board's `ApplyMove` and checking every
signature. **You never verify a proof by hand.** `main.cpp` wiring is the same
`xaya::SQLiteMain(config, gameId, rules)` as a non-channel GSP, with two channel extras: `rules`
is your `ChannelGame`, and the RPC server needs the channel instance factory:
`xaya::ChannelGspInstanceFactory instanceFact(rules); config.InstanceFactory = &instanceFact;`
(`engine/gsp/main.cpp`; the class is `gamechannel/gsprpc.hpp` in libxayagame).

**The move dispatch** (`UpdateState`): each on-chain move is one key; dispatch on it, ignore
unknown or multi-key moves:

```cpp
for (const auto& mv : blockData["moves"]) {
  const std::string name = mv["name"].asString();
  const auto id  = GetIdFromMove(mv);   // for `c`, the channel id = this move's txid/mvid
  const auto& d  = mv["move"];
  if (!d.isObject()) continue;          // not an object → not a move of ours
  if (d.size() > 1) continue;           // exactly one action per move
  HandleCreateChannel     (db, d["c"], height, name, id);
  HandleJoinChannel       (db, d["j"], name, id);
  HandleAbortChannel      (db, d["a"], name);
  HandleDeclareLoss       (db, d["l"], name);
  HandleDisputeResolution (db, d["d"], height, /*isDispute=*/true);
  HandleDisputeResolution (db, d["r"], height, /*isDispute=*/false);
}
// wager admin commands arrive SEPARATELY in blockData["admin"]: see WAGERING.md
ProcessExpiredDisputes(db, height);
TimeOutChannels(db, height);
```

**On-chain move payloads**: every channel move rides the normal envelope
(`XayaAccounts.move('p', playerName, '{"g":{"<gameid>":{ <one key> }}}', …)`):

| Key | JSON | Sent by | Effect |
|---|---|---|---|
| create | `{"c":{"addr":"0x<sessionKey0>"}}` | Player 0 | opens a 1-participant channel; **channel id = this move's id** |
| join | `{"j":{"id":"<channelIdHex>","addr":"0x<sessionKey1>","seed":<uint>}}` | Player 1 | adds participant 2, sets the initial board state, bumps reinit (`seed` optional PRNG) |
| abort | `{"a":{"id":"<channelIdHex>"}}` | creator | cancels an un-joined channel |
| declare loss | `{"l":{"id":"<channelIdHex>","r":"<reinit b64>"}}` | loser | concede; `r` must equal the current reinit |
| dispute | `{"d":{"id":"<channelIdHex>","state":"<StateProof b64>"}}` | either | opens the `DISPUTE_BLOCKS` timer against an active game |
| resolution | `{"r":{"id":"<channelIdHex>","state":"<StateProof b64>"}}` | winner | pushes the latest proof; if it proves a finished state, closes now |

The joiner learns `channelIdHex` by reading the open-channels list out of the GSP's
`getcurrentstate` (the same feed the channel manager bootstraps from, §5): the create move's id
*is* the channel id.

**`reinit` (what it is).** A channel's reinit is the id/state that scopes its signature domain for
the current participant set. On create the channel is `Reinitialise(meta, "")`; on join,
`UpdateMetadataReinit(id, meta)` bumps it (participants went 1→2) and the channel is
`Reinitialise`d with the initial board state. A `StateProof`'s `initialState` is a reinit state;
`reinitId` tags which reinit an off-chain message belongs to, so a proof from a superseded
participant set is rejected. Off-chain code threads `reinitId` through
(`processOffChain(reinitId, proof)`, §5); on-chain, declare-loss carries the base64 reinit so the
GSP confirms you are conceding the *current* game.

**Board rules** (`engine/board/`): the bridge from your game logic to the protocol:

```cpp
// libxayagame's proto-board template takes BOTH proto types (state AND move);
// alias it once, as the reference implementation does (engine/board/board.hpp):
using BaseProtoBoardState =
    xaya::ProtoBoardState<proto::BoardState, proto::BoardMove>;

class YourBoardState : public BaseProtoBoardState {
  bool IsValid() const override;                                   // ★ runs on UNTRUSTED input - §9
  bool ApplyMoveProto(const proto::BoardMove& mv,
                      proto::BoardState& newState) const override;  // your rules; false on any bad input
  int  WhoseTurn() const override;                                 // participant index, or NO_TURN when finished
  unsigned TurnCount() const override;                             // THE freshness counter - must be monotonic (PITFALLS.md #18)
  Json::Value ToJson() const override;                            // the shape your board-state converter reads (SKILL.md)
};

class YourBoardRules : public xaya::ProtoBoardRules<YourBoardState> {  // ONE template param
  // REQUIRED - pure virtual in BoardRules; return ORIGINAL:
  xaya::ChannelProtoVersion GetProtoVersion(
      const xaya::proto::ChannelMetadata& meta) const override;
  // Optional: override ParseState too if the empty pre-join state ("") needs
  // special handling (the reference implementation does - engine/board/board.hpp).
};

// The starting position is a plain free function your join/start handler
// serializes into the channel's reinit state (NOT a rules-class member):
proto::BoardState InitialBoardState(const proto::Config& config);
```

`ParseState` wraps `IsValid`, and `ProcessDispute`/`ProcessResolution` call it on
attacker-supplied bytes **before** signatures are checked, so `IsValid` / `WhoseTurn` /
`ApplyMoveProto` must never `CHECK`/`abort` on bad input. This is the most important consensus
rule in the whole stack: **read §9 before you write them.**

**Protobuf schemas**: reuse the channel protos from libxayagame **unchanged**
(`gamechannel/proto/{metadata,signatures,stateproof,broadcast}.proto`). Author your game's own
`proto/{boardstate,boardmove}.proto` (+ optional `gameconfig`). Generate C++ with `protoc` (GSP
side) and TypeScript with `buf` (`target=ts`, frontend side).

**Building the channel GSP**: identical to a plain libxayagame GSP Dockerfile except: also
compile the gamechannel protos; link the channel libs `-lgamechannel -lchannelcore -lxayagame
-lxayautil -lethutils` (a non-channel GSP links just `-lxayagame -lxayautil`); source layout
`board/` + `gsp/` (logic/main/schema/gamestatejson) + `proto/`. The plain-GSP build recipe it
extends is not in this skill: one sentence of it: a libxayagame GSP is a C++ daemon built against
the libxayagame image, run with `--xaya_rpc_url` pointed at XayaX and its own `--datadir`; **load
the building-persistent-games skill for the full section.**

**Dispute lifecycle + timeouts.** `ProcessExpiredDisputes` force-resolves a channel once the
`DISPUTE_BLOCKS` timer elapses; `TimeOutChannels` reaps channels that never got a second
participant. **Neither may compute the deadline with an unsigned subtraction**: on a low-height
chain (a fresh fork or regtest) `height - DISPUTE_BLOCKS` underflows and every dispute looks
already expired. Write the comparison in **sum form** (`disputeHeight + DISPUTE_BLOCKS <= height`):
it avoids the subtraction entirely, which is why the Arcade's host GSP now uses it in **both**
passes: its own comment there says the sum form "needs no manual underflow guard, unlike the old
single-window (height - window) subtraction" (`arcade-platform/engine/gsp/logic.cpp`,
`ProcessExpiredDisputes` and `TimeOutChannels`). A `if (height < DISPUTE_BLOCKS) return;` guard in
front of a subtraction also works, but only for as long as nobody forgets it.

**And do not assume a timeout simply awards the win to the disputer**: that is one policy, not the
protocol. The Arcade's host GSP asks the game's own blob (`arcade_resolve_timeout`) what a timeout
means at *every* seat count and settles on its answer, falling back to the survivor close only when
that answer is unusable; above two seats a non-finished answer becomes a **reinit** rather than a
close, and the survivors keep playing. ARCADE.md §6 has that contract. A GSP you write yourself owns
this decision entirely: decide it deliberately. Either way a dispute-timeout close never sets the
board's `finished` flag; that UI trap, and what you may and may not infer from it, are in
SKILL.md §5.

## 3. Session keys

Session keys let every off-chain move be signed instantly with no wallet popup. MetaMask (or
equivalent) is used **only** for on-chain transactions: create, join, dispute, resolution.

**Storage prefix** (the key builder in `src/lib/crypto/session-key.ts`): `xayaman_session_<channelIdHex>`, with
a **lazy one-time migration** from a legacy prefix left over from a pre-rename build: run once,
best-effort, never blocking key access if `localStorage` is unavailable:

```ts
const STORAGE_PREFIX = 'xayaman_session_';
const LEGACY_STORAGE_PREFIX = 'racer_session_';

export function getSessionKey(channelIdHex: string): `0x${string}` {
  if (typeof window === 'undefined') return generatePrivateKey();
  migrateLegacySessionKeys();          // copies any racer_session_* forward, once
  const key = `${STORAGE_PREFIX}${channelIdHex}`;
  const existing = localStorage.getItem(key);
  if (existing) return existing as `0x${string}`;
  const pk = generatePrivateKey();
  localStorage.setItem(key, pk);
  return pk;
}
```

If you fork this pattern for a new game, pick your **own** `<yourgame>_session_` prefix and drop
the migration shim: it exists only because that game was renamed mid-project from an earlier
codename. Prefix collisions between two games served from one origin are a real hazard, not a
theoretical one.

The session key's **address** is what goes on chain, in the `"addr"` field of the create/join move.
The GSP checks off-chain signatures against that address, never against the player's main wallet.

## 4. WebSocket relay auth

All Xaya channel games can share one **relay codebase**: `github.com/xaya/xaya-relay`, listed
with its current visibility on the arcade's `/repos` index, but each game runs its **own relay
instance** pointed at its own GSP (single `GSP_URL`; same Docker image, different env). Deploy
shape in §10.

**Auth message** (verified exact format, `src/lib/relay/ws-broadcast.ts`: `RELAY_AUTH_AUDIENCE`
for the audience constant and the `authMessage` template literal that follows it, client side;
`src/auth.ts` `getAuthMessage` server side. Cited by symbol, not line: this file is the one that
moves most, and the two repos that carry it disagree on line numbers):

```
Xaya Relay Auth
Audience: <aud>
Channel: <channelIdHex>
Timestamp: <unixSeconds>
```

```ts
const RELAY_AUTH_AUDIENCE =
  (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_RELAY_AUDIENCE) ||
  'xayaships-relay-v1';

const channelIdHex = channelId.toString(16).padStart(64, '0');
const timestamp = Math.floor(Date.now() / 1000);
const authMessage =
  `Xaya Relay Auth\nAudience: ${RELAY_AUTH_AUDIENCE}\nChannel: ${channelIdHex}\nTimestamp: ${timestamp}`;
const signature = await sessionSigner.signMessage(authMessage); // Xaya-chain-prefixed: SKILL.md §3
```

The audience identifies the **relay deployment, not the game**. Its job is cross-*relay* replay
protection: it binds a signature to this relay so one captured here cannot be replayed against
another relay sharing the same `channelId` format. The relay does exact single-string equality
(`src/auth.ts` hard-rejects a mismatched audience *before* spending CPU on signature recovery), so
one value per deployment and every client connecting to it sends that same value: two clients
with different audiences cannot both be served by one relay. Because each game runs its own relay
instance, in practice that means one audience per game; `xayaships-relay-v1` is only the
**client-side** fallback baked into the snippet above, carried over from the relay's original
game. The **server has no default**: with auth enabled and `RELAY_AUTH_AUDIENCE` unset it exits at
startup (`src/index.ts`). Set it on the relay and set `NEXT_PUBLIC_RELAY_AUDIENCE` on the client to
the identical string.

The server recovers the signer from the (chain-prefixed) auth message, checks it matches the
claimed address, checks timestamp freshness against its `AUTH_TIMEOUT` window (`src/auth.ts`,
env-tunable: read your deployment's value), and enforces **single use**: an accepted
`(address, channel, signature)` triple is remembered for the freshness window and a replay of it
inside that window is rejected, so a captured signature cannot re-trigger a seat takeover.

⚠️ **The auth message must match your relay BUILD byte-for-byte.** The current relay implements
the `Audience:` line and treats it as mandatory: with auth enabled and no `RELAY_AUTH_AUDIENCE` set
the server refuses to start, and there is no optional or dual-dialect mode. Relay builds predating
that change sign `Xaya Relay Auth\nChannel: <hex>\nTimestamp: <ts>` with no audience line. Before
wiring auth, open your relay's `src/auth.ts` and make the client sign **exactly** the string the
server recovers; a one-line mismatch rejects every join, with no partial-credit failure mode.

**Server → client message types**: `subscribed`, `gsp_state`, `gsp_status`, `joined` (with
`participants`), `peer_joined`, `peer_left`, `replay` (a header before N buffered messages), and
`error`. Binary frames carry the actual `StateProof` / `BroadcastMessage` payloads; JSON frames are
control messages: dispatch on `typeof event.data === 'string'`.

The relay caps addresses per channel at `MAX_PARTICIPANTS` (`src/channel-router.ts`), an
env-tunable default that is no longer pinned at two: read it from your deployment rather than
assuming.

**It also runs a liveness sweep, and that is where a silent drop's `peer_left` comes from.** A link
that dies silently - a phone losing signal, a laptop suspended, a killed process - never fires its
own close event, so a socket with nothing to send can stay nominally open for minutes after the
network under it is gone. The relay therefore pings every registered connection on a fixed interval
and `terminate()`s any that did not answer the previous ping (`HEARTBEAT_MS`, `src/limits.ts`,
env-tunable: read your deployment's value). A terminate fires the close event the dead link never
sent, so the drop takes the ordinary path: `leaveChannel`, then `peer_left` to the rest of the
channel. That means the detection window is between one and two intervals, and it is what starts the
game's own disconnect grace: set the interval well below the stall timeout your client offers a
dispute on, or the game's timeout gets there first and the sweep buys you nothing. Browsers answer a
ping automatically, so nothing is required of the client.

The relay is a **dumb binary forwarder**: no game logic, no matchmaking, no tick loop, no
timestamps of its own. It receives bytes from one peer and immediately `ws.send()`s them to the
others. That is exactly what SKILL.md's timing-security argument rests on.

## 5. Channel manager: the off-chain state machine

One instance per browser session (`src/lib/channel/channel-manager.ts`). On the hosted path
`@xayaarcade/sdk` implements this for you and you never write it; standalone, it is yours:

```
processOnChain(blockHash, height, metadata, reinitState, proof, disputeHeight)
  → bootstraps/updates from GSP on-chain state
  → triggers auto-moves if it's our turn

processOffChain(reinitId, stateProof)
  → processes the opponent's off-chain message
  → validates reinit match + strictly-increasing turnCount before accepting
  → triggers auto-moves in response

processLocalMove(moveBytes)
  → applies the player's own move (or bot's), signs, broadcasts via relay
```

**Critical init order**: call `processOnChain()` **before** attaching to the relay. The relay's
replay buffer (§4) hands you buffered messages immediately on join: if the channel manager is not
bootstrapped yet, those are silently dropped and the match starts a state behind.

**Who sends the closing transaction.** When the game ends the **winner** sends the resolution:
never the loser, who has no incentive to spend gas declaring their own loss. Auto-detect it here:

```ts
// After auto-moves settle, if the game is DECIDED and we won.
// isFinished() is a separate question from whoseTurn() === NO_TURN, and the
// difference matters here: every finished state answers NO_TURN, but a NO_TURN
// state that is NOT finished is a real, reachable shape. Settle on the former;
// use NO_TURN only to choose resolution-vs-dispute (the GSP rejects a dispute
// naming no on-clock seat). `winner` is the board's own typed query, in the raw
// ABI convention: -1 undecided, -2 draw, else the seat index.
const finished = boardState?.isFinished();
const winner = boardState?.winner();
if (finished && winner === ourIdx) {
  txHash = await this.moveSender.sendResolution(this.currentProof);
} else if (opponentIsUnresponsive) {
  txHash = await this.moveSender.sendDispute(this.currentProof);
}
```

One exception: a **draw** has no winner, so nobody's win path fires: the **lowest-index
participant** sends the closing resolution instead (`src/lib/channel/channel-manager.ts`),
otherwise the channel hangs open forever. For a wagered game that draw close is also what triggers
settlement: see **WAGERING.md**.

**Duplicate-resolution prevention.** A flag stops `triggerAutoMoves` from firing a second
resolution tx when a pending-transaction check clears too early. It is cleared in exactly ONE
place: when the **reinit changes**, i.e. a new game on the same channel re-arms it. Clearing it
anywhere else re-opens the duplicate-tx bug; *never* clearing it blocks the next game's resolution
and locks funds:

```ts
private resolutionSent = false;
// in processOnChain, on reinit change: a fresh game re-arms the close:
if (reinitChanged) this.resolutionSent = false;
// in triggerAutoMoves / the win path:
if (finished && winner === ourIdx && !this.resolutionSent) {
  const txHash = await this.moveSender.sendResolution(this.currentProof);
  if (txHash) this.resolutionSent = true;
}
```

## 6. Auto-move re-entrancy

Signing is async, so a naive auto-move loop can re-enter itself while the previous signature is
still pending. Guard with a simple lock, and chain **inside** the lock hold: needed whenever a
game's protocol can run multiple auto-moves back-to-back (bot turns, multi-step reveals):

```ts
private autoMoveInProgress = false;

async triggerAutoMoves(): Promise<void> {
  if (this.autoMoveInProgress) return;
  this.autoMoveInProgress = true;
  try {
    let madeMove = true;
    while (madeMove) {                 // chain auto-moves inside ONE lock hold
      madeMove = false;
      const move = await this.channel.maybeAutoMove(this.boardState);
      if (move) {
        await this.applyAndBroadcast(move);
        madeMove = true;               // loop: check for a chained auto-move
      }
    }
  } finally {
    this.autoMoveInProgress = false;
  }
}
```

Do **not** chain by recursing into `triggerAutoMoves()` from inside the lock: the re-entrant call
sees the lock held and returns immediately, so chained auto-moves silently never run. The loop
form above is what the reference implementation ships
(`src/lib/channel/channel-manager.ts`). A strictly single-input-per-turn game rarely chains, but
the guard costs nothing and prevents a subtle re-entrancy bug the moment any auto-move path is
added later.

## 7. Opponent disconnect + resync

The relay emits `peer_joined` / `peer_left` (§4) on WebSocket connect/disconnect. Wire these to
the UI **and** to auto-resync:

```ts
broadcast.setPeerCallbacks(
  () => { setOpponentDisconnected(false); channelManager.resendCurrentState(); },
  () => { setOpponentDisconnected(true); },
);
```

`resendCurrentState()` re-broadcasts the current proof on rejoin: the reconnecting peer's
`processOffChain()` accepts it via the existing monotonic move-count check, so no new protocol
message is needed:

```ts
resendCurrentState(): void {
  if (!this.currentProof || !this.offChainSender) return;
  this.offChainSender.sendNewState(this.reinitId, this.currentProof);
}
```

Edge cases, all handled by that same monotonic check: both peers reconnect simultaneously (higher
count wins), a peer reconnects before the opponent advanced (the resend is not newer, silently
dropped), rapid repeated reconnects (idempotent).

## 8. Proof optimization and client-side verification

**Trimming the proof.** A naive `StateProof` accumulates every transition since channel open: for
a long match that is a lot of protobuf messages and an unbounded resolution transaction.
`optimizeProof` trims to the **minimal suffix that still carries every participant's signature
somewhere in the proof** (`src/lib/channel/state-proof.ts`, `optimizeProof`):

1. Walk backward from the last transition, tracking which participant signed each `newState`.
2. Stop as soon as every participant has signed at least one state in the walked suffix.
3. Promote that boundary transition's `newState` to become the new `initialState`.
4. The remaining (kept) transitions prove the current state from that signed checkpoint forward.

```
BEFORE (full history):
  initialState (reinit, unsigned)
  → t0 (P0 signed) → t1 (P1 signed) → ... → tN (P1 signed)

AFTER optimizeProof (2 transitions, regardless of N):
  initialState = t[N-2].newState   (already P1-signed)
  → t[N-1] (P0 signed)
  → tN     (P1 signed)             ← current state
```

Valid because the GSP's proof verification accepts an `initialState` that is not the reinit state,
**as long as every participant has signed somewhere in the proof**: the trimmed suffix still
satisfies that. If the walk cannot find every participant's signature, it returns the proof
untrimmed rather than shipping an unprovable one. Call it after every `extendStateProof()`; the
reference implementation's `extendStateProof()` does this automatically before returning. For a
two-player game it always trims to 2–3 transitions no matter how long the match ran.

**Verifying a received proof.** Both clients verify every proof received from the peer before
applying it: never trust the wire:

1. Walk every transition in the proof.
2. For each, re-execute the move through the (same) WASM `applyMove()` and compare the resulting
   state hash against the claimed `newState`.
3. Verify each signature via `ecrecover`, with the Xaya chain sign prefix (SKILL.md §3). Refuse a
   state carrying more signature entries than the channel has seats, or an entry longer than 65
   bytes: that padding credits no one but rides into every proof built on it.
4. Drop invalid proofs **entirely**: never partially apply. Surface the event as a divergence
   indicator in the UI rather than silently ignoring it: a divergence that only shows up as a
   stalled board is unreportable, and it is your first signal that native and WASM disagree.

A cheater cannot forge state this way: their WASM must produce the identical result as yours, on
identical inputs, or the proof is rejected locally before it ever reaches the chain.

## 9. Untrusted state is a pre-auth consensus DoS: the three-layer `IsValid` ★

Before real money - or any adversarial use - rides on a channel game, treat the GSP as a
**consensus system**: every node must compute the same state from the same moves, and must never
crash on attacker-crafted input.

This is the single most dangerous surface in the stack. During dispute/resolution the GSP verifies
a `StateProof` by parsing an **attacker-supplied** board state and calling `IsValid()` **before any
signature is checked**. So `IsValid` runs on fully attacker-controlled bytes. If a malformed state
passes `IsValid` and later reaches a `CHECK()`/`abort()`, the GSP crashes, and because every node
crashes identically on the same on-chain move, that is a **consensus-fatal, pre-auth denial of
service**: one cheap move halts the game chain.

Rules (`engine/board/board.cpp`: a **three-layer** defence, not one function):

1. **`IsValid()` rejects every malformed state by returning `false`**: never lets later code reach
   a `CHECK`/`abort`.
   - Compare proto integer fields **unsigned** (they are `uint32`): a value at or above the signed
     bound must be *rejected*, not silently sign-flipped negative past a signed comparison.
   - **Bound every value used as an array index** (cell indices → per-cell arrays; owner indices →
     the players vector).
   - Guard near-maximum counters against overflow.
   - **Cap the total count** of attacker-sized collections (bombs, fires, entities, …) so
     proof-iteration cost is bounded.
2. **`WhoseTurn()` degrades** an out-of-range or unvalidated turn to `NO_TURN` (the move is
   rejected), never `CHECK`/`abort`.
3. **`ApplyMove()` guards return `false`** on bad input, never `CHECK`/`abort`: it too runs on
   adversarial pre-signature states.

**Gate it.** A board-validity test feeds hand-crafted malicious states through your `ParseState`
(which wraps `IsValid`) and asserts each is rejected. In the reference implementation that test is
**baked into the GSP Docker image build** (`docker/Dockerfile.xayamand` compiles and runs
`engine/test/board_validity_test.cpp` as a build step), so a failure fails the build and it gates
**deploys**, not just `npm test`. Annotate each malicious case with the specific downstream `CHECK`
it defuses, so a future edit knows what a bound is protecting.

A rules blob on the hosted path has the same problem in a different shape: parse-vs-validate,
bound every count, and the fuel/memory/output caps. That version is in **ARCADE.md**; do not port
this C++ advice to a blob unread.

## 10. The four-service dockerized deploy

Four services on **one** compose network. Templates ship with this skill:
`scripts/docker-compose.template.yml` and `scripts/env.template`, and are the copy-paste
authority for exact flags, ports and build args:

| service | notes |
|---|---|
| `xayax` | Polygon → Xaya bridge, published image. Multi-game host: run **one shared** XayaX and attach each game's own gsp/relay/frontend to its network. |
| `gsp` | your libxayagame channel daemon, built from your repo (§2) |
| `relay` | the WebSocket relay, **one instance per game**, not built from your repo. ⚠️ Verify its auth-message format matches your client byte-for-byte before deploying: relay builds differ on the `Audience:` line (§4) |
| `frontend` | Next.js or anything else; `NEXT_PUBLIC_*` are baked at **build** time |

Channel-shaped gotchas, in the order they bite:

- **One audience string, two consumers.** Feed the relay's `RELAY_AUTH_AUDIENCE` and the
  frontend's `NEXT_PUBLIC_RELAY_AUDIENCE` build arg from the **same** compose variable, or client
  and server drift and every join is rejected (§4).
- **Declare the build arg.** Docker silently ignores an undeclared `--build-arg`, so your
  `Dockerfile.frontend` must `ARG` (and `ENV`) every `NEXT_PUBLIC_*` the compose file passes.
  Miss `NEXT_PUBLIC_RELAY_AUDIENCE` and the client quietly falls back to its built-in default
  audience: a working build that cannot join a channel.
- **`NEXT_PUBLIC_*` are inlined at build time**, so changing one means `docker compose up -d
  --build`, not a restart. The relay **URL** is the exception: derive it at runtime from
  `window.location` and the frontend stays portable across hosts.
- **The GSP's `--game_id` is the move namespace** and must match the frontend's
  `NEXT_PUBLIC_GAME_ID` and, if you wager, the wager contract's game namespace. Three places, one
  value.
- **Bind the GSP and the relay to loopback**; expose only the frontend. The relay is an
  unauthenticated fan-out to anyone who can reach its port until auth is on, and the GSP RPC has
  no auth at all.
- **Wagering needs a fresh GSP datadir** or the queue bootstrap silently skips: see
  **WAGERING.md**.

Two rules here are general Docker/GSP operations rather than channel-specific: pin the compose
network's subnet explicitly (never let Docker auto-pick on a shared host) and give a fresh GSP
datadir a Polygon start height just below the current chain head or it never catches up: **load
the building-persistent-games skill for the full deploy and day-2 operations section.**
