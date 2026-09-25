# Contributing

Game logic belongs in `rules/pulse/` and must remain deterministic. `rules/arcade_abi.cpp` exposes it through the XAYA Arcade ABI. Changes to move bytes or serialized state need matching TypeScript codec changes, a regenerated `blob/rules.wasm` and updated golden traces.

Run `npm run test:native`, `npm test`, `npm run typecheck` and `npm run build` before proposing a commit. The committed WASM hash must match a clean rebuild. Frontend code must use the official SDK for channel, wallet and matchmaking operations.
