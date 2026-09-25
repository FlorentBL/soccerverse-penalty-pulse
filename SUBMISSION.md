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
- Description: **A fast two-player Soccerverse penalty duel. Pick a player, study their two scoring lanes, secretly place your goalkeeper, then take the shot. Three kicks each decide the match.**
- How it works: **The striker picks an unused Soccerverse player. The goalkeeper sees that player and chooses left, centre or right; the choice stays secret. The striker aims. A matching dive saves. An unmatched shot scores only in one of that player's two effective lanes. Players alternate for six kicks; the higher score wins, equal scores draw. A timed-out player forfeits. The player lanes are game traits derived from Soccerverse IDs, not Soccerverse ratings.**
- Soccerverse data: IDs and names from the pinned official datapack; no player ownership check or live profile sync.
- Creator-fee request: **none**. WCHI staking would be a separate later discussion with XAYA's operator; this repository does not assume creator-fee configurability on the GSP.

## Artifacts

- Local repository: `/Users/fbl/Documents/soccerverse-penalty-pulse`
- Remote Git URL: **pending**
- Tested full commit SHA: **pending**
- WASM path: `blob/rules.wasm`
- WASM SHA-256: `e2a10653e15c7168457740ee434be3c21f537dd7a5d9ae1696df962e66e33f18`
- Bundle path: `dist/bundle.tar.gz` (generated locally, ignored by Git)
- Bundle SHA-256: **see `dist/bundle.tar.gz.sha256` after the final build**
- Source datapack SHA-256: `d8cc1fe15c726c7360e259783a9d9a4ba0b9069096f50ecdfa4b434402b6ff3e`
- SDK: vendored `@xayaarcade/sdk` 0.20.5; version checked against the local platform example snapshot, release commit provenance still needs a real platform Git checkout.

## Local checks

- Native C++ rules and a fixed native trace for both win and draw.
- WASM judge replay of both traces, byte for byte, plus malformed cfg/state/move, invalid reveal, and timeout checks.
- React component tests for the goalkeeper, player picker and shot phases; TypeScript checks; production and static export builds; CSS verification; WASM structural/ABI check.
- Browser check of the hotseat prototype: pick player → handoff → choose goalkeeper lane → handoff → shoot into same lane → saved result.
- Desktop and 390 px mobile layout inspection of the local app shell. The full live channel was **not** exercised locally against two wallet identities.

## Required before submission

1. Publish this repository remotely and record its HTTPS URL and tested full commit SHA.
2. Build a final bundle with the correct target Arcade move namespace and verify its digest.
3. Attach the WASM and bundle on [XAYA's playground](https://test-arcade.xaya.io/attach) with the values above; preflight must accept the names, cfg and artifacts.
4. Play a complete match using two independent browser profiles/accounts through `/play/penalty-pulse`, including keeper commit/reveal, save, goal, draw or win, timeout/disconnect recovery and a mobile viewport. Record the result.
5. Submit via the [official XAYA game submission form](https://github.com/xaya/arcade-submissions/issues/new?template=game-submission.yml) only after 1–4 pass. Availability of slug/game type is not guaranteed before platform preflight.
