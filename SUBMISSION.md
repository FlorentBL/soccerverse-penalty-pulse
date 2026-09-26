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
- Tagline: **Choose a striker. Face a keeper. Take your shot.**
- Description: **A fast two-player Soccerverse penalty duel. On each kick the attacker chooses one of three fixed FC strikers, the defender chooses one of three fixed GK keepers, then both choose their positions. Swap roles and chase the win.**
- How it works: **The attacker chooses a shooter from three fixed Soccerverse FC players. The defender sees the shooter and chooses a goalkeeper from three fixed Soccerverse GK players. Each role has one 90+, one 75–89 and one 55–74 player. Arbitrary player IDs are rejected by the WASM rules. The official shooting rating grants 3–8 green zones in a nine-zone goal. The defender sees exactly which zones the shooter can score in, secretly commits their goalkeeper position, then the attacker aims at a green zone. Dark zones cannot be selected and the WASM judge rejects such moves. The goalkeeper position is revealed and the shot resolves: covered shots are saved; uncovered shots score. An explicit result remains on screen until Continue. Players swap roles after each penalty. Each player takes up to three regulation penalties and uses each rating band once as shooter and once as keeper. Keeper ratings 55–74 cover one zone, 75–89 cover two zones sharing an edge, and 90+ cover two zones touching by an edge or corner; against a shooter with only three green zones, each keeper covers one. An early decision ends the match; a tie enters paired sudden death, where players and bands may be reused. A timed-out player forfeits. A remaining tie at the 254-kick wire limit awards the match to the first shooter. All thresholds and zone layouts are Arcade rules.**
- Soccerverse data: The fixed six IDs and names from the pinned official datapack, `rating_shooting`, `rating_gk` and `position_main` from pinned official Soccerverse MCP snapshots. No ownership check or live profile sync. Provenance and hashes in `data/SOURCE.md`.
- Creator-fee request: **none**. WCHI stakes are a separate later operator discussion; this repository assumes no configurable creator fee on the GSP.

## Artifacts

- Local repository: `/Users/fbl/Documents/soccerverse-penalty-pulse`
- Remote Git URL: `https://github.com/FlorentBL/soccerverse-penalty-pulse` (private during playground testing)
- Tested game commit SHA: `33c256537c58d9e98556bdd6f67867be1d2e9140`
- WASM path: `blob/rules.wasm`
- WASM SHA-256: `8fc60bb14f387220561c44143d9c547106b8dfa582bbd1be35068fbb2e4cce40`
- State encoding: version 5, fixed 127 bytes
- Bundle path: `dist/bundle.tar.gz` (generated locally, ignored by Git)
- Attached playground bundle SHA-256: `6f93b4fe1f8fd62b51a3ac76a3e91f08d32207b8808a162d8cf8cc5dfaa09b5d` (`FRAME_ANCESTORS=https://test-arcade.xaya.io`, `NEXT_PUBLIC_GAME_ID=xarc`). The games-host supplies runtime relay, GSP and Polygon endpoints; the local export intentionally uses blank endpoint variables.
- Playground update: `20260926-200721-penalty-pulse-3c7d`; [status](https://test-arcade.xaya.io/api/submissions/20260926-200721-penalty-pulse-3c7d), [play](https://test-arcade.xaya.io/play/penalty-pulse). The 2026-09-26 green-only resubmission used the existing reclaim token. Preflight reported only the expected reclaim warning. Auto-accept completed every step (`reclaim`, `preflight`, `slots`, `bake`, `onchain`, `register`, `content`, `verify`, `accepted`). This is the disposable test chain, not a public Arcade submission.
- Source datapack SHA-256: `d8cc1fe15c726c7360e259783a9d9a4ba0b9069096f50ecdfa4b434402b6ff3e`
- Soccerverse shooting table SHA-256: `fe0eb9c810a27f17f6ad605ee29669449774bc2a55603e0cfaa6c1e1065abfd6`
- Soccerverse goalkeeper table SHA-256: `e615569b6699fdc1dbdb3bfd0bf0b0ec1f3b514ee006e3e71fb2a9e849dc60f2`
- Soccerverse primary FC bitset SHA-256: `6c11108dc5e6cc56e4f7250e271e42f8fda2d31f5ff260328ab629ccd54ec90d`
- Soccerverse primary GK bitset SHA-256: `723ca7fcd919ce383a6d5762981413a90e693c60dab5c7e20543e0569ee72c8c`
- SDK: vendored `@xayaarcade/sdk` 0.20.5; version checked against the local platform example snapshot, release commit provenance still needs a real platform Git checkout.

## Locally verified

- 179,100 pinned official Soccerverse shooting and goalkeeper values. The goalkeeper snapshot was fetched through the official public MCP `search_players` field `rating_gk`; no unavailable values.
- Exact mixed-strategy balance from `scripts/measure-balance.py`: the nine featured shooter-versus-keeper matchups score 66.7–87.5%. The 59-rated Balotelli has three scoring zones and scores 66.7% against any featured keeper under optimal randomized zone play. These are mathematical one-penalty probabilities, not human match results or full-game win rates.
- Native C++ rules: sequential shooter/keeper selection, per-role tier use, keeper reach, rejection of shots outside green zones, invalid/repeated selections, invalid reveals, early decision, paired sudden death, timeout and 254-kick technical cap. Fixed native traces pass.
- WASM judge: the early-decision and sudden-death traces replay byte for byte; malformed cfg/state/moves, invalid moves, goalkeeper reach, and timeout checks pass. `blob/check-blob.sh --strict` confirms 14 expected exports, zero imports and the pinned WASM toolchain fingerprint.
- React: eight UI flow tests plus local preview and SDK secret-persistence tests, 22 Vitest tests total; TypeScript checks, SDK CSS check and static bundle build pass. The interface tests check the sequential roles, disabled dark shot zones and a result that remains visible until Continue.
- Browser: the wallet-free hotseat preview was played through P1 choosing Kane, P2 choosing Horvath and positioning the keeper. At 320 × 640, Kane's dark zone 01 was disabled; attempting to click it left the shot unselected and the Take Shot button disabled. A green zone 02 shot then scored and displayed the full cage, 1–0 score, GOAL and Continue. This is a local preview; the playground bundle still needs a live two-player mobile check inside the Arcade shell.

## Required before submission

1. Play a complete game using **two independent accounts/browser profiles** through `/play/penalty-pulse`. Check sequential shooter/keeper selection, hidden keeper commit/reveal with one and two zones, saves, goals, disabled dark shot zones, the persistent mobile result, tier exhaustion, early finish or sudden death, timeout/disconnect recovery and a mobile viewport. Record the match result. This has **not** been performed yet. A user-provided screenshot shows a live match at kick 5 of 6 on a previous bundle, but does not prove completion or validate these new rules.
2. Rebuild and replace the playground attachment after any further game changes; record the new artifact hashes.
3. Make the source accessible to XAYA reviewers (publish the repository or grant them access). The playground accepts a private source URL, but it does not make the source readable to reviewers.
4. Submit via the [official XAYA game submission form](https://github.com/xaya/arcade-submissions/issues/new?template=game-submission.yml) only after 1–3 pass. The playground preflight accepted the proposed slug and game type on its disposable chain; availability on the real Arcade is still unconfirmed.
