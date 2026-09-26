#!/usr/bin/env python3
"""Measure exact one-penalty mixed-strategy values from pinned Soccerverse ratings.

Requires scipy only for this analysis script. It is not part of the game runtime.
The striker chooses among reliable targets; the defender chooses a hidden primary
and, when eligible, a second zone. Both may randomize optimally.
"""
from functools import lru_cache
from pathlib import Path
import json
from scipy.optimize import linprog

root = Path(__file__).resolve().parents[1]
shoot = (root / 'data/player-shooting.bin').read_bytes()
keep = (root / 'data/player-goalkeeping.bin').read_bytes()
fc = (root / 'data/player-fc-bits.bin').read_bytes()
gk = (root / 'data/player-gk-bits.bin').read_bytes()
featured = json.loads((root / 'src/lib/pulse/featured.json').read_text())
steps = (1, 2, 4, 5, 7, 8)

def count(player):
    rating = shoot[player]
    return 2 if rating < 55 else 3 if rating < 60 else 4 if rating < 65 else 5 if rating < 70 else 6 if rating < 80 else 7 if rating < 90 else 8

def targets(player):
    return tuple((player % 9 + i * steps[(player // 9) % 6]) % 9 for i in range(count(player)))

def adjacent(a, b):
    return a != b and abs(a % 3 - b % 3) <= 1 and abs(a // 3 - b // 3) <= 1

@lru_cache(None)
def score_value(targets_, keeper_tier):
    guards = ([(a,) for a in range(9)] if keeper_tier == 2 or len(targets_) < 4 else
              [(a, b) for a in range(9) for b in range(a + 1, 9)] if keeper_tier == 0 else
              [(a, b) for a in range(9) for b in range(a + 1, 9) if adjacent(a, b)])
    # Minimize the defender's largest save chance across all legal positions.
    a_ub = [[*[int(t in guard) for t in targets_], -1] for guard in guards]
    result = linprog([*[0] * len(targets_), 1], A_ub=a_ub,
                     b_ub=[0] * len(guards),
                     A_eq=[[*[1] * len(targets_), 0]], b_eq=[1],
                     bounds=[(0, 1)] * len(targets_) + [(0, 1)], method='highs')
    if not result.success:
        raise RuntimeError(result.message)
    return 1 - result.x[-1]

def goal(attacker, defender):
    goalkeeper_tier = 0 if keep[defender] >= 90 else 1 if keep[defender] >= 75 else 2
    return score_value(targets(attacker), goalkeeper_tier)

ids = [i for i, s in enumerate(shoot) if s != 255]
shooters = [i for i in ids if fc[i // 8] & (1 << (i % 8))]
keepers = [i for i in ids if gk[i // 8] & (1 << (i % 8))]
print('Official pinned players:', len(ids))
print('Eligible FC shooters / GK keepers:', len(shooters), '/', len(keepers))
print('Eligible shooting tiers 90+/75–89/55–74:',
      [sum(lo <= shoot[i] <= hi for i in shooters) for lo, hi in ((90, 100), (75, 89), (55, 74))])
print('Eligible keeper tiers 90+/75–89/55–74:',
      [sum(lo <= keep[i] <= hi for i in keepers) for lo, hi in ((90, 100), (75, 89), (55, 74))])
print('Featured shooter vs keeper, optimal goal %:')
for attacker in (p for p in featured if p['role'] == 'striker'):
    print(' ', attacker['name'], 'shooting', shoot[attacker['id']], 'zones', count(attacker['id']),
          [(defender['name'], round(100 * goal(attacker['id'], defender['id']), 1))
           for defender in featured if defender['role'] == 'keeper'])
print('Three-zone underdog vs every featured keeper:',
      [(defender['name'], round(100 * goal(1917, defender['id']), 1))
       for defender in featured if defender['role'] == 'keeper'])
