#!/usr/bin/env python3
"""Generate native and browser primary-position bitsets from the pinned bytes."""
import base64
import hashlib
import json
from pathlib import Path

root = Path(__file__).resolve().parents[1]
membership = (root / 'data/player-ids.bin').read_bytes()
lookups = []
for role in ('fc', 'gk'):
    data = (root / f'data/player-{role}-bits.bin').read_bytes()
    if len(data) != len(membership) or any(a & ~b for a, b in zip(data, membership)):
        raise SystemExit(f'invalid {role} position bitset')
    sha = hashlib.sha256(data).hexdigest()
    (root / f'rules/pulse/player_{role}_bits.inc').write_text(
        f'// Generated from data/player-{role}-bits.bin; SHA-256 {sha}\n' +
        ''.join('  ' + ', '.join(str(v) for v in data[i:i + 32]) + ',\n'
                for i in range(0, len(data), 32))
    )
    encoded = base64.b64encode(data).decode('ascii')
    chunks = [encoded[i:i + 4096] for i in range(0, len(encoded), 4096)]
    lookups.append((role, sha, chunks))
    print(f'{role.upper()}: {sum(bin(x).count("1") for x in data)} players, SHA-256 {sha}')

fc = (root / 'data/player-fc-bits.bin').read_bytes()
gk = (root / 'data/player-gk-bits.bin').read_bytes()
if any(a & b for a, b in zip(fc, gk)):
    raise SystemExit('FC and GK primary positions overlap')
featured = json.loads((root / 'src/lib/pulse/featured.json').read_text())
shooting = (root / 'data/player-shooting.bin').read_bytes()
goalkeeping = (root / 'data/player-goalkeeping.bin').read_bytes()
rosters = {}
for role, bits, ratings in (('striker', fc, shooting), ('keeper', gk, goalkeeping)):
    picks = [p for p in featured if p['role'] == role]
    if len(picks) != 3 or len({p['id'] for p in picks}) != 3:
        raise SystemExit(f'featured {role} choices must contain three distinct players')
    tiers = set()
    for player in picks:
        player_id = player['id']
        if not bits[player_id // 8] & (1 << (player_id % 8)):
            raise SystemExit(f'featured {role} {player_id} has the wrong primary position')
        rating = ratings[player_id]
        tiers.add(0 if rating >= 90 else 1 if rating >= 75 else 2 if rating >= 55 else -1)
    if tiers != {0, 1, 2}:
        raise SystemExit(f'featured {role} choices must cover the three rating tiers')
    rosters[role] = [p['id'] for p in picks]

(root / 'rules/pulse/featured_roster.inc').write_text(
    '// Generated from src/lib/pulse/featured.json; validated against pinned roles and ratings.\n'
    'constexpr std::uint32_t rosterShooters[3] = {' + ', '.join(map(str, rosters['striker'])) + '};\n'
    'constexpr std::uint32_t rosterKeepers[3] = {' + ', '.join(map(str, rosters['keeper'])) + '};\n'
)

code = '// Generated from the pinned Soccerverse position bitsets.\n'
for role, sha, chunks in lookups:
    code += (f'// {role.upper()} SHA-256 {sha}\nconst {role}Encoded = [\n' +
             ''.join("  '" + chunk + "',\n" for chunk in chunks) +
             "].join('');\n" +
             f'const {role}Bits = Uint8Array.from(atob({role}Encoded), character => character.charCodeAt(0));\n')
code += '''function hasRole(bits: Uint8Array, id: number): boolean {
  return Number.isInteger(id) && id > 0 && id >> 3 < bits.length &&
    !!(bits[id >> 3] & (1 << (id & 7)));
}
export function isCentreForward(id: number): boolean { return hasRole(fcBits, id); }
export function isGoalkeeper(id: number): boolean { return hasRole(gkBits, id); }
'''
(root / 'src/lib/pulse/positions-data.ts').write_text(code)
