# Penalty Pulse rules manifest

| Field | Value |
|---|---|
| Proposed slug | `penalty-pulse` |
| Game type (`GAME_KEY`) | `svpenaltypulse` |
| Seats | minimum 2, maximum 2 |
| Config suffix | none (`null` in submission JSON; no bytes) |
| Full cfg delivered to `arcade_initial_state` | 0 bytes |
| Rules blob | `blob/rules.wasm` |
| Rules SHA-256 | `b926b0a9ccb2128c0611b41d734079316868078e5fc538bee22cde5d854991e7` |
| State encoding | version 3, fixed 127 bytes; see `rules/pulse/game.cpp` and `src/lib/pulse/codec.ts` |
| Turns | 3 signed moves to commit/select/reveal a duo drawn only from the three fixed `FC` shooters and three fixed `GK` keepers, then 3 moves per penalty; at most 6 regulation kicks, early finish and paired sudden death, up to 254 total kicks |
| Timeout | active seat forfeits; opponent wins |

The empty cfg is intentional. The initial one-seat placeholder has no turn. The two-seat opening starts seat 0 in the hidden player-commit phase. The game's `initial` function rejects nonempty cfg bytes, which protects against a mistaken nonempty registration suffix. The four registration values are external operator/attach inputs; this file records the intended values for review.

The blob ABI follows the official XAYA Arcade `arcade_*` exports in `arcade-platform/docs/ARCADE-ABI.md` and `engine/judge/wasm_judge.cpp`, mirrored by the official local examples. The pinned build uses wasi-sdk 24.0 in `blob/Dockerfile.blob-builder`; run `bash blob/build-blob.sh`, then `bash blob/check-blob.sh --strict` and, from a clean Git tree, `bash blob/check-blob.sh --rebuild --strict`.
