/**
 * The text scan behind `imports.test.ts`, kept in its own module so it can be exercised on
 * fixtures rather than only on whatever this repo happens to contain today.
 *
 * THE QUESTION IS PER STATEMENT, NOT PER LINE. `import type { A, B } from '@xayaarcade/sdk'`
 * wrapped over several lines puts the specifier on a line that carries no `import type`, so a
 * line-by-line reading calls that closing line a runtime import and fails a file that is
 * correct. Comments are dropped first, because prose ABOUT importing the SDK is not an import
 * of it, and string and template bodies are kept, because the specifier lives in one.
 *
 * It is a text scan, not a parser, and it errs towards reporting: a whole import statement
 * spelled out inside a string is reported, and so is a `typeof import('@xayaarcade/sdk')` type
 * query. What it cannot see is a regular-expression literal, so a `//` inside one (`/a\//`)
 * hides the rest of that line; keep imports on lines of their own, as they are everywhere here.
 */

/**
 * Comments removed, quoted text left intact. One left-to-right alternation rather than several
 * sequential passes: each position is read once, as whichever kind of span actually starts
 * there, so a quote a comment swallows is never separately mistaken for a string, and a
 * comment delimiter inside a string is never separately mistaken for a comment.
 */
const COMMENT_OR_QUOTED =
  /\/\*[\s\S]*?\*\/|\/\/.*|'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g;

function withoutComments(source: string): string {
  return source.replace(COMMENT_OR_QUOTED, (span) => (span.startsWith('/') ? ' ' : span));
}

/** The MAIN entry only: the closing quote is part of the pattern, so '@xayaarcade/sdk/core'
 *  and '@xayaarcade/sdk/e2e' are deliberately not hits. */
const MAIN_ENTRY = String.raw`['"]@xayaarcade\/sdk['"]`;

/**
 * What may stand between the `import`/`export` keyword and its `from`: names, braces, commas,
 * stars and whitespace, and never another statement keyword. The character class is what lets
 * one pattern span a statement wrapped over many lines while still refusing to run past the
 * end of one - an `=`, a `(` or a `;` ends it, so a preceding `export const X = 1` can never
 * be folded into the import that follows it. The keyword guard closes the gap the class alone
 * leaves: a statement made only of names and braces (`export type { A }`, a local re-export
 * with no `from`) would otherwise fold into the runtime import after it and lend it its `type`.
 */
const BINDINGS = String.raw`(?:(?!\b(?:import|export|from)\b)[\w$,{}*\s])*?`;

const STATEMENTS = [
  new RegExp(String.raw`\b(?:import|export)\b\s*${BINDINGS}\bfrom\s*${MAIN_ENTRY}`, 'g'),
  new RegExp(String.raw`\bimport\b\s*${MAIN_ENTRY}`, 'g'),                    // side-effect import
  new RegExp(String.raw`\bimport\s*\(\s*${MAIN_ENTRY}\s*\)`, 'g'),            // dynamic import()
  new RegExp(String.raw`\brequire\s*\(\s*${MAIN_ENTRY}\s*\)`, 'g'),
];

/**
 * Erased before the code runs, so it is safe from anywhere: `import type X`, `import type {`,
 * `import type *`, `export type {`, `export type *`. The token after `type` is part of the
 * test because a default binding that merely happens to be NAMED `type` (`import type from`,
 * `import type, { X } from`) is a runtime import and must not pass on the word alone. The
 * statement is whitespace-flattened before this runs, so one space is every gap.
 */
const TYPE_ONLY = /^(?:import|export) type(?: [\w$]+ from |\s?[{*])/;

/**
 * Every statement in `source` that pulls a RUNTIME value out of the SDK's main entry, each
 * flattened to one line for reporting. Empty when the file is clean.
 */
export function runtimeMainEntryImports(source: string): string[] {
  const code = withoutComments(source);
  const offending: string[] = [];
  for (const re of STATEMENTS) {
    for (const match of code.matchAll(re)) {
      const statement = match[0].replace(/\s+/g, ' ').trim();
      if (!TYPE_ONLY.test(statement)) offending.push(statement);
    }
  }
  return offending;
}
