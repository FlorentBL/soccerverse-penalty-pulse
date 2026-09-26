# Penalty Pulse

A free, fast two-player Soccerverse penalty duel for XAYA Arcade. For each pair of penalties, each player secretly chooses a **shooter and a goalkeeper** from the same fixed six-player roster. The three shooters have official primary position `FC`; the three goalkeepers have `GK`. Each role offers exactly one 90+, one 75–89 and one 55–74 player. Regulation requires each of the three choices once per role, so even a three-zone underdog gets a turn.

## Rules

1. Seat 0 commits a hidden shooter and goalkeeper choice, seat 1 chooses their pair, then seat 0 reveals. Neither can counter-pick after seeing the other's selection. The only valid choices are the three displayed `FC` shooters and three displayed `GK` goalkeepers. Arbitrary Soccerverse IDs are rejected by the WASM rules. In the three regulation pairs, each seat must use one 90+, one 75–89 and one 55–74 player as shooter, and likewise as goalkeeper. Players and tiers can be reused in sudden death.
2. Seat 0 shoots first in each pair, then seat 1. Before every shot, the defender sees exactly which of the nine numbered zones are reliable for the selected shooter. The defender secretly places their goalkeeper; the shooter sees the scoring zones but not the keeper's position before aiming.
3. The pinned official Soccerverse `rating_shooting` determines reliable zones: 55–59 → 3, 60–64 → 4, 65–69 → 5, 70–79 → 6, 80–89 → 7, 90–100 → 8. Ratings below 55 cannot be selected. The zone pattern rotates by player ID. An official `rating_gk` of 55–74 covers one zone. At 75–89 it covers two adjacent zones, and at 90+ any two distinct zones, provided the shooter has at least four reliable zones. Against a three-zone shooter every keeper covers one zone.
4. A shot into a covered position is saved. An uncovered shot scores only in a reliable zone; other shots go wide. The defender's choice is committed with SHA-256 and revealed after the shot.
5. Both players receive up to three regulation penalties. The match can end early if the trailing player cannot catch up. A tie enters paired sudden death and ends when the scores differ after both have shot. A timed-out active player forfeits. At the 254-kick wire limit, a remaining tie is awarded to the first shooter.

The six roster IDs, names, `rating_shooting`, `rating_gk` and `position_main` are pinned from official Soccerverse sources. The full source snapshot contains 179,100 players, but gameplay admits only the six in `src/lib/pulse/featured.json`. The tier limits, zone patterns and keeper coverage are **Arcade game rules**. Player ownership is not required. There are no live Soccerverse API calls during a match.

| Band | FC shooter · shooting | GK keeper · goalkeeping |
|---|---|---|
| 90+ | Harry Kane `#184` · 97 | David Raya Martin `#19465` · 95 |
| 75–89 | Cristiano Ronaldo `#874` · 88 | Bernd Leno `#1438` · 89 |
| 55–74 | Mario Barwuah Balotelli `#1917` · 59 | Ethan Horvath `#62` · 74 |

## Balance measurement

Run `python3 scripts/measure-balance.py` with SciPy. Among the pinned source players, 30,715 have primary position `FC` and 19,955 are `GK`. The eligible source tiers contain 29 / 1,069 / 23,993 FC players and 16 / 692 / 15,791 GK players. From that source we fixed one player per band and role. With optimal randomized zone choices, the nine allowed shooter-versus-keeper matchups score between **66.7% and 87.5%**: Kane (97) scores 75% against Raya (95) or Leno (89), and 87.5% against Horvath (74); Balotelli (59, three zones) scores 66.7% against all three. These are mathematical one-penalty values, not measured human win rates or full-match win rates.

## Play locally

Run `npm ci && npm run dev`, then open `http://localhost:3001/?preview=1` or select **Preview without wallet**. The full React board runs a local hotseat game without a wallet. It has the same selection, zone, save and scoring logic as the WASM judge; the online match remains judged by `blob/rules.wasm` through the official XAYA Arcade SDK. The interface defaults to English, with French, Italian, Spanish and Portuguese available. For a phone on the same Wi-Fi, open `http://<machine-LAN-IP>:3001/?preview=1` while the dev server is running.

The **Rules** button beneath the kick counter explains the full flow and rating tables in the selected language. It is available during both the local preview and online play.

The first player's pair of picks and each goalkeeper choice use local 32-byte salts stored per channel, seat and kick. Keep the same browser through reveal; losing a secret before reveal can lead to a timeout. The hotseat demo skips cryptographic handoff and is for UI rehearsal only. The original static HTML in `prototype/` is an archived early prototype and does not implement the current rules.

## Build and submission

```sh
npm ci
npm run test:native
npm test
npm run typecheck
npm run typecheck:test
npm run verify:css
bash blob/build-blob.sh
bash blob/check-blob.sh --strict
npm run build
FRAME_ANCESTORS=https://test-arcade.xaya.io NEXT_PUBLIC_GAME_ID=xarc bash scripts/build-export.sh --bundle
```

The SDK supplies the lobby, matchmaking agreement, channel and signed moves. `xarc` is the playground move namespace documented in the official skill; another target Arcade may use a different namespace. The static export writes `dist/bundle.tar.gz` and a SHA-256 sidecar. Data provenance is in [data/SOURCE.md](data/SOURCE.md), ABI values in [blob/MANIFEST.md](blob/MANIFEST.md), and the candidate submission in [SUBMISSION.md](SUBMISSION.md).

Free play is the only requested mode. WCHI stakes are a separate future operator discussion; no configurable creator fee on the GSP is assumed. The game is attached to the [disposable XAYA playground](https://test-arcade.xaya.io/play/penalty-pulse) for testing. **No public Arcade submission has been made.** A successful two-player playground match and reviewer access to the currently private source repository remain required.

## Sources

- [Official XAYA Arcade skills](https://arcade.xaya.io/skills), [rules blob ABI](https://arcade.xaya.io/docs/rules-blob) and [SDK docs](https://arcade.xaya.io/docs/sdk); local official examples at `~/Downloads/xaya-arcade-examples`.
- [Soccerverse datapack](https://soccerverse.com/developers/datapack-and-assets) and [Soccerverse MCP player data](https://soccerverse.com/developers/soccerverse-mcp).
- [IFAB penalty shootout procedure](https://www.theifab.com/laws/latest/determining-the-outcome-of-a-match/) for early decisions and equal-attempt sudden death; this game's three-kick format is shorter.
