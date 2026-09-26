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
- Tagline: **Pick your player. Shoot and save.**
- Description: **A fast two-player Soccerverse penalty duel. Each round, secretly select one footballer who takes your penalty and guards your rival's. Place your keeper in a nine-zone goal, read the shot and chase the win.**
- How it works: **Both players select a Soccerverse player for a pair of penalties. The first player commits a hidden selection, the second selects, and the first reveals. Each selection is a shooter and a keeper for that round. The pinned official shooting rating gives 2–8 reliable zones in a nine-zone goal. A goalkeeper rating of at least 75 lets the defender cover a second adjacent zone against shooters with at least four reliable zones. This defensive focus caps that keeper's own reliable shot zones at four. These thresholds and zone layouts are Arcade rules. For each penalty, the defender secretly commits the goalkeeper's position(s), the striker chooses one zone, and the defender reveals. Covered shots are saved; uncovered reliable shots score; the rest go wide. Players alternate for up to three regulation penalties each, using a different player per round. An early decision ends the match; a tie enters paired sudden death, where players may be reused. A timed-out player forfeits. A remaining tie at the 254-kick wire limit awards the match to the first shooter.**
- Soccerverse data: IDs and names from the pinned official datapack, `rating_shooting` and `rating_gk` from pinned official Soccerverse MCP snapshots. No ownership check or live profile sync. Provenance and hashes in `data/SOURCE.md`.
- Creator-fee request: **none**. WCHI stakes are a separate later operator discussion; this repository assumes no configurable creator fee on the GSP.

## Artifacts

- Local repository: `/Users/fbl/Documents/soccerverse-penalty-pulse`
- Remote Git URL: `https://github.com/FlorentBL/soccerverse-penalty-pulse` (private during playground testing)
- Tested game commit SHA: `6a5c723203334862af6c1f15ead5cb59a69db810`
- WASM path: `blob/rules.wasm`
- WASM SHA-256: `b0bfcd4a08cb2a0d83e6cc65ba8214b0c00b538631595ede73860591ba224c9f`
- State encoding: version 2, fixed 87 bytes
- Bundle path: `dist/bundle.tar.gz` (generated locally, ignored by Git)
- Attached playground bundle SHA-256: `a025dbb2f8fc9b68e3171b372c3756345ee148dca7cb292430f33acace59f5cd` (`FRAME_ANCESTORS=https://test-arcade.xaya.io`, `NEXT_PUBLIC_GAME_ID=xarc`). The games-host supplies runtime relay, GSP and Polygon endpoints; the local export intentionally used blank endpoint variables.
- Playground update: `20260926-174239-penalty-pulse-3422`; [status](https://test-arcade.xaya.io/api/submissions/20260926-174239-penalty-pulse-3422), [play](https://test-arcade.xaya.io/play/penalty-pulse). The 2026-09-26 resubmission used the original attachment's reclaim token. Preflight reported only the expected reclaim warning. Auto-accept completed every step (`reclaim`, `preflight`, `slots`, `bake`, `onchain`, `register`, `content`, `verify`, `accepted`). This is the disposable test chain, not a public Arcade submission.
- Source datapack SHA-256: `d8cc1fe15c726c7360e259783a9d9a4ba0b9069096f50ecdfa4b434402b6ff3e`
- Soccerverse shooting table SHA-256: `fe0eb9c810a27f17f6ad605ee29669449774bc2a55603e0cfaa6c1e1065abfd6`
- Soccerverse goalkeeper table SHA-256: `e615569b6699fdc1dbdb3bfd0bf0b0ec1f3b514ee006e3e71fb2a9e849dc60f2`
- SDK: vendored `@xayaarcade/sdk` 0.20.5; version checked against the local platform example snapshot, release commit provenance still needs a real platform Git checkout.

## Locally verified

- 179,100 pinned official Soccerverse shooting and goalkeeper values. The goalkeeper snapshot was fetched through the official public MCP `search_players` field `rating_gk`; no unavailable values.
- Exact mixed-strategy balance from `scripts/measure-balance.py`: all nine featured striker-versus-keeper combinations score at 75% each way. Featured striker-versus-striker scores 87.5% each, and featured keeper-versus-keeper scores 50% each. These are mathematical probabilities for optimal randomized zone play, not observations of human matches.
- Native C++ rules: hidden pair selection, role reuse within a pair, keeper reach, cap, misses, invalid/repeated players, invalid reveals, early decision, paired sudden death, timeout and 254-kick technical cap. Fixed native traces pass.
- WASM judge: the early-decision and sudden-death traces replay byte for byte; malformed cfg/state/moves, invalid moves, goalkeeper reach, and timeout checks pass. `blob/check-blob.sh --strict` confirms 14 expected exports, zero imports and the pinned WASM toolchain fingerprint.
- React: five UI flow tests plus local preview and SDK secret-persistence tests, 16 Vitest tests total; TypeScript checks, SDK CSS check and static bundle build pass. The updated test asserts that player 2 sees the keeper role before the shooting role. The static bundle hash above was uploaded and accepted on the playground.
- Browser: wallet-free hotseat preview previously played through a goal and a save on the keeper's second covered zone. The keeper choice stayed hidden on the shooter's view, the result appeared only after the shot, and the next round was selectable. The latest mobile UI was visually checked at 393 × 852 and 320 × 640: a compact nine-zone goal, phase-specific guidance, visible score, bottom action and language controls, no horizontal overflow, and automatic scroll reset after player selection. The preview was checked in the goalkeeper phase through a first choice and the adjacent-zone prompt. The new playground bundle still needs a live two-player mobile check inside the Arcade shell.

## Required before submission

1. Play a complete game using **two independent accounts/browser profiles** through `/play/penalty-pulse`. Check hidden player-pick commit/reveal, keeper commit/reveal with one and two zones, saves, goals, early finish or sudden death, timeout/disconnect recovery and a mobile viewport. Record the match result. This has **not** been performed yet. A user-provided screenshot shows a live match at kick 5 of 6 on the previous bundle, but does not prove completion or validate the new mobile layout. A free table was created from a second browser profile as `p/tw2ace`; the other profile loaded the open table as `p/tw1ace`, but automated interaction with its cross-origin game iframe could not complete the join.
2. Rebuild and record the final bundle SHA-256 after any game changes; the current tested bundle is attached to the playground.
3. Make the source accessible to XAYA reviewers (publish the repository or grant them access). The playground accepts a private source URL, but it does not make the source readable to reviewers.
4. Submit via the [official XAYA game submission form](https://github.com/xaya/arcade-submissions/issues/new?template=game-submission.yml) only after 1–3 pass. The playground preflight accepted the proposed slug and game type on its disposable chain; availability on the real Arcade is still unconfirmed.
