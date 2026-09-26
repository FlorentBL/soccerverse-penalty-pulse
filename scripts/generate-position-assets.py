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
if len(featured) != 20 or len({p['id'] for p in featured}) != 20:
    raise SystemExit('featured roster must contain 20 distinct players')
for role, bits, ratings in (('striker', fc, shooting), ('keeper', gk, goalkeeping)):
    for seat in (0, 1):
        picks = [p for p in featured if p['role'] == role and p['seat'] == seat]
        if len(picks) != 5:
            raise SystemExit(f'P{seat + 1} {role} choices must contain five players')
        tiers = set()
        for player in picks:
            player_id = player['id']
            if player_id <= 0 or player_id >= len(ratings) or not bits[player_id // 8] & (1 << (player_id % 8)):
                raise SystemExit(f'featured {role} {player_id} has the wrong primary position')
            rating = ratings[player_id]
            tiers.add(0 if rating >= 90 else 1 if rating >= 80 else 2 if rating >= 70 else 3 if rating >= 60 else 4 if rating >= 55 else -1)
        if tiers != set(range(5)):
            raise SystemExit(f'P{seat + 1} {role} must cover all five rating tiers')
        rosters[(role, seat)] = [p['id'] for p in picks]

(root / 'rules/pulse/featured_roster.inc').write_text(
    '// Generated from src/lib/pulse/featured.json; validated against pinned roles and ratings.\n'
    'constexpr std::uint32_t rosterShooters[2][5] = {\n' +
    ''.join('  {' + ', '.join(map(str, rosters[('striker', seat)])) + '},\n' for seat in (0, 1)) + '};\n'
    'constexpr std::uint32_t rosterKeepers[2][5] = {\n' +
    ''.join('  {' + ', '.join(map(str, rosters[('keeper', seat)])) + '},\n' for seat in (0, 1)) + '};\n'
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
