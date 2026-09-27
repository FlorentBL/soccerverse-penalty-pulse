# XAYA Arcade submission dossier

Public listing request: [xaya/arcade-submissions#1](https://github.com/xaya/arcade-submissions/issues/1), opened with the exact game commit `2634193f8e7804b146486a2aa6a3f4478a2ce149`. Review and public listing are pending. The issue discloses the missing live two-account test.

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
- Description: **A fast two-player Soccerverse penalty duel. On each kick the attacker chooses one of five fixed FC strikers, the defender chooses one of five fixed GK keepers, then both choose their positions. Swap roles and chase the win.**
- How it works: **P1 chooses an FC shooter; P2 sees the shooter and chooses a GK keeper. The goalkeeper is positioned secretly, then the attacker shoots at one of their green scoring zones. Roles swap after every penalty. Each side has five distinct shooters and five distinct keepers rated 90+, 80–89, 70–79, 60–69 and 55–59. Each card is used once per role in regulation. Better shooters have more scoring zones (3–8). Depending on both ratings, keepers cover one or two touching zones. Covered shots are saved; uncovered shots score. After five shots each, a tie enters paired sudden death and cards may be reused. Early decisions, timeouts and invalid moves are enforced by deterministic WASM rules. Player ratings and primary positions are pinned from official Soccerverse data; ownership is not required.**
- Soccerverse data: The 20 fixed IDs and names from the pinned official datapack, `rating_shooting`, `rating_gk` and `position_main` from pinned official Soccerverse MCP snapshots. No ownership check or live profile sync. Provenance and hashes in `data/SOURCE.md`.
- Creator-fee request: **none**. WCHI stakes are a separate later operator discussion; this repository assumes no configurable creator fee on the GSP.

## Artifacts

- Local repository: `/Users/fbl/Documents/soccerverse-penalty-pulse`
- Remote Git URL: `https://github.com/FlorentBL/soccerverse-penalty-pulse` (public; reviewers can read the exact commit)
- Tested game commit SHA: `2634193f8e7804b146486a2aa6a3f4478a2ce149`
- WASM path: `blob/rules.wasm`
- WASM SHA-256: `7ba32b8d8251fa8f7a3579854574093c2b2271fe9ea1f046eb707db70873acc3`
- State encoding: version 6, fixed 159 bytes
- Bundle path: `dist/bundle.tar.gz` (generated locally, ignored by Git)
- Attached playground bundle SHA-256: `188a7dd0b78077adf7421346fcca901eda95805e2b094181dc7d33bea00793fa` (`FRAME_ANCESTORS=https://test-arcade.xaya.io`, `NEXT_PUBLIC_GAME_ID=xarc`). The games-host supplies runtime relay, GSP and Polygon endpoints; the local export intentionally uses blank endpoint variables.
- Playground update: `20260927-064233-penalty-pulse-cb2a`; [status](https://test-arcade.xaya.io/api/submissions/20260927-064233-penalty-pulse-cb2a), [play](https://test-arcade.xaya.io/play/penalty-pulse). The disposable playground auto-accepted the five-card bundle: reclaim, preflight, slots, bake, onchain, register, content and verify all passed. This is not a public Arcade submission.
- Source datapack SHA-256: `d8cc1fe15c726c7360e259783a9d9a4ba0b9069096f50ecdfa4b434402b6ff3e`
- Soccerverse shooting table SHA-256: `fe0eb9c810a27f17f6ad605ee29669449774bc2a55603e0cfaa6c1e1065abfd6`
- Soccerverse goalkeeper table SHA-256: `e615569b6699fdc1dbdb3bfd0bf0b0ec1f3b514ee006e3e71fb2a9e849dc60f2`
- Soccerverse primary FC bitset SHA-256: `6c11108dc5e6cc56e4f7250e271e42f8fda2d31f5ff260328ab629ccd54ec90d`
- Soccerverse primary GK bitset SHA-256: `723ca7fcd919ce383a6d5762981413a90e693c60dab5c7e20543e0569ee72c8c`
- SDK: vendored `@xayaarcade/sdk` 0.20.5; version checked against the local platform example snapshot, release commit provenance still needs a real platform Git checkout.

## Locally verified

- 179,100 pinned official Soccerverse shooting and goalkeeper values. The goalkeeper snapshot was fetched through the official public MCP `search_players` field `rating_gk`; no unavailable values.
- Balance from `scripts/measure-balance.py`: 50 cross-team one-penalty matchups score 66.7–87.5% with optimal randomized zones. Both teams have a 59-rated three-zone shooter at 66.7% against every keeper. These are mathematical shot values, not observed match win rates.
- Native C++ rules: sequential shooter/keeper selection, per-role tier use, keeper reach, rejection of shots outside green zones, invalid/repeated selections, invalid reveals, early decision, paired sudden death, timeout and 254-kick technical cap. Fixed native traces pass.
- WASM judge: the early-decision and sudden-death traces replay byte for byte; malformed cfg/state/moves, invalid moves, goalkeeper reach, and timeout checks pass. `blob/check-blob.sh --strict` confirms 14 expected exports, zero imports and the pinned WASM toolchain fingerprint.
- React: nine UI flow tests plus local preview and SDK secret-persistence tests, 25 Vitest tests total; TypeScript checks, SDK CSS check and static bundle build pass. The interface tests check the sequential roles, disabled dark shot zones and a result that remains visible until Continue.
- Browser: the wallet-free preview was checked at 320×640 and 390×844. At 320×640, complete penalties with a high-rated and a 59-rated shooter reached the result and next role; both first and fifth cards were selectable, the confirmation action became visible after selection, the cage and result stayed in view, and there was no horizontal overflow. The hosted Arcade shell at 390×844 loaded to its wallet gate. A real phone and a live two-player match still need testing.


## Live validation still needed

- Play a complete game using **two independent accounts/browser profiles** through `/play/penalty-pulse`. Check sequential shooter/keeper selection, hidden keeper commit/reveal with one and two zones, saves, goals, disabled dark shot zones, the persistent mobile result, tier exhaustion, early finish or sudden death, timeout/disconnect recovery and a mobile viewport. Record the match result. This has **not** been performed yet. An earlier user screenshot showed a live match on an older six-kick bundle, but does not validate the current ten-kick rules.
- After any game change, rebuild and replace the playground attachment and record the new hashes.
- Source repository is public and accessible to reviewers.
- The public Arcade listing remains subject to XAYA review. Playground acceptance does not confirm availability on the production Arcade.
