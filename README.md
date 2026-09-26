# Penalty Pulse

A free two-player Soccerverse penalty shootout for XAYA Arcade. Each side has three regulation kicks, with early decisions and sudden death. Soccerverse player IDs, names and shooting ratings are pinned into the game.

## Play

1. The striker chooses a Soccerverse player. Each side uses a different player for each of its three regulation kicks. The player's real `rating_shooting` gives them 2–8 reliable targets in a nine-zone goal.
2. The defender **chooses exactly where their goalkeeper dives** among those nine zones. The choice is committed with SHA-256 and stays hidden until after the shot.
3. The striker chooses one of the nine targets. Matching the keeper's spot is a save. Another spot scores only if it is a reliable target for that player; otherwise the ball goes wide.
4. The defender reveals the dive. Players alternate shooting. The match ends early when the trailing side cannot catch up. If tied after three kicks each, sudden death proceeds in pairs until one side leads after equal attempts. Players can be reused in sudden death. A timed-out active player forfeits.

The illustrated goalkeeper moves to the defender's selected zone. It disappears from the striker's view while the dive is secret. Once the kick resolves, the ball flies toward the chosen target, the keeper dives, and the result appears before the next turn. Reduced-motion settings show the result without the replay.

The official `rating_shooting` is pinned for all 179,100 catalogue players. Arcade converts the rating into reliable zones: below 55 → 2, 55–59 → 3, 60–64 → 4, 65–69 → 5, 70–79 → 6, 80–89 → 7, 90–100 → 8. The **thresholds** and **specific zone pattern**, derived deterministically from the player ID, are Arcade rules. A stronger shooter has more ways to beat the keeper's chosen spot; every shooter still has at least one unreliable zone. Ownership is **not verified or required**. No live Soccerverse API is called during a match. The one-byte kick counter permits 254 total kicks; if 124 extra pairs all remain tied, the first shooter wins as a technical tiebreak. This extreme limit keeps the two-player result valid for Arcade settlement.

## Try locally

Open [prototype/index.html](prototype/index.html) through a local static server for a hotseat prototype, or run `npm ci && npm run dev` for the full React app. The full app uses the official XAYA Arcade SDK for its lobby, wallet, channel and signed moves. On the Arcade, the cross-game lobby supplies the matchmaking agreement to that SDK. The match itself requires the Arcade services. Its default language is English, with French, Italian, Spanish and Portuguese in the language selector. The interface declares touch support and adapts to mobile viewports.

During development, open `http://localhost:3001/?preview=1` or choose **Preview without wallet** on the home screen. This opens the actual React board in a local hotseat demo: choose a striker, choose the opposing goalkeeper's dive, then shoot, repeating until the result. **Restart** resets the demo. The preview is available only with `npm run dev` and resolves turns locally; it does not create an Arcade match or validate the SDK and WASM multiplayer flow.

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

`xarc` is the playground move namespace documented in the official skill. A different target Arcade may require its own namespace. The static export writes `dist/bundle.tar.gz` and its SHA-256 sidecar. Arcade games-host supplies runtime endpoints and framing settings; a standalone static host needs correctly configured endpoints and embedding headers. Rebuild the pinned WASM with Docker using `bash blob/build-blob.sh`. Data provenance and regeneration are recorded in [data/SOURCE.md](data/SOURCE.md).

## Registration and submission

The proposed values and ABI notes are in [blob/MANIFEST.md](blob/MANIFEST.md). The complete candidate submission details, local evidence and remaining gates are in [SUBMISSION.md](SUBMISSION.md). Free play is the only requested mode. WCHI wagering is a separate future operator configuration and no creator-fee setting is assumed.

**No submission has been made.** A remote Git repository and a two-player test on the XAYA playground are still required before submission.

## Source references

- [Official Arcade skills](https://arcade.xaya.io/skills), especially the channel game, WASM, Arcade and wagering sections.
- [Arcade ABI documentation](https://arcade.xaya.io/docs/rules-blob) and [SDK documentation](https://arcade.xaya.io/docs/sdk).
- Official examples already present at `~/Downloads/xaya-arcade-examples`.
- [Soccerverse datapack](https://soccerverse.com/developers/datapack-and-assets) and [Soccerverse MCP player data](https://soccerverse.com/developers/soccerverse-mcp), with snapshot details in [data/SOURCE.md](data/SOURCE.md).
- [IFAB penalty shootout procedure](https://www.theifab.com/laws/latest/determining-the-outcome-of-a-match/) for early decision and equal-attempt sudden death; the three-kick format is this game's shorter Arcade variant.
