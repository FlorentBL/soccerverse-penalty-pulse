#!/usr/bin/env python3
"""Pin Soccerverse rating_shooting through its public MCP player search.

Fetches the exact IDs in the checked-in datapack bitset in batches of 100.
Batch files make a long public-API fetch resumable; only validated ratings
are written to the consensus table. A byte value of 255 means unavailable.
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
parser.add_argument('--cache-dir', type=Path, default=Path('/tmp/pulse-soccerverse-ratings'))
parser.add_argument('--concurrency', type=int, default=3)
parser.add_argument('--limit-batches', type=int, default=0, help='Probe only; do not emit final data')
args = parser.parse_args()
if not 1 <= args.concurrency <= 6:
    parser.error('concurrency must be 1..6')

bits = (ROOT / 'data/player-ids.bin').read_bytes()
ids = [i for i in range(1, len(bits) * 8) if bits[i // 8] & (1 << (i % 8))]
batches = [ids[i:i + BATCH_SIZE] for i in range(0, len(ids), BATCH_SIZE)]
args.cache_dir.mkdir(parents=True, exist_ok=True)


def read_batch(index, requested):
    path = args.cache_dir / f'{index:04d}.json'
    if path.exists():
        cached = json.loads(path.read_text())
        if cached['requested'] != requested:
            raise ValueError(f'cache batch {index} does not match datapack IDs')
        return {int(player_id): rating for player_id, rating in cached['ratings'].items()}

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
            ratings = {}
            for player in players:
                player_id = player['player_id']
                rating = player['rating_shooting']
                if player_id not in requested or player_id in ratings or not isinstance(rating, int) or not 0 <= rating <= 100:
                    raise ValueError(f'invalid player/rating: {player_id} {rating}')
                ratings[player_id] = rating
            cached = {'requested': requested, 'ratings': ratings}
            temporary = path.with_suffix('.tmp')
            temporary.write_text(json.dumps(cached, separators=(',', ':')))
            temporary.replace(path)
            return ratings
        except (ValueError, KeyError, IndexError, TypeError) as exc:
            last_error = exc
            time.sleep(min(30, 2 ** attempt))
    raise RuntimeError(f'batch {index} failed: {last_error}')


count = min(len(batches), args.limit_batches) if args.limit_batches else len(batches)
ratings_by_id = {}
with ThreadPoolExecutor(max_workers=args.concurrency) as pool:
    futures = {pool.submit(read_batch, i, batches[i]): i for i in range(count)}
    for completed, future in enumerate(as_completed(futures), 1):
        ratings_by_id.update(future.result())
        if completed % 100 == 0 or completed == count:
            print(f'{completed}/{count} batches, {len(ratings_by_id)} rated players', flush=True)

if args.limit_batches:
    sys.exit(0)

table = bytearray([255]) * (len(bits) * 8)
for player_id, rating in ratings_by_id.items():
    table[player_id] = rating
maximum_id = ids[-1]
table = table[:maximum_id + 1]
output = ROOT / 'data/player-shooting.bin'
output.write_bytes(table)
print(f'wrote {output}: {len(table)} bytes, {len(ratings_by_id)} ratings, '
      f'{len(ids) - len(ratings_by_id)} unavailable, SHA-256 {hashlib.sha256(table).hexdigest()}', flush=True)
