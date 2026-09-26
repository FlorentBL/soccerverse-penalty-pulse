#!/usr/bin/env python3
"""Generate identical C++ and browser lookup tables from the pinned rating bytes."""
import base64
import hashlib
from pathlib import Path

root = Path(__file__).resolve().parents[1]
data = (root / 'data/player-shooting.bin').read_bytes()
if not data or any(value > 100 and value != 255 for value in data):
    raise SystemExit('invalid shooting rating table')
sha = hashlib.sha256(data).hexdigest()
(root / 'rules/pulse/player_shooting.inc').write_text(
    '// Generated from data/player-shooting.bin; SHA-256 ' + sha + '\n' +
    ''.join('  ' + ', '.join(str(v) for v in data[i:i + 32]) + ',\n'
            for i in range(0, len(data), 32))
)
encoded = base64.b64encode(data).decode('ascii')
chunks = [encoded[i:i + 4096] for i in range(0, len(encoded), 4096)]
(root / 'src/lib/pulse/shooting-data.ts').write_text(
    '// Generated from data/player-shooting.bin; SHA-256 ' + sha + '\n' +
    'const encoded = [\n' + ''.join("  '" + chunk + "',\n" for chunk in chunks) +
    "].join('');\n" +
    'const ratings = Uint8Array.from(atob(encoded), character => character.charCodeAt(0));\n' +
    'export function shootingRating(id: number): number | null {\n' +
    '  if (!Number.isInteger(id) || id < 1 || id >= ratings.length) return null;\n' +
    '  return ratings[id] === 255 ? null : ratings[id];\n' +
    '}\n'
)
print(f'generated shooting lookups for {len(data)} ID slots, SHA-256 {sha}')
