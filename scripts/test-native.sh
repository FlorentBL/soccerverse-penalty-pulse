#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
cxx="${CXX:-c++}"
"$cxx" -std=c++17 -O2 -Wall -Wextra -pedantic -I rules \
  rules/pulse/game.cpp rules/pulse/sha.cpp tests/native/core_test.cpp -o "$work/core-test"
"$work/core-test"
"$cxx" -std=c++17 -O2 -Wall -Wextra -pedantic -I rules \
  rules/pulse/game.cpp rules/pulse/sha.cpp tests/native/trace.cpp -o "$work/trace"
"$work/trace" > "$work/native-trace.txt"
diff -u tests/fixtures/native-trace.txt "$work/native-trace.txt"
echo 'native trace: pass'
