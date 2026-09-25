#!/usr/bin/env bash
# Re-cut the vendored @xayaarcade/sdk tarball from a platform checkout.
#
#   scripts/vendor-sdk.sh                                   # ../arcade-platform
#   ARCADE_PLATFORM=/path/to/arcade-platform scripts/vendor-sdk.sh
#
# The private phase has no npm registry, so the SDK ships as a committed tarball under
# vendor/ and this repo depends on it by `file:` path. Three invariants this script exists
# to enforce:
#
#  1. THE VERSION MUST CHANGE whenever the SDK's contents change. npm keys its cache and
#     the lockfile's integrity by name+version: re-packing the SAME version with different
#     bytes installs the OLD bytes from a warm cache (silently!) and hard-fails EINTEGRITY
#     on a cold one. This script REFUSES to overwrite an existing tarball of the same
#     version with different bytes.
#  2. THE TARBALL MUST BE BUILT, not just packed. `npm pack` does not run a build unless
#     the package has a `prepack` script; the platform has one.
#  3. THE PLATFORM COMMIT MUST BE RECORDED, so anyone can reproduce this tarball.
#  4. THE CHECKOUT IT PICKED MUST BE VISIBLE, and it must not be silently behind its
#     remote. A DEFAULT is not a guarantee: on a machine that also carries an older clone
#     where the default points, this script will happily pack that clone's SDK instead.
#     That has happened, and it shipped a broken vendored SDK to an external builder --
#     whose game then fetched /arcade-config.json from the site root, got HTML, and asked
#     for MetaMask on a chain that does not exist. So the banner below always names the
#     resolved path, the version, the branch and the commit, and the script REFUSES a
#     checkout that is behind its upstream unless you say otherwise.
#
#     The default itself now prefers the platform checkout SITTING BESIDE THIS REPO
#     (../arcade-platform) over $HOME/arcade-platform, because a sibling travels with the
#     clone and a $HOME path is whatever that machine happened to leave there. Clone both
#     repos into one directory and this is simply correct; set ARCADE_PLATFORM to override.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# Sibling first (travels with the clone), then $HOME (whatever this machine left there).
if [ -n "${ARCADE_PLATFORM:-}" ]; then PLATFORM="$ARCADE_PLATFORM"
elif [ -d "$REPO/../arcade-platform/sdk" ]; then PLATFORM="$REPO/../arcade-platform"
else PLATFORM="$HOME/arcade-platform"; fi
VENDOR="$REPO/vendor"

[ -d "$PLATFORM/sdk" ] || { echo "no SDK at $PLATFORM/sdk (set ARCADE_PLATFORM)"; exit 1; }
PLATFORM="$(cd "$PLATFORM" && pwd)"   # resolve ~, symlinks and relative paths for the banner

VERSION="$(node -p "require('$PLATFORM/sdk/package.json').version")"
COMMIT="$(git -C "$PLATFORM" rev-parse HEAD)"
BRANCH="$(git -C "$PLATFORM" rev-parse --abbrev-ref HEAD)"

# Is this checkout current? Fetch is best-effort (offline vendoring is legitimate), but a
# checkout we CANNOT prove is current must say so rather than look fine.
# NOTE on the `|| true`s below: this whole probe is best-effort and must never be able to
# kill the script, because the banner it feeds is the thing that makes a wrong checkout
# visible - a probe that aborts first would hide exactly what it exists to show.
# Two specific traps, both real here:
#  * `rev-parse @{u}` SUCCEEDS and prints the literal string "@{u}" when the branch has an
#    upstream configured whose remote branch is gone (a merged-and-deleted feature branch -
#    this repo's habit). A bare -n test then passes and every later git call fails.
#  * `rev-list HEAD..<ref>` exits non-zero for an unresolvable ref, which under `set -e`
#    would abort on the assignment.
# So: resolve the upstream to a real commit before trusting it, and guard the count.
UPSTREAM="$(git -C "$PLATFORM" rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null || true)"
git -C "$PLATFORM" rev-parse --verify --quiet "${UPSTREAM:-HEAD}^{commit}" >/dev/null 2>&1 || UPSTREAM=""
BEHIND=""; FRESHNESS="unknown - no upstream configured for $BRANCH"
if [ -n "$UPSTREAM" ]; then
  if git -C "$PLATFORM" fetch --quiet 2>/dev/null; then
    BEHIND="$(git -C "$PLATFORM" rev-list --count "HEAD..$UPSTREAM" 2>/dev/null || true)"
    if   [ -z "$BEHIND" ];   then FRESHNESS="unknown - could not compare against $UPSTREAM"
    elif [ "$BEHIND" = "0" ]; then FRESHNESS="up to date with $UPSTREAM"
    else FRESHNESS="$BEHIND commit(s) BEHIND $UPSTREAM"; fi
  else
    FRESHNESS="unknown - could not fetch $UPSTREAM (offline?)"
  fi
fi

echo
echo "==> SDK SOURCE   $PLATFORM"
echo "    sdk version  $VERSION"
echo "    branch       $BRANCH"
echo "    commit       ${COMMIT:0:12}"
echo "    freshness    $FRESHNESS"
echo "    (override with ARCADE_PLATFORM=/path/to/arcade-platform)"
echo

DIRTY="$(git -C "$PLATFORM" status --porcelain)"
[ -z "$DIRTY" ] || { echo "platform checkout is dirty; commit it first so PLATFORM-COMMIT is meaningful"; exit 1; }

if [ -n "$BEHIND" ] && [ "$BEHIND" != "0" ] && [ -z "${ALLOW_STALE_PLATFORM:-}" ]; then
  echo "REFUSING: that checkout is $BEHIND commit(s) behind $UPSTREAM."
  echo "  Packing an SDK from a stale checkout vendors code the platform no longer runs -"
  echo "  it installs cleanly, builds cleanly, and fails at runtime. If you keep more than"
  echo "  one arcade-platform clone, this is how the wrong one gets picked."
  echo "  Fix: git -C $PLATFORM pull   (or point ARCADE_PLATFORM at the current checkout)"
  echo "  Deliberately vendoring an older SDK? Re-run with ALLOW_STALE_PLATFORM=1."
  exit 1
fi

TGZ="xayaarcade-sdk-$VERSION.tgz"
mkdir -p "$VENDOR"

echo "==> building + packing @xayaarcade/sdk $VERSION from $PLATFORM @ ${COMMIT:0:8}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
( cd "$PLATFORM" && npm ci && npm pack -w @xayaarcade/sdk --pack-destination "$TMP" >/dev/null )

NEW_SHA="$(sha256sum "$TMP/$TGZ" | cut -d' ' -f1)"
if [ -f "$VENDOR/$TGZ" ]; then
  OLD_SHA="$(sha256sum "$VENDOR/$TGZ" | cut -d' ' -f1)"
  if [ "$OLD_SHA" != "$NEW_SHA" ]; then
    echo "REFUSING: $TGZ already vendored with different bytes."
    echo "  vendored: $OLD_SHA"
    echo "  rebuilt : $NEW_SHA"
    echo "Bump the SDK version in the platform repo and re-run. A same-version repack is"
    echo "silently stale on a warm npm cache and a hard EINTEGRITY failure on a cold one."
    exit 1
  fi
fi

# Drop any superseded tarball, then install the new one.
rm -f "$VENDOR"/xayaarcade-sdk-*.tgz "$VENDOR"/xayaarcade-sdk-*.tgz.sha256
cp "$TMP/$TGZ" "$VENDOR/$TGZ"
# The sidecar carries a BARE BASENAME, so `sha256sum -c` on it must run with cwd = vendor/.
( cd "$VENDOR" && sha256sum "$TGZ" > "$TGZ.sha256" )
printf '%s\n' "$COMMIT" > "$VENDOR/PLATFORM-COMMIT"

echo "==> repointing the dependency at file:vendor/$TGZ"
npm --prefix "$REPO" pkg set "dependencies.@xayaarcade/sdk=file:vendor/$TGZ"

echo "==> relocking"
( cd "$REPO" && rm -rf node_modules && npm install )

echo
echo "vendored $TGZ"
echo "  sha256          $NEW_SHA"
echo "  platform path   $PLATFORM"
echo "  platform branch $BRANCH"
echo "  platform commit $COMMIT"
