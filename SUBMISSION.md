# XAYA Arcade submission draft — do not submit yet

## Game listing

- Title: **Penalty Pulse**
- Proposed slug: `penalty-pulse`
- Proposed game type: `svpenaltypulse` (matches `src/app-identity.ts`)
- Players: exactly 2 (min 2, max 2)
- Default language: English; optional French, Italian, Spanish, Portuguese
- Mode/policy: **free only**; no WCHI wagers requested
- Config suffix: **none** (`null`, not an empty string); 0-byte initial cfg
- Touch/mobile: yes (`public/arcade-manifest.json`)
- Tags (proposal): `Soccer`, `Strategy`, `Duel`
- Tagline: **Pick a star. Place your keeper. Read the shot.**
- Description: **A fast two-player Soccerverse penalty duel in a nine-zone goal. Pick a player, secretly place your goalkeeper, then aim the shot. Three kicks each, early decisions and sudden death.**
- How it works: **Each striker picks a different Soccerverse player for each of their three regulation kicks. The pinned official `rating_shooting` gives that player 2–8 reliable targets in the nine-zone goal: below 55 gives 2; 55–59 gives 3; 60–64 gives 4; 65–69 gives 5; 70–79 gives 6; 80–89 gives 7; 90 or higher gives 8. The exact target pattern is an Arcade rule derived from player ID. The goalkeeper sees the player and secretly chooses one of the nine spots; the striker then aims. A matching spot saves. An unmatched shot scores only in a reliable target; otherwise it goes wide. Players alternate. The match ends early if the trailing side cannot catch up. A tie after three kicks each enters paired sudden death, with player reuse allowed; the first side ahead after equal attempts wins. A timed-out player forfeits. At the 254-kick wire-format cap, the first shooter wins a remaining tie.**
- Soccerverse data: IDs and names from the pinned official datapack, `rating_shooting` from a pinned official Soccerverse MCP snapshot; no player ownership check or live profile sync. Snapshot details and hash are in `data/SOURCE.md`.
- Creator-fee request: **none**. WCHI staking would be a separate later discussion with XAYA's operator; this repository does not assume creator-fee configurability on the GSP.

## Artifacts

- Local repository: `/Users/fbl/Documents/soccerverse-penalty-pulse`
- Remote Git URL: **pending**
- Tested full commit SHA: **pending**
- WASM path: `blob/rules.wasm`
- WASM SHA-256: `63073035b19e4bc18297c32bda4cff7d37241afc0a48da1f5bde97d0f8d21973`
- Bundle path: `dist/bundle.tar.gz` (generated locally, ignored by Git)
- Local playground bundle SHA-256: `2b1c7bc81336451b374b00f20127742d0ec070b0c53d79c307aa50f8f0a07272` (`FRAME_ANCESTORS=https://test-arcade.xaya.io`, `NEXT_PUBLIC_GAME_ID=xarc`). The games-host must supply the runtime relay, GSP and Polygon endpoints; the local export used blank endpoint environment variables.
- Source datapack SHA-256: `d8cc1fe15c726c7360e259783a9d9a4ba0b9069096f50ecdfa4b434402b6ff3e`
- Soccerverse shooting table SHA-256: `fe0eb9c810a27f17f6ad605ee29669449774bc2a55603e0cfaa6c1e1065abfd6`
- SDK: vendored `@xayaarcade/sdk` 0.20.5; version checked against the local platform example snapshot, release commit provenance still needs a real platform Git checkout.

## Local checks

- Native C++ rules and fixed traces for early win and sudden-death win; 254-kick technical cap checked.
- WASM judge replay of both traces, byte for byte, plus malformed cfg/state/move, invalid reveal, and timeout checks.
- React component tests for goalkeeper, player picker, shooting, sudden-death reuse and the post-reveal shot replay; TypeScript checks; production and static export builds; CSS verification; WASM structural/ABI check.
- Browser check of the hotseat prototype: pick player → handoff → choose goalkeeper target → handoff → shoot into same target → saved result.
- Desktop and 320 px browser inspections of the updated wallet-free React preview checked the displayed official shooting rating, reliable-zone count, keeper placement, concealed dive on the striker's turn, and the corrected mobile toolbar and scrolling action button. Component tests verify the sudden-death label and reuse. The full live channel was **not** exercised locally against two wallet identities.
- Desktop and 320 px browser inspections of the shot animation checked the ball trajectory, keeper dive, result overlay and score update after impact in the wallet-free preview. The replay has not yet been verified in a live two-player playground match.

## Required before submission

1. Publish this repository remotely and record its HTTPS URL and tested full commit SHA.
2. Build a final bundle with the correct target Arcade move namespace and verify its digest.
3. Attach the WASM and bundle on [XAYA's playground](https://test-arcade.xaya.io/attach) with the values above; preflight must accept the names, cfg and artifacts.
4. Play a complete match using two independent browser profiles/accounts through `/play/penalty-pulse`, including keeper commit/reveal, save, goal, early decision or sudden-death win, timeout/disconnect recovery and a mobile viewport. Record the result.
5. Submit via the [official XAYA game submission form](https://github.com/xaya/arcade-submissions/issues/new?template=game-submission.yml) only after 1–4 pass. Availability of slug/game type is not guaranteed before platform preflight.
