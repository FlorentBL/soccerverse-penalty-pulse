# Penalty Pulse

A two-player Soccerverse penalty shootout for XAYA Arcade. Each match is free, lasts six kicks (three per player), and uses real Soccerverse player IDs and names from a pinned official datapack.

## Play

1. The striker chooses an unused Soccerverse player. The defender sees that player and their two effective shooting lanes.
2. The defender **chooses where their goalkeeper dives**: left, centre or right. The choice is committed with SHA-256 and stays hidden until after the shot.
3. The striker chooses where to shoot. Matching the keeper's lane is a save. Another lane scores only if it is one of the selected player's two effective lanes; otherwise the ball goes wide.
4. The defender reveals the dive. Players alternate shooting. After six kicks, the higher score wins; equal scores draw. A timed-out active player forfeits.

The two effective lanes are Arcade game traits calculated deterministically from the Soccerverse player ID. They are **not Soccerverse ratings**. Any player ID in the pinned official datapack can be chosen; ownership of a Soccerverse player is **not verified or required**. This is an identity and player-selection link to Soccerverse, not an ownership-gated integration. No live Soccerverse API is called during a match.

## Try locally

Open [prototype/index.html](prototype/index.html) through a local static server for a hotseat prototype, or run `npm ci && npm run dev` for the full React app. The full app uses the official XAYA Arcade SDK for its lobby, wallet, channel and signed moves. On the Arcade, the cross-game lobby supplies the matchmaking agreement to that SDK. The match itself requires the Arcade services. Its default language is English, with French, Italian, Spanish and Portuguese in the language selector. The interface declares touch support and adapts to mobile viewports.

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
NEXT_PUBLIC_GAME_ID=xarc bash scripts/build-export.sh --bundle
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
