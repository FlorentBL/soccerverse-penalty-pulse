#!/usr/bin/env node
/**
 * Guard: the SDK's Tailwind classes must reach the built stylesheet.
 *
 * Tailwind v4's automatic source detection ignores node_modules. The SDK's shared screens
 * ship their classes inside dist/, so a missing (or wrong-path) @source line in globals.css
 * silently produces a build where the lobby, the login and the HUD render completely
 * unstyled - a failure no unit test can see, because it only exists in the emitted CSS.
 * This checks the emitted CSS. The sentinel is a class used by an SDK component and by
 * nothing in this repo.
 *
 * PAST BUG, fixed here: automatic source detection does NOT skip this repo's own scripts/ -
 * only node_modules/ and gitignored paths - so writing the sentinel below as a plain string
 * literal made Tailwind emit `.bg-red-950` from THIS FILE's own source, present in the built
 * CSS whether or not the @source line in globals.css existed or was correct. Measured: with
 * the @source line deleted, the sentinel was still found (guard reported OK when it should
 * have failed). Fixed by excluding scripts/ from Tailwind's scan (`@source not "../../scripts"`
 * in src/app/globals.css) rather than obscuring the literal here, so this file can stay plain
 * and readable while the guard becomes genuinely load-bearing.
 *
 * Re-measured after the fix, sentinel occurrences in the built CSS (`grep -o` over the emitted
 * stylesheet):
 *   - @source line (the SDK dist inclusion) removed: 0 occurrences - guard FAILS, correctly.
 *   - @source line present:                          4 occurrences - the two real SDK usages
 *     (`bg-red-950/30` in ChannelGame's disconnect banner, `bg-red-950/80` in its load-failure
 *     overlay), each compiled to a color-mix rule plus its fallback - guard PASSES, correctly.
 *
 * STATIC_DIR is searched recursively, not just its top level: `next build` on this repo's
 * Next.js version defaults to Turbopack, which emits the stylesheet under
 * .next/static/chunks/<hash>.css, not the classic webpack .next/static/css/<hash>.css.
 * Recursing over .next/static finds either layout (and whatever a future bundler picks),
 * so this guard does not silently pass by finding zero files in the wrong place.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const SENTINEL = 'bg-red-950'; // SDK ChannelGame's load-failure overlay; excluded from this
// repo's own Tailwind scan via `@source not "../../scripts"` in globals.css - see above.
const STATIC_DIR = '.next/static';

function findCssFiles(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries.flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return findCssFiles(full);
    return entry.name.endsWith('.css') ? [full] : [];
  });
}

const cssFiles = findCssFiles(STATIC_DIR);
if (cssFiles.length === 0) {
  console.error(`no .css files under ${STATIC_DIR} - run \`npm run build\` first`);
  process.exit(1);
}

const css = cssFiles.map((f) => readFileSync(f, 'utf8')).join('\n');

if (!css.includes(SENTINEL)) {
  console.error(
    `FAIL: the SDK's Tailwind classes are missing from the built stylesheet ` +
      `(sentinel "${SENTINEL}" not found).\n` +
      `Tailwind v4 does not scan node_modules - check the @source line in src/app/globals.css ` +
      `points at the SDK's dist.`,
  );
  process.exit(1);
}
console.log(`OK: the SDK's classes reach the stylesheet (sentinel "${SENTINEL}" present)`);
