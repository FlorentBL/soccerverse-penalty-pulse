# XAYA Arcade submission draft — do not submit yet

## Game listing

- Title: **Penalty Pulse**
- Proposed slug: `penalty-pulse`
- Proposed game type: `svpenaltypulse` (matches `src/app-identity.ts`)
- Players: exactly 2 (minimum 2, maximum 2)
- Default language: English; optional French, Italian, Spanish and Portuguese
- Mode/policy: **free only**; no WCHI wager requested
- Config suffix: **none** (`null`, not an empty string); 0-byte initial cfg
- Touch/mobile: yes (`public/arcade-manifest.json`)
- Tags (proposal): `Soccer`, `Strategy`, `Duel`
- Tagline: **Pick your duo from six Soccerverse players. Shoot and save.**
- Description: **A fast two-player Soccerverse penalty duel. Choose a shooter from three fixed FC players and a goalkeeper from three fixed GK players. Use every rating band once in each role, read the shot and chase the win.**
- How it works: **Each player selects only from the same fixed roster of three Soccerverse FC shooters and three GK goalkeepers, one 90+, one 75–89 and one 55–74 per role. Arbitrary player IDs are rejected by the WASM rules. The first player commits their hidden duo, the second selects, and the first reveals. The official shooting rating grants 3–8 reliable zones in a nine-zone goal. Before defending, the goalkeeper sees exactly which zones the shooter can score in. Keeper ratings 55–74 cover one zone, 75–89 cover two adjacent zones, and 90+ cover any two distinct zones; against a shooter with only three reliable zones, each keeper covers one. For each penalty the defender secretly commits their keeper position, the shooter chooses one zone, and the defender reveals. Covered shots are saved; uncovered reliable shots score; the rest go wide. Players alternate for up to three regulation penalties each, using the 90+, 75–89 and 55–74 rating bands once per role. An early decision ends the match; a tie enters paired sudden death, where players and bands may be reused. A timed-out player forfeits. A remaining tie at the 254-kick wire limit awards the match to the first shooter. All thresholds and zone layouts are Arcade rules.**
- Soccerverse data: The fixed six IDs and names from the pinned official datapack, `rating_shooting`, `rating_gk` and `position_main` from pinned official Soccerverse MCP snapshots. No ownership check or live profile sync. Provenance and hashes in `data/SOURCE.md`.
- Creator-fee request: **none**. WCHI stakes are a separate later operator discussion; this repository assumes no configurable creator fee on the GSP.

## Artifacts

- Local repository: `/Users/fbl/Documents/soccerverse-penalty-pulse`
- Remote Git URL: `https://github.com/FlorentBL/soccerverse-penalty-pulse` (private during playground testing)
- Tested game commit SHA: `435bf111d1a1aabedf17a340b0d018be45e8245a`
- WASM path: `blob/rules.wasm`
- WASM SHA-256: `4cddbd81a8f5f060b21e1385377426e653197542f04d431433f089946447fc77`
- State encoding: version 3, fixed 127 bytes
- Bundle path: `dist/bundle.tar.gz` (generated locally, ignored by Git)
- Attached playground bundle SHA-256: `ad339451a8c3494a67756760f3b6945bdebc1761db91de885cc2a841672070ab` (`FRAME_ANCESTORS=https://test-arcade.xaya.io`, `NEXT_PUBLIC_GAME_ID=xarc`). The games-host supplies runtime relay, GSP and Polygon endpoints; the local export intentionally used blank endpoint variables.
- Playground update: `20260926-191946-penalty-pulse-79cd`; [status](https://test-arcade.xaya.io/api/submissions/20260926-191946-penalty-pulse-79cd), [play](https://test-arcade.xaya.io/play/penalty-pulse). The 2026-09-26 fixed-roster resubmission used the existing reclaim token. Preflight reported only the expected reclaim warning. Auto-accept completed every step (`reclaim`, `preflight`, `slots`, `bake`, `onchain`, `register`, `content`, `verify`, `accepted`). This is the disposable test chain, not a public Arcade submission.
- Source datapack SHA-256: `d8cc1fe15c726c7360e259783a9d9a4ba0b9069096f50ecdfa4b434402b6ff3e`
- Soccerverse shooting table SHA-256: `fe0eb9c810a27f17f6ad605ee29669449774bc2a55603e0cfaa6c1e1065abfd6`
- Soccerverse goalkeeper table SHA-256: `e615569b6699fdc1dbdb3bfd0bf0b0ec1f3b514ee006e3e71fb2a9e849dc60f2`
- Soccerverse primary FC bitset SHA-256: `6c11108dc5e6cc56e4f7250e271e42f8fda2d31f5ff260328ab629ccd54ec90d`
- Soccerverse primary GK bitset SHA-256: `723ca7fcd919ce383a6d5762981413a90e693c60dab5c7e20543e0569ee72c8c`
- SDK: vendored `@xayaarcade/sdk` 0.20.5; version checked against the local platform example snapshot, release commit provenance still needs a real platform Git checkout.

## Locally verified

- 179,100 pinned official Soccerverse shooting and goalkeeper values. The goalkeeper snapshot was fetched through the official public MCP `search_players` field `rating_gk`; no unavailable values.
- Exact mixed-strategy balance from `scripts/measure-balance.py`: the nine featured shooter-versus-keeper matchups score 66.7–87.5%. The 59-rated Balotelli has three scoring zones and scores 66.7% against any featured keeper under optimal randomized zone play. These are mathematical one-penalty probabilities, not human match results or full-game win rates.
- Native C++ rules: hidden duo selection, per-role tier use, distinct shooter and keeper per pair, keeper reach, misses, invalid/repeated selections, invalid reveals, early decision, paired sudden death, timeout and 254-kick technical cap. Fixed native traces pass.
- WASM judge: the early-decision and sudden-death traces replay byte for byte; malformed cfg/state/moves, invalid moves, goalkeeper reach, and timeout checks pass. `blob/check-blob.sh --strict` confirms 14 expected exports, zero imports and the pinned WASM toolchain fingerprint.
- React: eight UI flow tests plus local preview and SDK secret-persistence tests, 22 Vitest tests total; TypeScript checks, SDK CSS check and static bundle build pass. The interface tests check that only the six fixed cards appear, no arbitrary ID field exists, the defender sees the exact three reliable zones, and the in-game rules guide opens and closes.
- Browser: the wallet-free hotseat preview was played through distinct P1/P2 fixed-roster selections, a goalkeeper placement, a resolved shot and the next defender turn. The defender saw the exact three numbered zones for the low-rated shooter. The fixed-roster mobile UI was visually checked at 393 × 852 and 320 × 640; the 320 px player cards use rows. No ID input, horizontal overflow or browser errors were observed. The playground bundle still needs a live two-player mobile check inside the Arcade shell.

## Required before submission

1. Play a complete game using **two independent accounts/browser profiles** through `/play/penalty-pulse`. Check hidden duo commit/reveal, keeper commit/reveal with one and two zones, saves, goals, tier exhaustion, early finish or sudden death, timeout/disconnect recovery and a mobile viewport. Record the match result. This has **not** been performed yet. A user-provided screenshot shows a live match at kick 5 of 6 on a previous bundle, but does not prove completion or validate these new rules.
2. Rebuild and replace the current playground attachment after any further game changes; record the new artifact hashes.
3. Make the source accessible to XAYA reviewers (publish the repository or grant them access). The playground accepts a private source URL, but it does not make the source readable to reviewers.
4. Submit via the [official XAYA game submission form](https://github.com/xaya/arcade-submissions/issues/new?template=game-submission.yml) only after 1–3 pass. The playground preflight accepted the proposed slug and game type on its disposable chain; availability on the real Arcade is still unconfirmed.
