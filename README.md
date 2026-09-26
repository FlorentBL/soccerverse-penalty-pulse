# Penalty Pulse

A free two-player Soccerverse penalty duel for XAYA Arcade. Each player has **five FC shooters and five GK keepers**, in five rating bands: 90+, 80–89, 70–79, 60–69 and 55–59. P1 and P2 have distinct teams. Every card can be used once per role during the five regulation penalties, so each player must eventually use their lower-rated shooter and keeper unless the match ends early.

## Rules

1. P1 chooses a shooter; P2 sees that player and chooses a goalkeeper. The defender secretly positions the goalkeeper, then the attacker aims. On the next penalty they swap roles. Only the fixed, position-verified Soccerverse players are legal.
2. The goal has nine zones. Both players see the shooter's green scoring zones before the goalkeeper is placed. A shooter rated 55–59 has 3 zones; 60–64 has 4; 65–69 has 5; 70–79 has 6; 80–89 has 7; 90+ has 8. Dark zones cannot be selected or submitted to the WASM judge.
3. A GK rated 55–59 covers one zone. At 60–69, a second edge-touching zone is allowed against a shooter with 8 green zones; at 70–79, against 6+ green zones; at 80–89, against 5+ green zones. A 90+ GK can cover two zones touching by an edge or corner against 5+ green zones. The keeper cannot cover separated zones. Against a three-zone shooter, every GK covers one zone.
4. A covered shot is saved; an uncovered green-zone shot scores. The defender's committed position is revealed after the shot. The score, animation and result remain visible until **Continue**.
5. Each side has up to five regulation shots. The game ends early when a comeback is impossible. A tie after five shots each enters paired sudden death; cards may then be reused. The active player forfeits on timeout. A tie at the 254-kick wire limit goes to P1.

The player names, IDs, ratings and FC/GK primary positions come from pinned official Soccerverse data (179,100 players). Zone patterns, rating bands and coverage are **Arcade rules**. Ownership is not required and no live Soccerverse call occurs during a match.

| Band | P1 FC / GK | P2 FC / GK |
|---|---|---|
| 90+ | Kane 97 / Raya 95 | Haaland 96 / Svilar 93 |
| 80–89 | Ronaldo 88 / Leno 89 | Messi 88 / Pickford 89 |
| 70–79 | Solanke 79 / Ospina 79 | Muriel 79 / Letica 79 |
| 60–69 | Quaison 64 / Whiteman 64 | Gray 64 / Donnarumma 64 |
| 55–59 | Balotelli 59 / Oelschlägel 59 | Moses 59 / Romero 59 |

## Balance measurement

`python3 scripts/measure-balance.py` computes exact optimal mixed-strategy goal chances for every fixed shooter/keeper pairing from pinned ratings. The 50 cross-team matchups range from **66.7% to 87.5%**. Both teams have a 59-rated shooter with three green zones (66.7% against any goalkeeper), a 64-rated shooter with four zones, and similar higher-rating options. These are mathematical **one-shot** values, not measured human or full-match win rates. The P1 and P2 distributions are close but not identical; live two-player playtesting remains necessary.

## Play locally

Run `npm ci && npm run dev`, then open `http://localhost:3001/?preview=1` or select **Preview without wallet**. The full React board runs a local hotseat game without a wallet. It has the same selection, zone, save and scoring logic as the WASM judge; the online match remains judged by `blob/rules.wasm` through the official XAYA Arcade SDK. The interface defaults to English, with French, Italian, Spanish and Portuguese available. For a phone on the same Wi-Fi, open `http://<machine-LAN-IP>:3001/?preview=1` while the dev server is running.

The **Rules** button beneath the kick counter explains the full flow and rating tables in the selected language. It is available during both the local preview and online play.

Each goalkeeper position uses a local 32-byte salt stored per channel, seat and kick. Keep the same browser through reveal; losing a secret before reveal can lead to a timeout. The hotseat demo skips cryptographic handoff and is for UI rehearsal only. The original static HTML in `prototype/` is an archived early prototype and does not implement the current rules.

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
- [IFAB penalty shootout procedure](https://www.theifab.com/laws/latest/determining-the-outcome-of-a-match/) for early decisions and equal-attempt sudden death; this game's five-kick format follows the standard shootout length.
