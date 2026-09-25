#!/usr/bin/env bash
# Is the one vendored Arcade SDK intact, current, and cut from the commit it claims?
#
# This gate exists because of a real incident. An external builder's first game
# shipped against a vendored SDK that was fifteen commits stale; the bundle booted,
# uploaded and registered cleanly, and then asked the player for MetaMask on a chain
# that does not exist. Nothing in the build told anyone the SDK was old, because
# nothing was looking. This looks.
#
#   scripts/sdk-freshness.sh            report anything wrong; PASS unless the bytes are bad
#   scripts/sdk-freshness.sh --strict   FAIL on a DISPROVED check (what CI and the ladder use)
#
# Four checks need nothing but this clone and are fatal in both modes, because each
# one means the SDK actually in node_modules is not the SDK this repo ships:
#   1. exactly one vendor/xayaarcade-sdk-*.tgz, matching its .sha256 sidecar
#   2. package.json depends on that exact file
#   3. the installed @xayaarcade/sdk is the vendored version, not something npm cached
#   4. vendor/PLATFORM-COMMIT holds one full commit id
#
# Two more need an authoritative source, preferred in this order:
#   1. $ARCADE_PLATFORM/sdk/package.json      (an explicit checkout)
#   2. ../arcade-platform/sdk/package.json    (a checkout beside this one - vendor-sdk.sh's default)
#   3. the highest sdk-v* tag on the platform's git remote (network, no clone needed)
#   5. the vendored version is the current one
#   6. PLATFORM-COMMIT is the commit the release tag sdk-v<version> names.
#
# Check 6 compares against the TAG, never against the source checkout's HEAD. A
# release is a tag; the branch it was cut from keeps moving, so a HEAD comparison
# marks every correctly pinned game stale the moment anyone lands the next commit.
#
# If no source is reachable - offline, or a CI runner with no read access to the
# platform repo - it says so and exits 0 in both modes, so a builder can still run
# their ladder. It never silently passes: it always prints the version this repo
# carries, so "which SDK am I on?" is answerable from any build log.
set -euo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

STRICT=0
[ "${1:-}" = "--strict" ] && STRICT=1

say()  { printf '\033[36m[sdk-freshness]\033[0m %s\n' "$*"; }
warn() { printf '\033[33m[sdk-freshness] %s\033[0m\n' "$*"; }
bad()  { printf '\033[31m[sdk-freshness] %s\033[0m\n' "$*" >&2; }
# A DISPROVED check: red and fatal under --strict, a warning otherwise.
hard() { if [ "$STRICT" -eq 1 ]; then bad "$*"; exit 1; fi; warn "$*"; exit 0; }

shopt -s nullglob
TGZS=(vendor/xayaarcade-sdk-*.tgz)
[ "${#TGZS[@]}" -eq 1 ] || { bad "expected exactly one vendor/xayaarcade-sdk-*.tgz, found ${#TGZS[@]}"; exit 1; }
TGZ="${TGZS[0]}"
HAVE="$(basename "$TGZ" .tgz | sed 's/^xayaarcade-sdk-//')"

SIDECAR="${TGZ}.sha256"
[ -f "$SIDECAR" ] || { bad "missing $SIDECAR"; exit 1; }
SIDE_TEXT="$(tr -d '\r\n' < "$SIDECAR")"
# SDK sidecars historically use either a bare hash or sha256sum's `hash  filename` form.
# Normalise both, but reject an unexpected filename or extra fields.
read -r -a SIDE_PARTS <<< "$SIDE_TEXT"
[ "${#SIDE_PARTS[@]}" -ge 1 ] && [ "${#SIDE_PARTS[@]}" -le 2 ] \
  || { bad "$SIDECAR must contain a hash and optional filename"; exit 1; }
WANT_SHA="${SIDE_PARTS[0]}"
if [ "${#SIDE_PARTS[@]}" -eq 2 ]; then
  SIDE_NAME="${SIDE_PARTS[1]#\*}"
  [ "$SIDE_NAME" = "$(basename "$TGZ")" ] \
    || { bad "$SIDECAR names '$SIDE_NAME', expected '$(basename "$TGZ")'"; exit 1; }
fi
GOT_SHA="$(sha256sum "$TGZ" | cut -d' ' -f1)"
[[ "$WANT_SHA" =~ ^[0-9a-f]{64}$ ]] || { bad "$SIDECAR does not begin with one lowercase SHA-256"; exit 1; }
[ "$GOT_SHA" = "$WANT_SHA" ] || { bad "$TGZ does not match its SHA sidecar"; exit 1; }

# The dependency must point at the tarball on disk. A package.json pinning a version
# whose file is absent (or a stale one beside a newer one) installs whatever npm has
# cached, which is the silent-wrong-bytes failure this gate exists to stop.
EXPECTED_DEP="file:vendor/$(basename "$TGZ")"
DECLARED="$(node -p "require('./package.json').dependencies['@xayaarcade/sdk'] || ''" 2>/dev/null || true)"
[ "$DECLARED" = "$EXPECTED_DEP" ] || { bad "package.json wants '$DECLARED', expected '$EXPECTED_DEP' - re-run scripts/vendor-sdk.sh"; exit 1; }
INSTALLED="$(node -p "require('./node_modules/@xayaarcade/sdk/package.json').version" 2>/dev/null || true)"
[ "$INSTALLED" = "$HAVE" ] || { bad "installed SDK '$INSTALLED' does not match vendored SDK '$HAVE' - re-run npm ci"; exit 1; }

PIN="$(tr -d '[:space:]' < vendor/PLATFORM-COMMIT 2>/dev/null || true)"
[[ "$PIN" =~ ^[0-9a-f]{40}$ ]] || { bad "vendor/PLATFORM-COMMIT is missing or malformed"; exit 1; }
SHORT_PIN="${PIN:0:7}"

verOf() { node -p "require('$1').version" 2>/dev/null || true; }
REMOTE="${ARCADE_PLATFORM_REMOTE:-https://github.com/xaya/arcade-platform}"
git_remote() {
  if [ -n "${GITHUB_TOKEN:-}" ]; then
    local auth
    auth="$(printf 'x-access-token:%s' "$GITHUB_TOKEN" | base64 | tr -d '\n')"
    git -c "http.https://github.com/.extraheader=AUTHORIZATION: basic $auth" "$@"
  else
    git "$@"
  fi
}

PLATFORM=""; SRC=""; WANT=""; TAG_COMMIT=""; TAG_SRC=""
if [ -n "${ARCADE_PLATFORM:-}" ] && [ -f "$ARCADE_PLATFORM/sdk/package.json" ]; then
  PLATFORM="$ARCADE_PLATFORM"; SRC="\$ARCADE_PLATFORM"
elif [ -f "../arcade-platform/sdk/package.json" ]; then
  PLATFORM="$PWD/../arcade-platform"; SRC="../arcade-platform"
fi

if [ -n "$PLATFORM" ]; then
  WANT="$(verOf "$PLATFORM/sdk/package.json")"
else
  # `sort -V` over the tag names: the highest sdk-v* tag IS the current release,
  # and the same listing already carries the commit each tag names.
  REFS="$(git_remote ls-remote --tags --refs "$REMOTE" 'refs/tags/sdk-v*' 2>/dev/null || true)"
  WANT="$(printf '%s\n' "$REFS" | sed -n 's#.*refs/tags/sdk-v##p' | sort -V | tail -1)"
  TAG_COMMIT="$(printf '%s\n' "$REFS" | awk -v t="refs/tags/sdk-v$WANT" '$2 == t { print $1 }')"
  SRC="$REMOTE tags"; TAG_SRC="the sdk-v$WANT tag on $REMOTE"
fi

if [ -z "$WANT" ]; then
  warn "vendored SDK $HAVE is intact (sidecar, dependency and install all match), but freshness is UNVERIFIED: no platform checkout and no release tags were reachable"
  exit 0
fi

if [ "$HAVE" != "$WANT" ]; then
  NEWEST="$(printf '%s\n%s\n' "$HAVE" "$WANT" | sort -V | tail -1)"
  if [ "$NEWEST" = "$HAVE" ]; then
    say "vendored SDK $HAVE is AHEAD of $SRC ($WANT) - an unreleased SDK, so no release tag exists to check PLATFORM-COMMIT $SHORT_PIN against"
    exit 0
  fi
  MSG="vendored SDK $HAVE is BEHIND $WANT (per $SRC). Run scripts/vendor-sdk.sh, then re-run the ladder."
  if [ "$STRICT" -eq 1 ]; then
    bad "$MSG"
    bad "See $REMOTE/blob/master/sdk/README.md for what changed."
    exit 1
  fi
  warn "$MSG"
  exit 0
fi

if [ -z "$TAG_COMMIT" ] && [ -n "$PLATFORM" ]; then
  TAG_COMMIT="$(git -C "$PLATFORM" rev-parse -q --verify "refs/tags/sdk-v$WANT^{commit}" 2>/dev/null || true)"
  if [ -n "$TAG_COMMIT" ]; then TAG_SRC="the sdk-v$WANT tag in $SRC"; fi
fi
if [ -z "$TAG_COMMIT" ]; then
  TAG_COMMIT="$(git_remote ls-remote --tags --refs "$REMOTE" "refs/tags/sdk-v$WANT" 2>/dev/null | awk 'NR == 1 { print $1 }' || true)"
  if [ -n "$TAG_COMMIT" ]; then TAG_SRC="the sdk-v$WANT tag on $REMOTE"; fi
fi

if [ -n "$TAG_COMMIT" ]; then
  [ "$PIN" = "$TAG_COMMIT" ] \
    || hard "PLATFORM-COMMIT $SHORT_PIN is not the commit SDK $WANT was released from (${TAG_COMMIT:0:7}, per $TAG_SRC) - re-run scripts/vendor-sdk.sh"
  say "vendored SDK $HAVE is current (per $SRC); tarball matches its sidecar and its install, and PLATFORM-COMMIT $SHORT_PIN is $TAG_SRC"
  exit 0
fi

# No release tag anywhere. The only commit left to compare against is the source
# checkout's HEAD, which moves on after a release - so a mismatch here is not
# evidence of a bad pin. Say what could not be proved, and pass.
HEAD_COMMIT="$(git -C "$PLATFORM" rev-parse HEAD 2>/dev/null || true)"
if [ "$PIN" = "$HEAD_COMMIT" ]; then
  say "vendored SDK $HAVE is current (per $SRC); PLATFORM-COMMIT $SHORT_PIN is that checkout's HEAD (no sdk-v$WANT tag was reachable to check it against)"
  exit 0
fi
warn "vendored SDK $HAVE is current (per $SRC), but its provenance is UNPROVED: no sdk-v$WANT tag was reachable, and the checkout's HEAD (${HEAD_COMMIT:0:7}) has moved past the pin $SHORT_PIN"
exit 0
