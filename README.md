# Penalty Pulse

A free, fast two-player Soccerverse penalty duel for XAYA Arcade. Each player selects **one Soccerverse footballer per round**. That footballer takes their penalty and guards the opponent's penalty. The best shooter is therefore not automatically the best choice.

## Rules

1. Seat 0 commits a hidden player choice, seat 1 selects a player, then seat 0 reveals their committed choice. Neither can counter-pick after seeing the other's selection. Each seat must use three different players in regulation; players can be reused in sudden death.
2. The first penalty of the pair is taken by seat 0, the second by seat 1. For each penalty, the defending player chooses a secret primary keeper position in the nine-zone goal. An official Soccerverse `rating_gk` of **75 or higher** also lets them choose one **adjacent** second position if the striker has at least four reliable zones. The striker never sees these positions before aiming.
3. The official Soccerverse `rating_shooting` determines 2–8 reliable zones: below 55 → 2, 55–59 → 3, 60–64 → 4, 65–69 → 5, 70–79 → 6, 80–89 → 7, 90–100 → 8. A strong goalkeeper uses an Arcade **keeper-focus** rule: their own shot is capped at four reliable zones, regardless of their shooting rating. The four-zone pattern is rotated by player ID and has a balanced adjacency shape.
4. A shot into either position covered by the keeper is saved. An uncovered shot scores only in one of the striker's reliable zones; other shots go wide. The defender's choice is committed with SHA-256 and revealed after the shot.
5. Both players receive up to three regulation penalties. The match can end early if the trailing player cannot catch up. A tie enters paired sudden death and ends when the scores differ after both have shot. A timed-out active player forfeits. At the 254-kick wire limit, a remaining tie is awarded to the first shooter.

The player IDs, names, `rating_shooting` and `rating_gk` are pinned from official Soccerverse sources for 179,100 players. Thresholds, keeper focus and target patterns are **Arcade game rules**. Player ownership is not required. There are no live Soccerverse API calls during a match.

## Balance measurement

Run `python3 scripts/measure-balance.py` with SciPy. On the pinned data there are 708 players with goalkeeper rating at least 75 and 55 players with shooting at least 90 and goalkeeper rating below 75. The quick picks show three of each. With optimal randomized lane choices, every displayed striker-versus-keeper matchup gives **75% scoring probability to each side**. Two displayed strikers score 87.5% each; two displayed keepers score 50% each. These are mathematical one-penalty values for the deterministic rules, not measured human win rates. The script prints all nine displayed cross-role comparisons.

## Play locally

Run `npm ci && npm run dev`, then open `http://localhost:3001/?preview=1` or select **Preview without wallet**. The full React board runs a local hotseat game without a wallet. It has the same selection, zone, save and scoring logic as the WASM judge; the online match remains judged by `blob/rules.wasm` through the official XAYA Arcade SDK. The interface defaults to English, with French, Italian, Spanish and Portuguese available. For a phone on the same Wi-Fi, open `http://<machine-LAN-IP>:3001/?preview=1` while the dev server is running.

The first player's pick and each goalkeeper choice use local 32-byte salts stored per channel, seat and kick. Keep the same browser through reveal; losing a secret before reveal can lead to a timeout. The hotseat demo skips cryptographic handoff and is for UI rehearsal only. The original static HTML in `prototype/` is an archived early prototype and does not implement the current dual-role rules.

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

Free play is the only requested mode. WCHI stakes are a separate future operator discussion; no configurable creator fee on the GSP is assumed. **No submission has been made.** A remote repository and a successful two-player XAYA playground match remain required.

## Sources

- [Official XAYA Arcade skills](https://arcade.xaya.io/skills), [rules blob ABI](https://arcade.xaya.io/docs/rules-blob) and [SDK docs](https://arcade.xaya.io/docs/sdk); local official examples at `~/Downloads/xaya-arcade-examples`.
- [Soccerverse datapack](https://soccerverse.com/developers/datapack-and-assets) and [Soccerverse MCP player data](https://soccerverse.com/developers/soccerverse-mcp).
- [IFAB penalty shootout procedure](https://www.theifab.com/laws/latest/determining-the-outcome-of-a-match/) for early decisions and equal-attempt sudden death; this game's three-kick format is shorter.
