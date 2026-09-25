/**
 * This game's identity - the one place its ids live. The adapter and configureApp() BOTH
 * read from here, so `adapter.gameId` can never drift from `appConfig().moveNamespace`.
 * That drift is silent and catastrophic: the SDK's MoveSender wraps GAMEPLAY and DISPUTE
 * moves with `adapter.gameId`, while every build*Move() lifecycle envelope uses
 * `appConfig().moveNamespace` - two `g/` namespaces, a channel split in half, and nothing
 * in the SDK cross-checks it. tests/bootstrap/app-identity.test.ts pins the invariant.
 *
 * This module imports NOTHING from the SDK, so it is safe to evaluate at any point in the
 * module graph.
 */

/** The GSP game-type / registry key. A frozen wire constant - never env-derived. */
export const GAME_KEY = 'svpenaltypulse';

/**
 * The on-chain Xaya `g/` move namespace. Equals GAME_KEY in every normal build; a deployment
 * may point it at an isolated namespace via NEXT_PUBLIC_GAME_ID (which must then match the
 * GSP's --game_id).
 */
export const MOVE_NS = process.env.NEXT_PUBLIC_GAME_ID?.trim() || GAME_KEY;

/** Display name the SDK's shared screens show. */
export const TITLE = 'Penalty Pulse';

/** Prefix for every localStorage key the SDK owns on this origin. */
export const STORAGE_PREFIX = 'penaltypulse';
