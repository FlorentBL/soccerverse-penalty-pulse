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
- Description: **A fast two-player Soccerverse penalty duel in a nine-zone goal. Pick a player, secretly place your goalkeeper, then aim the shot. Three kicks each decide the match.**
- How it works: **The striker picks an unused Soccerverse player. Their Arcade-specific Pulse precision provides 3, 5 or 7 reliable targets in a nine-zone goal. The goalkeeper sees the player and chooses one of the nine spots; the choice stays secret. The striker aims. A matching spot saves. An unmatched shot scores only in one of that player's reliable targets; otherwise it goes wide. Players alternate for six kicks; the higher score wins, equal scores draw. A timed-out player forfeits. Pulse precision is derived from the Soccerverse ID, not the official Soccerverse shooting rating.**
- Soccerverse data: IDs and names from the pinned official datapack; no player ownership check or live profile sync.
- Creator-fee request: **none**. WCHI staking would be a separate later discussion with XAYA's operator; this repository does not assume creator-fee configurability on the GSP.

## Artifacts

- Local repository: `/Users/fbl/Documents/soccerverse-penalty-pulse`
- Remote Git URL: **pending**
- Tested full commit SHA: **pending**
- WASM path: `blob/rules.wasm`
- WASM SHA-256: `1f28f0bfdba8995468b28b4951fe73cc26a8f812729ba2b68dbd7da3ec70ffe9`
- Bundle path: `dist/bundle.tar.gz` (generated locally, ignored by Git)
- Local playground bundle SHA-256: `a737798eb6fdb2d1df733fe6d7f075abde1d0263299248603d2a207683689994` (`FRAME_ANCESTORS=https://test-arcade.xaya.io`, `NEXT_PUBLIC_GAME_ID=xarc`); rebuild after any source change.
- Source datapack SHA-256: `d8cc1fe15c726c7360e259783a9d9a4ba0b9069096f50ecdfa4b434402b6ff3e`
- SDK: vendored `@xayaarcade/sdk` 0.20.5; version checked against the local platform example snapshot, release commit provenance still needs a real platform Git checkout.

## Local checks

- Native C++ rules and a fixed native trace for both win and draw.
- WASM judge replay of both traces, byte for byte, plus malformed cfg/state/move, invalid reveal, and timeout checks.
- React component tests for the goalkeeper, player picker and shot phases; TypeScript checks; production and static export builds; CSS verification; WASM structural/ABI check.
- Browser check of the hotseat prototype: pick player → handoff → choose goalkeeper target → handoff → shoot into same target → saved result.
- Desktop, 320 px and 390 px mobile layout inspection of the wallet-free React preview. All nine keeper placements were checked at those widths; the keeper was hidden from the striker and revealed with the result. On 390 px, six kicks completed with a winner, the restart worked, and the French language switch was checked. The full live channel was **not** exercised locally against two wallet identities.

## Required before submission

1. Publish this repository remotely and record its HTTPS URL and tested full commit SHA.
2. Build a final bundle with the correct target Arcade move namespace and verify its digest.
3. Attach the WASM and bundle on [XAYA's playground](https://test-arcade.xaya.io/attach) with the values above; preflight must accept the names, cfg and artifacts.
4. Play a complete match using two independent browser profiles/accounts through `/play/penalty-pulse`, including keeper commit/reveal, save, goal, draw or win, timeout/disconnect recovery and a mobile viewport. Record the result.
5. Submit via the [official XAYA game submission form](https://github.com/xaya/arcade-submissions/issues/new?template=game-submission.yml) only after 1–4 pass. Availability of slug/game type is not guaranteed before platform preflight.
