#!/usr/bin/env bash
# Vendor the agent skills from their canonical home into .claude/skills/.
#
# Modelled 1:1 on vendor-sdk.sh next door, including its refusal to
# copy from a dirty checkout - a recorded commit that does not describe the bytes
# on disk is worse than no record at all.
#
# ONE ADDITION over vendor-sdk.sh, and it is load-bearing: this also refuses an
# UNPUSHED HEAD. SKILLS-COMMIT records a local sha, and an unpushed commit makes
# the recorded provenance unresolvable to anybody else - including CI and
# including the operator six months from now. vendor-sdk.sh's dirty-only check is
# strictly weaker; the analogous failure has simply not bitten yet.
#
# WHY .claude/skills/ HERE: this is the pinned consumer. Every fork of this
# template carries the skills with it, so an agent opening a fresh clone has them
# with no network round trip and no install step - which is exactly why the skills
# themselves tell a builder with a template fork NOT to also install the plugin.
set -euo pipefail
cd "$(dirname "$0")/.."

SRC="${ARCADE_SKILLS:-$HOME/arcade-skills}"
DEST=".claude/skills"

say() { printf '\033[36m[vendor-skills]\033[0m %s\n' "$*"; }
die() { printf '\033[31m[vendor-skills] %s\033[0m\n' "$*" >&2; exit 1; }

[ -d "$SRC/.git" ] || die "ARCADE_SKILLS=$SRC is not a git checkout"
[ -d "$SRC/skills" ] || die "$SRC has no skills/ directory"

git -C "$SRC" diff --quiet && git -C "$SRC" diff --cached --quiet \
  || die "$SRC has uncommitted changes - commit them first, or SKILLS-COMMIT will name bytes that do not exist"

git -C "$SRC" fetch --quiet || die "could not fetch $SRC's upstream"
git -C "$SRC" merge-base --is-ancestor HEAD '@{u}' \
  || die "$SRC HEAD is not pushed - push first, or the recorded commit resolves for nobody but you"

# A secret copied in here is copied into every fork of this template, and a fork
# is a clone somebody else keeps - there is no later commit that un-publishes it.
# The corpus ships the scanner that decides what counts, so run THAT rather than
# restating its patterns here: one list to keep current, and it is the list the
# corpus is already gated on.
node "$SRC/scripts/check-secrets.mjs" \
  || die "$SRC carries a secret, a token or an absolute home path - fix it at the source, then re-run"

COMMIT="$(git -C "$SRC" rev-parse HEAD)"

rm -rf "$DEST"
mkdir -p "$DEST"
rsync -a --delete --exclude '.git' --exclude '.claude-plugin' "$SRC/skills/" "$DEST/"

printf '%s\n' "$COMMIT" > "$DEST/SKILLS-COMMIT"
# Paths relative to DEST so `cd $DEST && sha256sum -c SKILLS-SHA256` just works.
( cd "$DEST" && find . -type f ! -name SKILLS-SHA256 ! -name SKILLS-COMMIT -print0 \
    | sort -z | xargs -0 sha256sum > SKILLS-SHA256 )

say "vendored $(find "$DEST" -type f ! -name 'SKILLS-*' | wc -l) files from $SRC @ ${COMMIT:0:12}"
