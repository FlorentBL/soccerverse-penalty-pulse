# Penalty Pulse

A two-player Soccerverse penalty shootout for XAYA Arcade. Each match is free, lasts six kicks (three per player), and uses real Soccerverse player IDs and names from a pinned official datapack.

## Play

1. The striker chooses an unused Soccerverse player. Their **Pulse precision** gives them 3, 5 or 7 reliable targets in a nine-zone goal.
2. The defender **chooses exactly where their goalkeeper dives** among those nine zones. The choice is committed with SHA-256 and stays hidden until after the shot.
3. The striker chooses one of the nine targets. Matching the keeper's spot is a save. Another spot scores only if it is a reliable target for that player; otherwise the ball goes wide.
4. The defender reveals the dive. Players alternate shooting. After six kicks, the higher score wins; equal scores draw. A timed-out active player forfeits.

The illustrated goalkeeper moves to the defender's selected zone. It disappears from the striker's view while the dive is secret, then appears again with the resolved shot.

Pulse precision and its exact target pattern are Arcade game traits calculated deterministically from the Soccerverse player ID (`3 + 2 × (ID mod 3)` targets). More reliable targets give a stronger shooter more ways to beat the goalkeeper's guess. These traits are **not Soccerverse ratings**. Soccerverse publishes a real `rating_shooting` in its game-state API, but the pinned name/ID datapack used here does not contain it. Using that official rating in consensus rules would require a complete, versioned ratings snapshot in both C++ WASM and the UI. Any player ID in the pinned datapack can be chosen; ownership is **not verified or required**. No live Soccerverse API is called during a match.

## Try locally

Open [prototype/index.html](prototype/index.html) through a local static server for a hotseat prototype, or run `npm ci && npm run dev` for the full React app. The full app uses the official XAYA Arcade SDK for its lobby, wallet, channel and signed moves. On the Arcade, the cross-game lobby supplies the matchmaking agreement to that SDK. The match itself requires the Arcade services. Its default language is English, with French, Italian, Spanish and Portuguese in the language selector. The interface declares touch support and adapts to mobile viewports.

During development, open `http://localhost:3001/?preview=1` or choose **Preview without wallet** on the home screen. This opens the actual React board in a local hotseat demo: choose a striker, choose the opposing goalkeeper's dive, then shoot, repeating for six kicks. **Restart** resets the demo. The preview is available only with `npm run dev` and resolves turns locally; it does not create an Arcade match or validate the SDK and WASM multiplayer flow.

The commit/reveal ordering keeps the goalkeeper's chosen direction secret until the striker has shot. The keeper's 32-byte salt is generated locally and stored per channel/seat/kick so reconnects can reveal the same commitment. A lost browser storage record may prevent a reveal and lead to a timeout; use the same browser until the kick resolves.

## Build and tests

```sh
npm ci
npm run test:native
npm test
npm run typecheck
npm run typecheck:test
npm run verify:css
bash blob/check-blob.sh --strict
npm run build
FRAME_ANCESTORS=https://test-arcade.xaya.io NEXT_PUBLIC_GAME_ID=xarc bash scripts/build-export.sh --bundle
```

`xarc` is the playground move namespace documented in the official skill. A different target Arcade may require its own namespace. The static export writes `dist/bundle.tar.gz` and its SHA-256 sidecar. Arcade games-host supplies runtime endpoints and framing settings; a standalone static host needs correctly configured endpoints and embedding headers. Rebuild the pinned WASM with Docker using `bash blob/build-blob.sh`. `scripts/generate-soccerverse-snapshot.py` regenerates the player data from the exact official datapack SHA-256 recorded in [data/SOURCE.md](data/SOURCE.md).

## Registration and submission

The proposed values and ABI notes are in [blob/MANIFEST.md](blob/MANIFEST.md). The complete candidate submission details, local evidence and remaining gates are in [SUBMISSION.md](SUBMISSION.md). Free play is the only requested mode. WCHI wagering is a separate future operator configuration and no creator-fee setting is assumed.

**No submission has been made.** A remote Git repository and a two-player test on the XAYA playground are still required before submission.

## Source references

- [Official Arcade skills](https://arcade.xaya.io/skills), especially the channel game, WASM, Arcade and wagering sections.
- [Arcade ABI documentation](https://arcade.xaya.io/docs/rules-blob) and [SDK documentation](https://arcade.xaya.io/docs/sdk).
- Official examples already present at `~/Downloads/xaya-arcade-examples`.
- [Soccerverse developer data](https://soccerverse.com/developers/datapack-and-assets) and the pinned datapack URL in `data/SOURCE.md`.
