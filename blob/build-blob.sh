#!/usr/bin/env bash
# Build the rules blob: a freestanding, zero-import wasm reactor exposing the arcade_*
# ABI. Runs IN a container whose toolchain is pinned by version and sha256
# (blob/Dockerfile.blob-builder), so the bytes are reproducible by anyone.
#
# THREE things here decide the output hash. Do not change any of them casually:
#
#   1. the source list, IN THIS ORDER -- link input order fixes the code layout.
#   2. the strip: `strip-blob`, a single fixed command baked into the builder image
#      (llvm-strip --strip-debug, a POST-LINK pass). NOT -Wl,--strip-debug: the linker
#      flag yields a different `name` section and therefore different bytes. Stripping is
#      not cosmetic -- wasi-sdk's prebuilt sysroot ships DWARF, which was 58.5% of the
#      unstripped artifact, and every byte of it is paid for on chain.
#   3. the output BASENAME. The linker records it in the wasm `name` custom section, so
#      `-o rules.wasm` and `-o foo.wasm` hash differently. It is pinned, and check-blob.sh
#      asserts the file it checks is that name.
#
# No -Wl flags beyond what is here: an undefined symbol is already a hard link error, and
# that IS the zero-import discipline.
set -euo pipefail
cd "$(cd "$(dirname "$0")/.." && pwd)"

OUT_DIR="blob"
OUT_NAME="rules.wasm"          # PART OF THE HASH -- see (3) above. Never rename.
while [ $# -gt 0 ]; do
  case "$1" in
    --out-dir) OUT_DIR="$2"; shift 2 ;;
    *) echo "usage: $0 [--out-dir DIR]" >&2; exit 2 ;;
  esac
done

export BUILDX_NO_DEFAULT_ATTESTATIONS=1
docker image inspect pulse-blob-builder:local >/dev/null 2>&1 || \
  docker build --platform linux/amd64 -f blob/Dockerfile.blob-builder -t pulse-blob-builder:local blob

mkdir -p "$OUT_DIR"
docker run --rm --platform linux/amd64 -u "$(id -u):$(id -g)" -e HOME=/tmp \
  -v "$PWD":/src -w /src pulse-blob-builder:local bash -euc "
    \$WASI_SDK/bin/clang++ -O2 -std=c++17 -fno-exceptions -fno-rtti \
      -mexec-model=reactor \
      -I rules \
      rules/arcade_abi.cpp \
      rules/pulse/game.cpp \
      rules/pulse/sha.cpp \
      -o '$OUT_DIR/$OUT_NAME'
    strip-blob '$OUT_DIR/$OUT_NAME'
  "

sha256sum "$OUT_DIR/$OUT_NAME" | awk '{print $1}' > "$OUT_DIR/$OUT_NAME.sha256"
echo "built $OUT_DIR/$OUT_NAME  $(wc -c < "$OUT_DIR/$OUT_NAME" | tr -d ' ') bytes  sha256=$(cat "$OUT_DIR/$OUT_NAME.sha256")"
