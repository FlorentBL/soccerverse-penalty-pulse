# Penalty Pulse rules manifest

| Field | Value |
|---|---|
| Proposed slug | `penalty-pulse` |
| Game type (`GAME_KEY`) | `svpenaltypulse` |
| Seats | minimum 2, maximum 2 |
| Config suffix | none (`null` in submission JSON; no bytes) |
| Full cfg delivered to `arcade_initial_state` | 0 bytes |
| Rules blob | `blob/rules.wasm` |
| Rules SHA-256 | `8fc60bb14f387220561c44143d9c547106b8dfa582bbd1be35068fbb2e4cce40` |
| State encoding | version 5, fixed 127 bytes; see `rules/pulse/game.cpp` and `src/lib/pulse/codec.ts` |
| Turns | Five signed moves per penalty: attacker chooses one of three fixed `FC` shooters, defender chooses one of three fixed `GK` keepers, defender commits a hidden dive, attacker shoots, defender reveals; at most 6 regulation kicks, early finish and paired sudden death, up to 254 total kicks |
| Timeout | active seat forfeits; opponent wins |

The empty cfg is intentional. The initial one-seat placeholder has no turn. The two-seat opening starts with seat 0 choosing a shooter. The game's `initial` function rejects nonempty cfg bytes, which protects against a mistaken nonempty registration suffix. The four registration values are external operator/attach inputs; this file records the intended values for review.

Only green targets are legal shot moves. A dark target is disabled in the UI and rejected by the rules blob without consuming the turn. The state encoding version changed because existing games that recorded a wide shot are incompatible with this rule.

The blob ABI follows the official XAYA Arcade `arcade_*` exports in `arcade-platform/docs/ARCADE-ABI.md` and `engine/judge/wasm_judge.cpp`, mirrored by the official local examples. The pinned build uses wasi-sdk 24.0 in `blob/Dockerfile.blob-builder`; run `bash blob/build-blob.sh`, then `bash blob/check-blob.sh --strict` and, from a clean Git tree, `bash blob/check-blob.sh --rebuild --strict`.
