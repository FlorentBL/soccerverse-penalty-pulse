#!/usr/bin/env python3
"""Pin Soccerverse primary positions for every player in the existing ID snapshot.

The public Soccerverse MCP search_players tool supplies position_main. Cache
batches so the complete fetch can resume safely. Only validated values enter
the consensus bitsets used by both the native and WASM judges.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
ENDPOINT = 'https://mcp.soccerverse.io/mcp'
BATCH_SIZE = 100

parser = argparse.ArgumentParser()
parser.add_argument('--cache-dir', type=Path, default=Path('/tmp/pulse-soccerverse-positions'))
parser.add_argument('--concurrency', type=int, default=6)
parser.add_argument('--limit-batches', type=int, default=0, help='Probe only; do not emit final data')
args = parser.parse_args()
if not 1 <= args.concurrency <= 6:
    parser.error('concurrency must be 1..6')

membership = (ROOT / 'data/player-ids.bin').read_bytes()
ids = [i for i in range(1, len(membership) * 8) if membership[i // 8] & (1 << (i % 8))]
batches = [ids[i:i + BATCH_SIZE] for i in range(0, len(ids), BATCH_SIZE)]
args.cache_dir.mkdir(parents=True, exist_ok=True)


def read_batch(index, requested):
    path = args.cache_dir / f'{index:04d}.json'
    if path.exists():
        cached = json.loads(path.read_text())
        if cached['requested'] != requested:
            raise ValueError(f'cache batch {index} does not match pinned IDs')
        return {int(player_id): position for player_id, position in cached['positions'].items()}

    payload = json.dumps({
        'jsonrpc': '2.0', 'id': index + 1, 'method': 'tools/call',
        'params': {'name': 'search_players',
                   'arguments': {'player_ids': requested, 'per_page': 100}},
    }, separators=(',', ':'))
    last_error = None
    for attempt in range(6):
        result = subprocess.run([
            'curl', '-fsS', '--max-time', '45', '-X', 'POST', ENDPOINT,
            '-H', 'Content-Type: application/json',
            '-H', 'Accept: application/json, text/event-stream',
            '--data-binary', '@-',
        ], input=payload, text=True, capture_output=True, check=False)
        try:
            if result.returncode:
                raise ValueError(result.stderr.strip() or f'curl exit {result.returncode}')
            envelope = json.loads(result.stdout)
            if 'error' in envelope or envelope.get('result', {}).get('isError'):
                raise ValueError(str(envelope.get('error') or envelope['result']))
            data = json.loads(envelope['result']['content'][0]['text'])
            players = data['players']
            pagination = data['pagination']
            if pagination['total_pages'] != 1 or pagination['total'] != len(players):
                raise ValueError(f'unexpected pagination {pagination}')
            positions = {}
            for player in players:
                player_id = player['player_id']
                position = player['position_main']
                if (player_id not in requested or player_id in positions or
                        not isinstance(position, str) or not position or len(position) > 8):
                    raise ValueError(f'invalid player/position: {player_id} {position}')
                positions[player_id] = position
            if len(positions) != len(requested):
                raise ValueError(f'batch {index} missing {len(requested) - len(positions)} players')
            temporary = path.with_suffix('.tmp')
            temporary.write_text(json.dumps({'requested': requested, 'positions': positions}, separators=(',', ':')))
            temporary.replace(path)
            return positions
        except (ValueError, KeyError, IndexError, TypeError) as exc:
            last_error = exc
            time.sleep(min(30, 2 ** attempt))
    raise RuntimeError(f'batch {index} failed: {last_error}')


count = min(len(batches), args.limit_batches) if args.limit_batches else len(batches)
positions_by_id = {}
with ThreadPoolExecutor(max_workers=args.concurrency) as pool:
    futures = {pool.submit(read_batch, i, batches[i]): i for i in range(count)}
    for completed, future in enumerate(as_completed(futures), 1):
        positions_by_id.update(future.result())
        if completed % 100 == 0 or completed == count:
            print(f'{completed}/{count} batches, {len(positions_by_id)} positioned players', flush=True)

if args.limit_batches:
    sys.exit(0)

if len(positions_by_id) != len(ids):
    raise ValueError('position snapshot incomplete')
for role in ('FC', 'GK'):
    bits = bytearray(len(membership))
    for player_id, position in positions_by_id.items():
        if position == role:
            bits[player_id // 8] |= 1 << (player_id % 8)
    output = ROOT / f'data/player-{role.lower()}-bits.bin'
    output.write_bytes(bits)
    print(f'{role}: {sum(bin(x).count("1") for x in bits)} players, SHA-256 {hashlib.sha256(bits).hexdigest()}', flush=True)
