#!/usr/bin/env bash
# Verify the rules blob. This is what backs the README's promise that you do not have to
# trust us: you can rebuild the bytes and get the same hash.
#
#   check-blob.sh              structural gate (fast, no docker)
#   check-blob.sh --strict     + treat exports outside the known set as a FAILURE
#   check-blob.sh --rebuild    + rebuild from a CLEAN tree in the pinned container and
#                                assert the bytes hash to the committed value
#
# The structural gate asserts:
#   1. zero imports                   -- the consensus rule
#   2. the CONSENSUS export set       -- see ON STRICTNESS below
#   3. no .debug_* sections           -- the strip policy actually held
#   4. the toolchain fingerprint      -- `producers` / `target_features` are the expected
#                                        literals, so a blob built with the wrong compiler
#                                        is loud, not silent
#   5. the sha256 matches the sidecar
#
# ON STRICTNESS. Exports come in three tiers and this gate treats them differently, because
# conflating them rejects blobs the chain accepts:
#
#   CONSENSUS   the 12 arcade_* functions + `_initialize` + the `memory` export. The
#               authority is `kRequiredFuncs` in the host's judge
#               (arcade-platform/engine/judge/wasm_judge.cpp); a blob missing
#               any of these is rejected by the host, so missing one FAILS here.
#   ABI-OPTIONAL  arcade_share_weights, arcade_ejected_mask. arcade-platform/docs/ARCADE-ABI.md: "a blob
#               that omits one is fully valid; the host detects the absent export and falls
#               back." Absence is therefore a NOTE naming the fallback you get, never a
#               failure. This gate used to FAIL on them, which meant a game that legitimately
#               did not want share weights could not pass its own gate without editing it.
#   HOUSE       arcade_scripted_move -- not in the ABI at all: a non-consensus helper a game's
#               own tooling may call. Nothing in this repo's ladder invokes it (the trace legs
#               replay recorded moves), so absent is a NOTE and nothing more.
#
# Anything else is EXPORT BLOAT. The chain says extra exports are harmless, so by default
# this gate reports them and passes; `--strict` (what this repo's CI passes) makes them
# fatal. That split is the point: the same file can be copied into any game repo unedited
# and still enforce the consensus rule exactly.
set -euo pipefail
cd "$(cd "$(dirname "$0")/.." && pwd)"

WASM="blob/rules.wasm"        # FROZEN: the basename is part of the hashed bytes.
SHAFILE="blob/rules.wasm.sha256"
REBUILD=0
STRICT=0
for a in "$@"; do
  case "$a" in
    --rebuild) REBUILD=1 ;;
    --strict)  STRICT=1 ;;
    *) echo "unknown flag: $a (want --rebuild and/or --strict)"; exit 2 ;;
  esac
done

test -s "$WASM"    || { echo "FAIL: $WASM missing or empty -- build it with blob/build-blob.sh"; exit 1; }
test -s "$SHAFILE" || { echo "FAIL: $SHAFILE missing"; exit 1; }

# ---- 5. the committed bytes match the committed sidecar ---------------------
echo "$(cat "$SHAFILE")  $WASM" | sha256sum -c --quiet - \
  || { echo "FAIL: $WASM does not match $SHAFILE"; exit 1; }

# ---- 1..4. structure, in a stdlib-only wasm section parser (no wasm2wat, no runtime
#            dependency: the gate must run anywhere) ---------------------------
python3 - "$WASM" "$STRICT" <<'PY'
import sys
data = open(sys.argv[1], "rb").read()
STRICT = sys.argv[2] == "1"
assert data[:4] == b"\x00asm", "not a wasm module"

def uleb(b, p):
    r = s = 0
    while True:
        x = b[p]; p += 1
        r |= (x & 0x7f) << s
        if not (x & 0x80): return r, p
        s += 7

pos = 8
imports, exports, customs = [], [], {}
while pos < len(data):
    sid = data[pos]; pos += 1
    size, pos = uleb(data, pos)
    end = pos + size
    p = pos
    if sid == 0:                                   # custom
        n, p = uleb(data, p)
        customs[data[p:p+n].decode()] = data[p+n:end]
    elif sid == 2:                                 # import
        n, p = uleb(data, p)
        for _ in range(n):
            ml, p = uleb(data, p); mod = data[p:p+ml]; p += ml
            fl, p = uleb(data, p); fld = data[p:p+fl]; p += fl
            imports.append(f"{mod.decode()}::{fld.decode()}")
            break                                  # one is already fatal
    elif sid == 7:                                 # export
        n, p = uleb(data, p)
        for _ in range(n):
            nl, p = uleb(data, p); exports.append(data[p:p+nl].decode()); p += nl
            p += 1                                 # kind
            _, p = uleb(data, p)                   # index
    pos = end

ok = True

# 1. zero imports
if imports:
    print("FAIL: the blob has imports:", imports); ok = False

# 2. the export set, in three tiers -- see ON STRICTNESS in the header.
#    The authority for CONSENSUS is the host judge's kRequiredFuncs
#    (arcade-platform/engine/judge/wasm_judge.cpp) plus the `memory` export it reads state
#    through; for ABI_OPTIONAL it is arcade-platform/docs/ARCADE-ABI.md.
CONSENSUS = {
    "memory", "_initialize",
    "arcade_alloc", "arcade_free", "arcade_parse_state", "arcade_release",
    "arcade_is_valid", "arcade_whose_turn", "arcade_turn_count",
    "arcade_is_finished", "arcade_winner", "arcade_apply_move",
    "arcade_initial_state", "arcade_resolve_timeout",
}
# Absent is VALID. The value is what the host silently does instead, so say it.
ABI_OPTIONAL = {
    "arcade_share_weights":
        "settlement falls back to plain winner/draw -- and a 2-seat dispute expiry closes "
        "winner-take-all to the survivor, so a 2-seat DRAW cannot be expressed at all",
    "arcade_ejected_mask":
        "proof verification keeps the all-participants signer rule, so a seat ejected by a "
        "dispute timeout still has to sign",
}
# Not in the ABI: a non-consensus helper a game's own tooling may call. No gate in this
# repo invokes it.
HOUSE = {"arcade_scripted_move": "optional; nothing in this repo's ladder calls it"}

got = set(exports)

missing = CONSENSUS - got
if missing:
    print("FAIL: missing CONSENSUS exports (the host will reject this blob):", sorted(missing))
    ok = False

for name, fallback in sorted(ABI_OPTIONAL.items()):
    if name not in got:
        print(f"NOTE: no {name} (valid -- ABI \u00a73 optional): {fallback}")
for name, consequence in sorted(HOUSE.items()):
    if name not in got:
        print(f"NOTE: no {name} (not an ABI export): {consequence}")

extra = got - CONSENSUS - set(ABI_OPTIONAL) - set(HOUSE)
if extra:
    if STRICT:
        print("FAIL: unexpected exports (--strict: no export bloat):", sorted(extra)); ok = False
    else:
        print("WARN: exports outside the known set (the chain permits these; --strict fails on them):",
              sorted(extra))

# 3. the strip policy held
debug = [k for k in customs if k.startswith(".debug")]
if debug:
    print("FAIL: debug sections survived the strip:", sorted(debug)); ok = False

# 4. the toolchain fingerprint
EXPECT_PRODUCER = b"clang_18.1.2-wasi-sdk"
EXPECT_FEATURES = {b"bulk-memory", b"mutable-globals", b"sign-ext"}
prod = customs.get("producers", b"")
if EXPECT_PRODUCER not in prod:
    print(f"FAIL: `producers` does not name the pinned toolchain ({EXPECT_PRODUCER.decode()}) --"
          " this blob was built with the wrong compiler"); ok = False
feat = customs.get("target_features", b"")
for f in EXPECT_FEATURES:
    if f not in feat:
        print(f"FAIL: target_features is missing {f.decode()}"); ok = False

if ok:
    named = sorted(got - CONSENSUS)
    print(f"OK: zero imports, {len(got)} exported names "
          f"({len(CONSENSUS)} consensus"
          + (f" + {', '.join(named)}" if named else "")
          + f"), no debug sections, toolchain fingerprint matches ({len(data)} bytes)")
sys.exit(0 if ok else 1)
PY

[ "$REBUILD" -eq 1 ] || exit 0

# ---- the rebuild-and-compare leg --------------------------------------------
# Rebuild from a CLEAN tree -- `git archive HEAD`, not the working tree -- so this also
# catches "it only builds because of an uncommitted file".
#
# LOUD preflight: that same choice makes uncommitted work invisible here. Say so up
# front, or a dirty tree turns into a "why doesn't my edit change the hash" mystery.
if [ -n "$(git status --porcelain)" ]; then
  echo "==============================================================================="
  echo "WARNING: your working tree is DIRTY and --rebuild archives HEAD."
  echo "The uncommitted changes below are IGNORED -- HEAD is what gets rebuilt:"
  git status --porcelain | sed 's/^/    /'
  echo "==============================================================================="
fi
echo "--- rebuilding from a clean tree ---"
COMMITTED="$(cat "$SHAFILE")"
SCRATCH="blob/.rebuild"
rm -rf "$SCRATCH"; mkdir -p "$SCRATCH/tree"
git archive HEAD | tar -x -C "$SCRATCH/tree"
( cd "$SCRATCH/tree" && ./blob/build-blob.sh --out-dir "out" >/dev/null )
REBUILT="$(sha256sum "$SCRATCH/tree/out/rules.wasm" | awk '{print $1}')"
rm -rf "$SCRATCH"

if [ "$REBUILT" != "$COMMITTED" ]; then
  echo "FAIL: a clean rebuild does not reproduce the committed blob"
  echo "  committed: $COMMITTED"
  echo "  rebuilt:   $REBUILT"
  exit 1
fi
echo "OK: a clean rebuild reproduces the committed sha256 ($COMMITTED)"
