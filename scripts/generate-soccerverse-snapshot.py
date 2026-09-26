#!/usr/bin/env python3
"""Regenerate the pinned Soccerverse name shards and WASM membership bitset."""
import argparse
import hashlib
import json
from pathlib import Path

EXPECTED_SHA = 'd8cc1fe15c726c7360e259783a9d9a4ba0b9069096f50ecdfa4b434402b6ff3e'
FEATURED = [(184, 'striker'), (874, 'striker'), (1917, 'striker'),
            (19465, 'keeper'), (1438, 'keeper'), (62, 'keeper')]
ROOT = Path(__file__).resolve().parents[1]

parser = argparse.ArgumentParser()
parser.add_argument('datapack', type=Path, help='Downloaded official packv2/default.json')
args = parser.parse_args()
source = args.datapack.read_bytes()
actual = hashlib.sha256(source).hexdigest()
if actual != EXPECTED_SHA:
    parser.error(f'datapack SHA-256 differs: {actual}')
rows = json.loads(source)['PackData']['PlayerData']['P']
players = {}
for p in rows:
    player_id = int(p['id'])
    name = ' '.join(part for part in (p.get('f'), p.get('s')) if part).strip()
    players[player_id] = name or f'Soccerverse player #{player_id}'
assert len(players) == 179100 and max(players) == 523571
bits = bytearray(max(players) // 8 + 1)
for player_id in players:
    bits[player_id // 8] |= 1 << (player_id % 8)
(ROOT / 'data/player-ids.bin').write_bytes(bits)
(ROOT / 'rules/pulse/player_bits.inc').write_text(
    ''.join('  ' + ','.join(str(x) for x in bits[i:i+24]) + ',\n'
            for i in range(0, len(bits), 24)))
for shard in range(max(players) // 32768 + 1):
    names = {str(i): players[i] for i in sorted(players) if i // 32768 == shard}
    (ROOT / f'public/players/{shard}.json').write_text(
        json.dumps(names, ensure_ascii=False, separators=(',', ':')))
(ROOT / 'src/lib/pulse/featured.json').write_text(
    json.dumps([{'id': i, 'name': players[i], 'role': role} for i, role in FEATURED],
               ensure_ascii=False, indent=2) + '\n')
print(f'{len(players)} player IDs, {len(bits)} bitset bytes, {max(players)//32768+1} name shards')
