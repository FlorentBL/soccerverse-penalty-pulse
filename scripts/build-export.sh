#!/usr/bin/env bash
# Build the static-export flavour of this app.
#
# A static export has NO SERVER, so it has neither Next rewrites nor a running middleware:
#
#   * MIDDLEWARE: Next resolves it by file presence, and in principle it is unsupported under
#     `output: export`. MEASURED on this repo's Next version (16.2.10): the build TOLERATES
#     `src/middleware.ts` and silently drops it (no error, no rewrites/middleware in the
#     emitted routes manifest) rather than failing the build - so this script does NOT move
#     the file aside. If a future Next upgrade starts hard-failing on it instead, the fix is a
#     move-aside-and-restore around the `next build` call below; do not assume, measure again.
#
#   * SECURITY HEADERS: with no middleware running, the exported site serves NONE. In
#     particular it serves no `frame-ancestors` - WITHOUT WHICH THE ARCADE CANNOT FRAME THE
#     GAME AT ALL. So we emit the exact header set the middleware would have produced, in the
#     two formats a static host actually consumes, and the deployer MUST wire one of them up.
#
#   * ENDPOINTS: with no rewrites there is no same-origin /ws, /chain or /gsp proxy. Since SDK 0.3.2 an
#     ARCADE-HOSTED export reads its endpoints at serve time from /arcade-config.json (the games-host
#     serves it), so a build headed for the arcade - including the --bundle artifact below - needs no
#     baked absolute URLs at all. The warnings this script prints below still matter, but only for a
#     BUILDER-HOSTED static deployment (this export served on its own, outside the arcade shell, with no
#     runtime config endpoint to read): that shape MUST be built with ABSOLUTE endpoints:
#         NEXT_PUBLIC_GSP_URL=https://…      (else getGspUrl() returns '/gsp')
#         NEXT_PUBLIC_RELAY_URL=wss://…      (else it derives ${host}/ws)
#         NEXT_PUBLIC_POLYGON_RPC=https://…  (a leading '/' resolves against the page)
#     Set them BEFORE this script, not after the build: the header files it emits below take
#     their connect-src origins from these same variables, so a cross-origin GSP or relay named
#     here is allowed by the emitted CSP, and one named later is not (connect-src allows
#     origins, never bare schemes). A host that serves its own CSP instead of ours must widen
#     that one to match.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

for v in NEXT_PUBLIC_GSP_URL NEXT_PUBLIC_RELAY_URL NEXT_PUBLIC_POLYGON_RPC; do
  val="${!v:-}"
  case "$val" in
    http*|ws*) ;;
    *) echo "WARNING: $v is not an absolute URL ('${val}'). A static export has no proxy" >&2
       echo "         to resolve a relative endpoint against. See this script's header." >&2 ;;
  esac
done

# An arcade-hosted bundle MUST be compiled with the arcade's shared move namespace
# (NEXT_PUBLIC_GAME_ID). Without it, MOVE_NS silently falls back to this game's own
# GAME_KEY and the SDK's runtime config gate refuses to boot the game inside the
# arcade (served gameId != compiled namespace) - a bundle that uploads fine and then
# cannot start. Fail before the build, where the mistake is cheap.
if [ "${1:-}" = "--bundle" ] && [ -z "${NEXT_PUBLIC_GAME_ID:-}" ]; then
  echo "ERROR: --bundle requires NEXT_PUBLIC_GAME_ID=<the arcade's move namespace>" >&2
  echo "       (it is the shared g/ namespace every game on that arcade posts under," >&2
  echo "       NOT this game's own key - ask the arcade you are submitting to)." >&2
  exit 1
fi

# PATH-BASED SERVING. A --bundle build bakes a FIXED placeholder base path into every
# root-absolute reference (Next's basePath); the platform rewrites /__arcade_base__ to
# /g/<slug> at registration, so the builder never sees or chooses their path. The token is
# a constant for every bundle build, so bundle reproducibility is preserved. Refuse a
# caller-supplied override: a slug baked at build time would silently produce a bundle that
# only serves under one path - fail before the build, where the mistake is cheap.
if [ "${1:-}" = "--bundle" ]; then
  if [ -n "${NEXT_PUBLIC_BASE_PATH:-}" ] && [ "${NEXT_PUBLIC_BASE_PATH}" != "/__arcade_base__" ]; then
    echo "ERROR: --bundle bakes NEXT_PUBLIC_BASE_PATH=/__arcade_base__ (the platform rewrites" >&2
    echo "       it to /g/<slug> at registration); do not pre-set it to '${NEXT_PUBLIC_BASE_PATH}'." >&2
    exit 1
  fi
  export NEXT_PUBLIC_BASE_PATH=/__arcade_base__
fi

NEXT_OUTPUT=export npx next build

# Emit the headers the middleware would have set, for the static host to serve.
node --input-type=module -e "
import { buildSecurityHeaders } from '@xayaarcade/sdk';
import { writeFileSync } from 'node:fs';
const h = buildSecurityHeaders(process.env.FRAME_ANCESTORS);
const entries = Object.entries(h);
writeFileSync('out/_headers', '/*\n' + entries.map(([k,v]) => '  ' + k + ': ' + v).join('\n') + '\n');
writeFileSync('out/nginx-headers.conf',
  entries.map(([k,v]) => 'add_header ' + k + ' \"' + v.replace(/\"/g,'\\\\\"') + '\" always;').join('\n') + '\n');
console.log('wrote out/_headers and out/nginx-headers.conf (' + entries.length + ' headers)');
// A frame-ancestors rule is ALWAYS emitted, so its presence proves nothing; what
// matters is whether it names an embedder. Unset FRAME_ANCESTORS yields 'none',
// which is a complete refusal to be framed.
const fa = /frame-ancestors ([^;]+)/.exec(h['Content-Security-Policy'] || '');
if (!fa || fa[1].trim() === \"'none'\") {
  console.warn('WARNING: no embedder is named (frame-ancestors ' + (fa ? fa[1].trim() : 'absent') + ')');
  console.warn('         - set FRAME_ANCESTORS=<arcade origin> or the Arcade will NOT be able to');
  console.warn('         embed this build at all.');
}
"
echo
echo "static export in out/ - serve it WITH out/_headers (or out/nginx-headers.conf)."

# --bundle: additionally pack out/ into a deterministic, content-addressed artifact a
# builder hands to an arcade operator (or uploads, once self-serve exists). The packer
# pins every tar header field, file permissions included, so the sha256 depends on the
# export's bytes alone (scripts/pack-bundle.sh).
if [ "${1:-}" = "--bundle" ]; then
  bash scripts/pack-bundle.sh out dist/bundle.tar.gz
  echo "bundle: dist/bundle.tar.gz ($(wc -c < dist/bundle.tar.gz | tr -d ' ') bytes)"
  echo "sha256: $(cat dist/bundle.tar.gz.sha256)"
fi
