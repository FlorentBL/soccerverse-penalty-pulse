#!/usr/bin/env bash
# Use the locally installed, pinned macOS build tools without changing the
# machine's default Node or BSD tar used by other projects.
set -euo pipefail
NODE_BIN="${XAYA_NODE_BIN:-$HOME/.local/opt/node-v22.23.3/bin}"
TAR_BIN="${XAYA_TAR_BIN:-$HOME/.local/opt/gnu-tar-1.35/bin}"
if [ ! -x "$NODE_BIN/node" ] || [ ! -x "$TAR_BIN/tar" ]; then
  echo "XAYA toolchain missing: expected Node 22 in $NODE_BIN and GNU tar in $TAR_BIN" >&2
  exit 1
fi
export PATH="$TAR_BIN:$NODE_BIN:$PATH"
exec "$@"
