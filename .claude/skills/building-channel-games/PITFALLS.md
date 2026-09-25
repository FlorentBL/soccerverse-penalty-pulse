# Pitfalls (consolidated)

Hard-won lessons from building channel games: hosted on an arcade and standalone, and
covering the rules blob, the frontend, the real-time layer and wagering. **Check this list
before debugging anything that feels mysterious.**

Format: one row each, symptom → fix, grouped by the part of the stack it bites. A row exists to
make you **recognise** a failure, not to re-teach the mechanism behind it, so where another file
in this skill owns a rule, the row states the symptom, the rule in a sentence, and points there.
Follow the pointer before you act on the summary.

**Row numbers are stable identities, not an order.** A row keeps its number for life so that
anything citing "row 19" still means row 19; new rows are filed under the heading they belong to and
take the next free number, which is why the numbering inside a table jumps. Read the headings, not
the sequence.

The **Applies to** column says which path the row is about:

- **Arcade**: a game hosted on an arcade: a `rules.wasm` blob judged by the shared host
  GSP, a UI bundle built on `@xayaarcade/sdk`, handed over for listing (ARCADE.md).
- **Standalone**: a channel game you host yourself: your own GSP referee, your own relay,
  your own frontend (STANDALONE.md).
- **Both**: the rule holds either way.

Full context: SKILL.md (the channel protocol), ARCADE.md (hosted path), STANDALONE.md
(self-hosted referee), WASM.md (rules blob + WASM toolchain), WAGERING.md, EXAMPLES.md.
On-chain and GSP-operations pitfalls: Docker networking, XayaX flags, SQLite WAL growth,
ZMQ staleness wedges: are deliberately not repeated here; load the
building-persistent-games skill for that list.

## Arcade

| # | Applies to | Pitfall | Fix |
|---|---|---|---|
| 1 | Arcade | Bundle built without `NEXT_PUBLIC_GAME_ID` | Passes pre-flight, gets registered: then **refuses to boot**: a clean refusal screen, zero console errors. The bundle must be built with the *arcade's* shared move namespace, never your own game key. `scripts/build-export.sh` refuses a `--bundle` build without it, which is where you want to find out. ARCADE.md §3 step 4 gives the value and the build line; §4 owns the `gameId`-vs-`moveNamespace` rule behind it. |
| 2 | Arcade | Removing the template's `rules/heritage/` per its README leaves a broken build | Besides the directory and the two Makefile targets you must also remove the protobuf gen rule + `PB_CC`, the `\| $(PB_CC)` order-only prereqs on the surviving object rules, `HERITAGE_OBJS`, the two oracle test `.cpp` files, and fix `run-tests.sh` + the CI labels (`blob/tests/Makefile`). Delete heritage *together with* the old rules - it is a test oracle valid only against the rules it was ported from. |
| 3 | Arcade | `blob-fresh` fails and you go looking for a stale-timestamp cause | There is no timestamp in it - the target checks presence, the sha256 against the committed sidecar, and `check-blob.sh`'s structural gate, and mtimes are deliberately never consulted (`blob/tests/Makefile`). So a red `blob-fresh` means the blob is missing, does not match its sidecar, or is structurally wrong: rebuild with `blob/build-blob.sh`, and never "fix" it by rewriting the sidecar. WASM.md §A2 owns the sidecar rule. |
| 4 | Arcade | Stale `blob/tests/.build/cmake` after editing `rules/CMakeLists.txt` | The generated cmake dir has no dependency on your CMakeLists: the `$(CMAKEDIR)/Makefile` rule only fires when the file is absent (`blob/tests/Makefile`), so a target rename fails with "No rule to make target". `rm -rf blob/tests/.build` after any CMakeLists change. |
| 5 | Arcade | cfg suffix omitted in the submission | A blob that expects cfg bytes wedges every channel part-filled. Your fork's value lives in `blob/MANIFEST.md`; pre-flight forces an explicit none-or-hex answer, making an omitted `cfgSuffix` an error rather than a silent empty one. The suffix also gates the seed: the host prefixes `LE32(channel seed)` **only when the registered `cfgSuffix` is non-empty** (`blob/MANIFEST.md`), so "no suffix" also means "no per-channel seed". The inverse is as silent: a suffix registered for a blob that wants none makes the host prefix `LE32(seed)`, the blob refuses the length, and channels wedge the same way: submit `cfgSuffix: null` and have the blob reject every non-zero length (ARCADE.md §3 step 2). |
| 6 | Arcade | React Compiler freezes "animations" | Game frontends build with `reactCompiler: true` (`next.config.ts`): any impure read in render scope (`Date.now`, `Math.random`, a direct store read) gets argument-keyed-memoized and silently freezes. Drive animation from a `requestAnimationFrame` loop reading refs, and verify against the BUILT bundle - the bug is invisible to jsdom tests. |
| 7 | Arcade | Assuming the ABI provides randomness or a clock | It provides neither - state bytes and move bytes only. Unpredictability must come from player move payloads under a commit-reveal discipline; per-channel variety can come from the channel-seed prefix of cfg (`blob/MANIFEST.md`, and row 5). |
| 8 | Arcade | Building on `xaya/xayaman` (no `arcade-` prefix) | That is the FROZEN pre-split monorepo, kept only as a reference implementation. The copy-me template is **`xaya/arcade-xayaman`**; fork that one. |
| 9 | Arcade | A hand-written root-absolute URL 404s once the game is mounted | A `--bundle` build bakes the `__arcade_base__` placeholder and registration rewrites **only that token** to your real mount, so anything Next does not own - a literal `src="/…"`, a CSS `url(/…)`, any root-absolute URL you assemble at runtime - escapes the rewrite and 404s under the mount and nowhere else. Keep every asset reference relative or route it through Next. ARCADE.md §5 owns the base-path rule, the escape list and the pre-flight token check. |
| 58 | Both | A game that hashes in the browser works on the deployed arcade and "freezes" on a LAN IP or a plain-HTTP host | `crypto.subtle` exists **only in a secure context** - HTTPS or `localhost` - and is `undefined` over a LAN IP, so every call rejects and the symptom is a game that stops advancing rather than an error anyone sees. **The SDK does not have this problem**: it uses `@noble/hashes` for exactly this reason (`sdk/src/lib/crypto/sha256.ts`). Your own code might. Either import the SDK's `sha256` from `@xayaarcade/sdk/core`, or ship a synchronous implementation of your own, or - if you genuinely need Web Crypto - **gate at boot with a message naming the fix**, never let it fail per-frame. ARCADE.md §3 step 3 owns the rule and names a shipped example of each of the three routes. |
| 59 | Arcade | A 3- or 4-seat game quietly settles winner-take-all | Not exporting `arcade_share_weights` is not "no opinion", it is an opinion: the host falls back to plain winner/draw, and above two seats a finished terminal naming no executable payout does not even settle: it clears the dispute and leaves the pot where it is. Xayaman, Xayatrails, Dungeon Channel and Taurion Racer export weights; Xayaships and Vector Sumo do not. Decide it deliberately; ARCADE.md §6 owns the wire format, the fallback and three worked vectors including a *deliberate* winner-take-all. |
| 60 | Arcade | `useGspPolling()` stopped returning `height` / `blockHash` | **Breaking in SDK 0.15.1.** They moved to **`useGspBlock()`**, to be read **in the component that displays them**: that locality is the point, and hoisting it to the top of a screen re-creates the idle-tab redraw the change existed to fix. `WagerGspInputs` likewise lost its `height` field in 0.15.2. ARCADE.md §3 step 3 owns both, and the rest of the idle-tab work you should not re-implement. |
| 67 | Arcade | A match fills on chain and the board never starts | The relay closes the socket a re-join supersedes, and until **SDK 0.16.5** the client read that close's `1000` code as its own hang-up: no reconnect, no fallback poll, `status` still reading connected, and the tab never learned its own match had filled. Two windows of one game, or an old half-open socket after a network drop, are enough to reach it. Vendor 0.16.5 or newer and rebuild; the relay wants the matching change too (a superseded socket closes with 4001). ARCADE.md §3 step 3 owns the mechanism and the multi-tab behaviour that came with it. |
| 68 | Arcade | Treating a game path as an origin boundary | Shipped planes separate the shell and games origins. Games on the same games origin still share DOM and storage privileges with one another. The optional `GAMES_SAME_ORIGIN_FIRST_PARTY=1` override also removes shell isolation. Read the iframe source and config; use your own storage prefix. ARCADE.md §5 describes both shapes. |
| 69 | Arcade | After bumping to SDK 0.18.x the repo will not compile, in the adapter test | Two renames-in-effect land in one bump. **0.18.0** made `GameAdapter.controlsHint` a `string \| { keyboard, touch }` union, so anything READING it as a string (`.length`, `.toContain`, passing it where a `string` is required) fails with TS2339: every game repo's own adapter test does this. Narrow with `typeof hint === 'string'`, or resolve it: `resolveControlsHint(hint, coarsePointer)` is exported. **0.17.0** renamed `useChannelManager`'s `moneyErrors` / `dismissMoneyError` to `sendErrors` / `dismissSendError`, which bites only an app that builds its own board screen on the hook. ARCADE.md §3 step 3 owns both. |
| 70 | Arcade | UI gated on "the player is in a wallet prompt right now" | A player can arm a Smooth Play session key in the arcade, and the shell then signs eligible moves with it locally: the move comes back confirmed in less time than a human takes, with no prompt ever shown. The grant also lapses, so the prompt can return mid-match. Treat the `move-result` as the only signal, in both directions. The key is the shell's and never reaches your frame; there is nothing to integrate. ARCADE.md §3 step 3 owns the three rules. |
| 71 | Arcade | A player timed out of the match is still drawn as a live opponent | The GSP never edits the participant list, so the roster outlives an ejection and the board JSON has no notion of one. Read **`ejectedSeats`** off the channel store (SDK 0.17.0) for anything drawn about the *players* rather than about the position: empty means nothing known, not nobody ejected. ARCADE.md §3 step 3 lists it beside `matchOver`, `linkDown` and `opponentDisconnected`. |
| 72 | Arcade | A renderer that counts board updates loses moves after a rejoin | The published state is **cumulative and only the latest is delivered**: a client rejoining a live match replays its whole proof backlog in one synchronous run, and the intermediate states are coalesced away because none of them could ever have been painted. Anything derived from watching updates go by - a per-update move counter, an animation queued per delivery - silently skips the burst. Read what the current state says. ARCADE.md §3 step 3 owns the contract. |
| 73 | Arcade | After opting into `presentation.squareBoard` the canvas sizes itself to nothing | The SDK renders the board frame in place of your wrapper, so the element your `ResizeObserver` or `getBoundingClientRect` was measuring no longer exists, and an observer on a vanished node reports nothing rather than failing loudly. Observe the surface (`class="arcade-board-surface"`) or the canvas instead, and return the board CONTENT rather than your own frame. ARCADE.md §3 step 3 owns the migration order. |
| 74 | Arcade | `arcade_winner` sentinels the wrong way round | `-1` is *undecided*, `-2` is *draw*, `0..N-1` the winning seat (`wasm_judge.hpp`), and a "draw" label in the UI proves nothing about the judge: cover both sentinels and a winning seat in the blob battery and the signed-peer closure test. WASM.md's ABI table owns the signatures; what a draw does at settlement - the designated closer (SKILL.md §5), the share-weight fallback above two seats (ARCADE.md §6, row 59) - is decided there, not by the label. |

## Frontend & build

| # | Applies to | Pitfall | Fix |
|---|---|---|---|
| 10 | Both | `NEXT_PUBLIC_*` env vars are embedded at **build time** | Rebuild (not restart) after changing them; use the real server address, not `localhost`, for anything remote. |
| 11 | Both | BigInt literals (`0n`) fail to compile | Set `tsconfig.json` `target` to `ES2020` or later. |
| 12 | Standalone | Stubbed / timeout-based tx confirmation | Use a real `waitForTransactionReceipt` (`@wagmi/core`) - a stub makes the UI believe a failed tx succeeded. (Arcade games never send transactions themselves; the shell signs and returns a tx hash over the bridge.) |
| 13 | Both | Testing against a stale production bundle | Vite/Next dev servers hot-reload; a `dist/` / `.next` production build does not - always rebuild after code changes before testing it. |

## Channel protocol

| # | Applies to | Pitfall | Fix |
|---|---|---|---|
| 14 | Standalone | State-proof signature verification fails for **every** proof (CRITICAL) | Off-chain state-proof signatures are not plain personal-sign messages: they must carry the chain-scoped Xaya message prefix before signing, because the GSP's `verifymessage` call (via XayaX) adds that prefix when it verifies. The exact prefix string, byte for byte, is in SKILL.md §3: copy it from there. On the Arcade the SDK does this for you. |
| 15 | Both | Dispute rejected for a finished game | Wrong move for the situation: **dispute** is only for an *active* game whose opponent went offline, and a finished game closes with a **resolution**. SKILL.md §5 owns the two moves and their effects. |
| 16 | Both | Loser never closes the channel | Nobody volunteers to pay gas to declare their own loss, so the **winner** must auto-send the resolution, and a draw, having no winner, needs its own designated closer or the channel hangs open forever. SKILL.md §5 owns both branches. |
| 17 | Standalone | `processOnChain()` runs after the relay connect | It must run **before** connecting to the relay, or early on-chain state races connection setup. |
| 18 | Both | Inventing a second progress counter beside `turnCount` | There is exactly ONE, and it is the blob's `arcade_turn_count`: monotonically non-decreasing across every `applyMove` AND across a dispute-timeout reinit, which the host requires not to regress it (`docs/ARCADE-ABI.md` §2). `ParsedBoardState` declared a `moveCount()` alongside it until SDK 0.6.0 and every game implemented one as a bare passthrough to the other: a shape whose only possible future is two counters disagreeing, silently, in the comparison that decides who wins a dispute. If your rules' natural turn number is non-monotonic between phases, that is a bug in what you export as `arcade_turn_count`, not a reason for a second number: the referee orders states by that one value and a client ordering by anything else loses disputes it should win. |
| 19 | Both | Auto-move feedback loop makes both players' AI run ~5× too fast | If `maybeAutoMove()` - the ONLY method on `OpenChannel` since SDK 0.6.0 (`sdk/src/lib/channel/open-channel.ts`) - submits an idle/no-op move when no input is pending, both sides auto-submit in a tight loop. Return `null` when `pendingInput` is null: that rate-limits to the net-tick interval. |
| 20 | Standalone | Relay grows game logic over time | Keep the relay a **dumb forwarder**: one universal image for every game, configured only by env vars (`GSP_URL`, `RELAY_AUTH` / audience). Never add throttling, tick rates or state tracking to it: the real-time feel comes from client-side local sim, not relay intelligence. |
| 21 | Standalone | P0's first proof is lost | If P0 moves before P1 connects to the relay, P0's proofs go nowhere. Re-broadcast the current proof on `peer_joined`. |
| 22 | Standalone | Game "restarts from scratch" on rejoin | A reconnecting player's opponent must resend their current proof on `peer_joined` (the receiving side's monotonic move-count check already accepts only newer proofs). |
| 23 | Standalone | Duplicate resolution tx fires repeatedly after a win | Clearing `pendingPutState` after a tx mines lets `triggerAutoMoves()` re-fire another resolution. Guard the win/draw close on `!resolutionSent` and latch `resolutionSent = true` only **after** `putStateOnChain()` returns a tx hash: latching before the send would permanently suppress the resolution the first time a send fails on gas or nonce. Clear it in exactly ONE place, on reinit change (a new game on the same channel), never anywhere else. |
| 24 | Standalone | Every relay join rejected (signature mismatch) despite correct session keys | The client must sign the auth string **your relay build** recovers, byte for byte, including the audience, which is a signed protocol constant and not a display label, so a "cosmetic" rename fails every handshake closed with no partial-credit failure mode. Read the message format out of STANDALONE.md §4, never out of memory, and check it against your relay's own `auth.ts`. |

## Real-time local sim

| # | Applies to | Pitfall | Fix |
|---|---|---|---|
| 25 | Both | Action/racing channel game "freezes and rewinds" | A turn-based judge protocol only advances visually on a full proof round-trip. Add a **client-side local-sim layer** that predicts every tick and snaps to proofs as they arrive: the protocol stays turn-based, only the frontend changes. |
| 26 | Both | A time-limited effect (e.g. an oil slick) expires ~10 s early | If the state→JSON conversion omits a "dropped at tick" field and you default it to 0, the local sim computes `tick - 0 > LIFETIME` almost immediately. Backfill the field from the proof's current `gameTick` when converting. |
| 27 | Both | AI-controlled entities can "win" a race/round meant for humans | The referee checks an `isPlayer` flag; if the TypeScript-side finish check doesn't also gate on it, AI entities trigger a human's win condition. Add `isPlayer &&` to the client check, and verify the board-state converter maps `isPlayer` for BOTH seats, not just the local player's. |
| 28 | Both | Sluggish gameplay on high-latency connections | Make the net tick rate configurable (env var) and recompute ticks-per-net-tick from it, so game speed stays constant across rates. |
| 29 | Both | Visible snapping between positions at low tick rates | Use exponential smoothing plus velocity extrapolation in the render loop, and allow the interpolation alpha to exceed 1.0 (up to ~2.0) so entities extrapolate past the last known tick, then correct smoothly on the next proof. |

## WASM build

Golden traces (`blob/tests/packed_trace*.json`) are generated outputs, never hand-edited:
WASM.md §A4 is the authoring procedure.

| # | Applies to | Pitfall | Fix |
|---|---|---|---|
| 30 | Both | Build container runs as root | Always drop to non-root; use an entrypoint with `gosu` to fix volume permissions first (the template's blob test harness runs `docker run -u "$(id -u):$(id -g)"` for the same reason). |
| 31 | Standalone | `protoc --cpp_out` produces double-nested output paths | protoc places output relative to the proto's path under `-I`; don't add an extra subdirectory in `--cpp_out` on top of that: let protoc create the subdirs. |
| 32 | Standalone | Browser serves a cached WASM JS glue file against a new `.wasm` binary | Symptoms: `Import #0 "env": module is not an object or function`, or "function import requires a callable". Cache-bust the `<script>` src with `?v=<timestamp>`. (An arcade rules blob has no glue file at all: it is zero-import and goes straight through `WebAssembly.instantiate`, `sdk/src/lib/wasm/packed-judge.ts`.) |
| 33 | Standalone | Missing `gamechannel/proto/broadcast.proto` | Include it in BOTH the protoc generation step AND the build's proto source list - `broadcast.cpp` needs it for the full gamechannel build. |
| 34 | Standalone | Building the WASM layer from the wrong libxayagame commit | WASM support (`wasm/XayaGameWasmConfig.cmake.in`, installed as the `XayaGameWasm` CMake package - there is no `XayaWasm.cmake` and no special `wasm` branch) ships on `master`. Check out the SAME pinned commit your native GSP builds from: a branch tip is a different commit, which means native/WASM drift, the consensus-fatal kind. |
| 35 | Both | Assuming the board can advance one tick per player input | It is built around the turn-based protocol (P0's input is stored as pending, P1's submission applies both). Local prediction is a separate TypeScript mirror of the physics - **integer-for-integer, never a float re-derivation** - pinned to the blob's golden trace by a test, and reconciled by loading each authoritative proof and replaying the local inputs issued after its tick (SKILL.md §6). |
| 36 | Both | Assuming players see each other's input mid-tick in simultaneous games | The board applies BOTH players' inputs together across a full net-tick's worth of ticks; P0's input is held as `pending_input` until P1 submits, which is what keeps it fair despite the sequential wire protocol. |

## Fixed-point & determinism

The law itself, in one sentence: consensus-relevant code must be a pure function of the
ordered move sequence - no wall-clock, no external I/O, no unseeded RNG - so every node
computes byte-identical state; load the building-persistent-games skill for the full
section. The native-vs-WASM gates that prove it for a channel game are in WASM.md.

| # | Applies to | Pitfall | Fix |
|---|---|---|---|
| 37 | Both | `fxDiv` overflows on tiny denominators | `(int64_t)a << 16` can dwarf a very small divisor and overflow `int32_t`. Use a larger epsilon floor (e.g. a minimum direction magnitude), not a near-zero one. |
| 38 | Both | CORDIC produces garbage from unclamped angles | Extreme un-range-checked yaw/pitch input (e.g. `INT32_MAX`) breaks the algorithm. Clamp angles to `[-2π, 2π]` in the board rules before physics sees them. |
| 39 | Both | Wrong fixed-point format for the coordinate space | Q16.16 (~0.000015 precision, ±32K range) suits small arenas; Q19.12 (coarser precision, ±512K range) suits long racing tracks. Pick by required integer range, not habit. |
| 40 | Both | Confusing an int×fixed multiply for `fxMul` | `TICKS_PER_NET * TICK_DT` (a plain int count times a `fixed_t`) is ordinary multiplication, not `fxMul` - `fxMul` also works, but it reads as if both operands were fixed-point, which they aren't. |
| 41 | Both | Float creeping into consensus-relevant code | Float is allowed ONLY at the JS boundary - the `fixed_t ↔ float` conversion for JSON/JS in a standalone Embind build. All internal game logic stays in `fixed_t`. An arcade rules blob has no float boundary at all: it exchanges packed bytes. |

## FPS-specific

| # | Applies to | Pitfall | Fix |
|---|---|---|---|
| 42 | Both | Player pushed sideways by the floor | A ground collision AABB must be flagged `ground=true` so the collision system resolves it on the Y-axis only. |
| 43 | Both | The judge can't parse BSP map files at runtime like the client does | Extract collision data to a C header at build time (a one-off tool script) and compile it into the rules binary, so client and judge share identical AABB sets. |
| 44 | Both | Static world-geometry array too small for the map | Size `MAX_WORLD_BOXES` with headroom over the actual brush count and check it at load time: undersizing silently drops collision geometry. |

## Wagering (standalone V5)

On the Arcade, wagering is a **platform module**: your rules and UI stay wager-free and an
operator enables it: see WAGERING.md §1. The rows below are for a standalone channel game
that hand-rolls its own wager contract and payment queue; WAGERING.md owns each mechanism,
and these rows exist only to make the failure recognisable.

| # | Applies to | Pitfall | Fix |
|---|---|---|---|
| 45 | Standalone | Admin authorization mistaken for a `p/`-name check | There is no admin `p/` name in V5 and no name-equality check: the contract *owns* the game name, is trusted through NFT ownership, and its admin moves never appear in the player move list at all, so code hunting for them there finds nothing. An earlier design authorised admin moves through a `p/` admin name; V5 does not. WAGERING.md §5 owns the model. |
| 46 | Standalone | New queue entry uses the paid `matchId` | Permanently bricks that payee: the contract's `paymentMade[...]` guard is stuck `true` for that id. On channel close the new queue entry's `match_id` must be the **channelId hex**, never the original payment's matchId. |
| 47 | Standalone | Payment-queue address comparison fails | Queue payee and wallet addresses are compared lowercased (the GSP's `NormalizeAddress()` lowercases them at parse and seed time), so an EIP-55 checksummed spelling of one will not match. This covers the `pay.addr` and `w0`/`w1` fields only: session signing addresses take the OPPOSITE rule (row 66). |
| 48 | Standalone | Payout sent to the wrong address type | Payouts go to `w0`/`w1` (wallet addresses), never `a0`/`a1` (ephemeral session signing keys). |
| 49 | Standalone | Miscounting closing braces when hand-building the admin move JSON | The free and paid tiers close a **different** number of braces, because only the paid one carries the nested payment object, so a count carried over from the other tier emits malformed JSON, and the admin move never lands. Build the string from WAGERING.md §6's two exact forms instead of counting by eye; brace counts quoted from a prior contract version are wrong. |
| 50 | Standalone | Queue bootstrap silently does nothing | It seeds only a genuinely **fresh** GSP datadir: reusing an existing one skips it, with no second chance and no error. WAGERING.md §9 owns the flags and the matchId rule. |
| 51 | Standalone | Contract / GSP / frontend disagree on which game they are wagering for | Three knobs must match exactly: the contract's `gameNamespace()` == the GSP's `--game_id` == the frontend's `NEXT_PUBLIC_GAME_ID`. |
| 52 | Standalone | Registering the canonical game name to the wager contract "just for testing" | Registering `g/<name>` to a contract is **permanent**: never releasable. Use a throwaway game id for betas and keep the real name free. |
| 53 | Standalone | Real-funds settlement test asserts on wallet balance deltas | Confounded when the operator address equals the funded/deployer address. Assert on the contract's `MatchJoined` event fields (`queuePayee` / `winnerPayout`) instead. |
| 64 | Standalone | The contract's replay marker is keyed without the payout amount | `paymentMade[bet][matchId][payee]` is safe only while the contract computes the one payout itself. As soon as a caller can state per-entry amounts, a payment at a made-up amount marks the true queue front paid **forever** on the contract while the GSP - which keys prepaid on the amount - still owes it: no later honest start can pay that entry, and every honest paid start at that combo afterwards forfeits its stakes with no channel and no refund. Key both markers on the same tuple, amount included. WAGERING.md §3 route 5 owns it. |
| 65 | Standalone | Join consent checked at the join and never again at the fill | A joiner consents to the queue entry they read. If the queue can move before the match fills - another lobby consuming the front, or N seats filling across several transactions - the fill pays a group nobody agreed to, the GSP refuses a start that does not match its own front, and the stake is gone with no channel and no refund. Re-check the consented entry at the fill and revert instead of paying. WAGERING.md §4 owns the rule. |
| 66 | Standalone | Session signing address sent in any spelling but EIP-55 | The `a0`/`a1` seat addresses are stored **verbatim** and the referee compares a recovered signer against them character for character, so only the canonical EIP-55 checksummed spelling names a seat whose moves can ever be proved. The contract refuses any other spelling at create/join, and from its rules-activation height the GSP rejects a start whose seat is non-canonical (a paid one that matched the queue front is disposed and its stakes refunded, not stranded, but the lobby still never opens). This is the **opposite** of the queue payee rule (row 47): payees are lowercased, seats are checksummed. Derive `a0`/`a1` with a checksumming address helper, never `toLowerCase()`. |

## Consensus safety

| # | Applies to | Pitfall | Fix |
|---|---|---|---|
| 54 | Both | `IsValid()` treated as a normal validation function | It runs on **untrusted, attacker-controlled** board states during dispute/resolution verification, **before any signature is checked**, so a reachable `CHECK`/`abort()` inside it is a pre-auth, consensus-fatal DoS: one cheap move crashes every node identically and halts the chain. Malformed input must be *rejected*, never crashed on. STANDALONE.md §9 owns the three-layer C++ defence; ARCADE.md carries the blob-shaped version, where `arcade_is_valid` is the same surface. |
| 55 | Both | A dispute-timeout close never sets the board's `finished` flag | The referee closes the channel without ever advancing the state to a finished position, so a UI that gates "you won" on a `finished` flag hangs forever ("I disputed, it stayed open"). Derive **that the match ended** from the channel leaving the referee's open set instead, and do **not** derive *who won* from the last dispute's `whoseTurn`: on the Arcade the blob decides a timeout outcome at every seat count, so that mirror can tell the loser they won. SKILL.md §5 owns both halves. **Separately, what the player *sees*:** as of SDK 0.15.5 the close recap holds until they press Back to Lobby, paid or free - the free channel's auto-navigation is gone - and as of 0.18.0 the player who forfeits gets that screen too, rather than being dropped back to the lobby with nothing said while their opponent got the full result overlay. A game rendering `ChannelGame` gets both free; a custom shell that relied on the auto-navigation must now leave through the button. |
| 61 | Both | A TypeScript mirror of a consensus hash drifts from the blob, and the drift is a fork | Any preimage you build twice - once in C++ for the judge, once in TS for the client - is a consensus bug waiting for one of the two to be edited. Two shipped disciplines: pin both against a **golden-vector file** so a drift is a red test (`arcade-vector-sumo/blob/tests/commitment_vectors.json`), or delete the TS copy outright and build every signed move by calling a blob export, so there is exactly one spelling of the wire format (`arcade-dungeonchannel/src/lib/dungeon/secret.ts` documents its own deletion and why). Unused mirrored consensus crypto is the worst case: nothing exercises it, so it rots quietly and is then trusted by whoever finds it next. COMMIT-REVEAL.md and HIDDEN-INFORMATION.md own the two patterns. |
| 62 | Both | Turn-interleaving used for a game where the choice itself is the secret | P1 can read P0's stored `pending_input` out of the state before choosing, because every participant holds the full signed state. The pattern is fair only when the second submitter gains nothing from seeing the first: a physics batch, not a bid or a thrown attack. Use a commitment instead: COMMIT-REVEAL.md owns the protocol, including what the rules must do when a seat commits and never reveals. SKILL.md §4 owns the limit itself. |
| 63 | Both | A commitment scheme where refusing to reveal is a *safe* move | A commit-reveal protocol is only sound if non-reveal is punished, and that is a rules decision nobody makes for you. Write the payoff table down explicitly before you implement: what a silent seat forfeits, what a false accusation costs the accuser, and what the timeout path pays out. HIDDEN-INFORMATION.md §7 and COMMIT-REVEAL.md §8 own the two shipped answers: a stonewaller that cannot satisfy the audit routes to `arcade_resolve_timeout` and forfeits, and an abandoned round is discarded whole so no honest player's hidden choice leaks by being the last one standing. |
| 56 | Both | Assuming one test command covers determinism | It is always **two gates, run manually before you ship**. Standalone: an engine pure-sim gate (native g++ vs emscripten) and a full proto-adapter gate (native vs the prebuilt WASM binary): neither runs under `npm test`, and the GSP's Docker build bakes in only the board-validity and GSP-logic tests. Arcade: `blob/tests/run-tests.sh`'s `packed-determinism` target (native == wasmtime on the real blob, every cfg vector) plus `npm run e2e:determinism`. |
| 57 | Standalone | A low-height fork resolves every open dispute instantly | The expiry pass subtracts the fixed dispute window from the current height, so on an **unsigned** height below that window the subtraction underflows and every dispute looks already expired, which is exactly the state a fresh forked test chain starts in. STANDALONE.md §2 names the constant and gives the guard. |

The line-numbered citations above point into `arcade-platform/sdk/src/lib/{channel,wasm}` and
`arcade-xayaman/{scripts/build-export.sh, next.config.ts, blob/tests/Makefile, blob/MANIFEST.md}`.
Rows that point at a sibling file instead of a source line do so because that file is where the
mechanism is maintained: read it there, not from a summary here.
