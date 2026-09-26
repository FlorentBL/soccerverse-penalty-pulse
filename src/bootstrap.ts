/**
 * The app bootstrap: declare this app's identity to the SDK and register its one game
 * adapter. Importing this module IS the bootstrap (module-scope side effect), which is what
 * makes it impossible to render an SDK screen before it has run.
 *
 * WHERE IT MUST RUN, AND WHY THAT IS EXACT:
 *   - `src/app/providers.tsx` imports it. providers.tsx is a 'use client' module, so it is
 *     evaluated in BOTH module graphs - the browser bundle AND the server (Next SSRs the
 *     client tree; `output: 'export'` prerenders it at BUILD time). Module-scope side
 *     effects run at import, which strictly precedes any render of any component in that
 *     graph, and <Providers> wraps every page.
 *   - `src/app/layout.tsx` (a server component) imports it too. Belt and braces: it closes
 *     the hole where a future route renders SDK code without going through <Providers>.
 *
 * IF IT RUNS TOO LATE (e.g. from a useEffect, or from a component body below <Game/>),
 * these are the four failures, in the order you would hit them:
 *   1. ModeSelect renders `{appConfig().title}` during SSR / static export - `next build`
 *      CRASHES with "appConfig: read before configureApp() has run".
 *   2. hydrateChannelStore() runs inside Game's useState initializer and SWALLOWS the throw
 *      - a returning player silently sees the login screen forever. This is the nastiest
 *      one: it does not crash, it just loses your session.
 *   3. GAME_ID() throws inside the blob load - surfaces as ChannelGame's loadError.
 *   4. ChannelLobby's resolveGameId() throws "No game adapter has been registered".
 */
import { configureApp, getAdapter, registerAdapter } from '@xayaarcade/sdk';
import { pulseAdapter } from '@/lib/games/pulse-adapter';
import { GAME_KEY, MOVE_NS, TITLE, STORAGE_PREFIX } from '@/app-identity';

let done = false;

/**
 * Idempotent. A repeated import keeps the same configuration. During Fast Refresh,
 * the SDK registry can outlive this module, so the registered adapter is updated in place.
 */
export function bootstrapApp(): void {
  if (done) return;
  configureApp({
    gameId: GAME_KEY,
    moveNamespace: MOVE_NS,
    title: TITLE,
    storagePrefix: STORAGE_PREFIX,
  });
  // Fast Refresh re-evaluates this module while the SDK registry stays alive.
  // Reuse its registered adapter and refresh its methods instead of throwing.
  let existing: typeof pulseAdapter | null = null;
  try { existing = getAdapter(GAME_KEY); } catch { /* First registration. */ }
  if (existing) Object.assign(existing, pulseAdapter);
  else registerAdapter(GAME_KEY, pulseAdapter);
  done = true;
}

bootstrapApp();
