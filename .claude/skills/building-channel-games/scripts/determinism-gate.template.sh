#!/bin/bash
# TEMPLATE - copy into your game repo and adapt. No secrets/paths baked in.
#
# Determinism gate: proves your pure game-sim engine is BIT-IDENTICAL when
# compiled native (host g++) vs WASM (emscripten), over N ticks of one or more
# golden-vector scenarios. This is what makes a channel game's off-chain state
# trustworthy - every client (native GSP, browser WASM) must derive the exact
# same state from the exact same ordered moves, byte for byte.
#
# Needs ONLY emscripten if your pure sim has zero external deps (protobuf,
# libxayagame, etc. live in a separate adapter layer, gated separately - see
# WASM.md §B "The standalone full-channel WASM build", which reuses these same
# sources).
#
# Usage:  ./determinism-gate.template.sh [TICKS]   (default 5000)
# Env:    EMSDK_ENV  path to emsdk_env.sh (default $HOME/emsdk/emsdk_env.sh)
set -e

TICKS="${1:-5000}"
R="$(cd "$(dirname "$0")/.." && pwd)"          # adapt: your engine root
EMSDK_ENV="${EMSDK_ENV:-$HOME/emsdk/emsdk_env.sh}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# List every source file the pure sim + your golden-vector test binary need.
# Keep this list identical between the native and WASM builds below - any
# divergence in sources compiled defeats the whole point of the gate.
ENGINE_SRC=(
  "$R/<path/to/state.cpp>"
  "$R/<path/to/update.cpp>"
  "$R/<path/to/state_hash.cpp>"
  "$R/<path/to/golden_test.cpp>"
)

echo "=== native build (g++, via CMake) ==="
cmake -S "$R" -B "$R/build-determinism" -DCMAKE_BUILD_TYPE=Release >/dev/null
cmake --build "$R/build-determinism" --target <your_test_target> -j"$(nproc)" >/dev/null

echo "=== wasm build (emscripten, no external sysroots) ==="
# shellcheck disable=SC1090
source "$EMSDK_ENV" >/dev/null 2>&1
emcc -O2 -std=c++17 -I"$R" "${ENGINE_SRC[@]}" \
  -o "$WORK/golden.js" -sENVIRONMENT=node -sEXIT_RUNTIME=1 >/dev/null 2>&1

# compare LABEL ARGS...: run native + WASM golden test with ARGS, filter to
# deterministic tick-output lines, sha256-hash each stream, diff.
compare() {
  local label="$1"; shift
  "$R/build-determinism/<your_test_target>" "$@" | grep '^tick:' > "$WORK/native.txt"
  node "$WORK/golden.js" "$@"                    | grep '^tick:' > "$WORK/wasm.txt"
  local NHASH WHASH
  NHASH="$(sha256sum < "$WORK/native.txt" | cut -d' ' -f1)"
  WHASH="$(sha256sum < "$WORK/wasm.txt"   | cut -d' ' -f1)"
  echo "--- $label ---"
  echo "native sha256: $NHASH"
  echo "wasm   sha256: $WHASH"
  if [ "$NHASH" = "$WHASH" ]; then
    echo "PASS: native == WASM ($label)"
    return 0
  fi
  echo "FAIL: divergence ($label)"
  diff "$WORK/native.txt" "$WORK/wasm.txt" | head -20
  return 1
}

ok=0
compare "$TICKS-tick golden vector"          --ticks "$TICKS"      || ok=1
# Add one scenario per edge case your engine must handle deterministically,
# e.g. a forced-collapse / stalemate / must-terminate path:
# compare "edge-case scenario"                --ticks 9000 --flag  || ok=1

if [ "$ok" -eq 0 ]; then
  echo "PASS: determinism gate green (native == WASM on all vectors)"
  exit 0
else
  echo "FAIL: determinism gate"
  exit 1
fi
