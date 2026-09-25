# Penalty Pulse rules manifest

| Field | Value |
|---|---|
| Proposed slug | `penalty-pulse` |
| Game type (`GAME_KEY`) | `svpenaltypulse` |
| Seats | minimum 2, maximum 2 |
| Config suffix | none (`null` in submission JSON; no bytes) |
| Full cfg delivered to `arcade_initial_state` | 0 bytes |
| Rules blob | `blob/rules.wasm` |
| Rules SHA-256 | `e2a10653e15c7168457740ee434be3c21f537dd7a5d9ae1696df962e66e33f18` |
| State encoding | version 1, fixed 78 bytes; see `rules/pulse/game.cpp` and `src/lib/pulse/codec.ts` |
| Turns | 24 signed moves, 4 per kick; 6 kicks total |
| Timeout | active seat forfeits; opponent wins |

The empty cfg is intentional. The initial one-seat placeholder has no turn. The two-seat opening starts seat 0 in the player-pick phase. The game's `initial` function rejects nonempty cfg bytes, which protects against a mistaken nonempty registration suffix. The four registration values are external operator/attach inputs; this file records the intended values for review.

The blob ABI follows the official XAYA Arcade `arcade_*` exports in `arcade-platform/docs/ARCADE-ABI.md` and `engine/judge/wasm_judge.cpp`, mirrored by the official local examples. The pinned build uses wasi-sdk 24.0 in `blob/Dockerfile.blob-builder`; run `bash blob/build-blob.sh`, then `bash blob/check-blob.sh --strict` and, from a clean Git tree, `bash blob/check-blob.sh --rebuild --strict`.
