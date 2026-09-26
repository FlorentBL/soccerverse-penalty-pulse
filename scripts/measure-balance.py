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

def edge_adjacent(a, b):
    return adjacent(a, b) and (a % 3 == b % 3) != (a // 3 == b // 3)

@lru_cache(None)
def score_value(targets_, keeper_rating):
    minimum = (4 if keeper_rating >= 80 else 6 if keeper_rating >= 70 else
               8 if keeper_rating >= 60 else 10)
    if len(targets_) < minimum:
        guards = [(a,) for a in range(9)]
    else:
        touching = adjacent if keeper_rating >= 90 else edge_adjacent
        guards = [(a, b) for a in range(9) for b in range(a + 1, 9) if touching(a, b)]
    a_ub = [[*[int(t in guard) for t in targets_], -1] for guard in guards]
    result = linprog([*[0] * len(targets_), 1], A_ub=a_ub,
                     b_ub=[0] * len(guards),
                     A_eq=[[*[1] * len(targets_), 0]], b_eq=[1],
                     bounds=[(0, 1)] * len(targets_) + [(0, 1)], method='highs')
    if not result.success:
        raise RuntimeError(result.message)
    return 1 - result.x[-1]

def goal(attacker, defender):
    return score_value(targets(attacker), keep[defender])

bands = ((90, 100), (80, 89), (70, 79), (60, 69), (55, 59))
ids = [i for i, s in enumerate(shoot) if s != 255]
shooters = [i for i in ids if fc[i // 8] & (1 << (i % 8))]
keepers = [i for i in ids if gk[i // 8] & (1 << (i % 8))]
print('Official pinned players:', len(ids))
print('Eligible FC shooters / GK keepers:', len(shooters), '/', len(keepers))
print('Bands 90+, 80–89, 70–79, 60–69, 55–59')
print('Eligible FC:', [sum(lo <= shoot[i] <= hi for i in shooters) for lo, hi in bands])
print('Eligible GK:', [sum(lo <= keep[i] <= hi for i in keepers) for lo, hi in bands])
for attack_seat in (0, 1):
    roster_shooters = [p for p in featured if p['role'] == 'striker' and p['seat'] == attack_seat]
    roster_keepers = [p for p in featured if p['role'] == 'keeper' and p['seat'] != attack_seat]
    print(f'P{attack_seat + 1} shooting vs P{2 - attack_seat} keeping; optimal one-kick goal %:')
    for attacker in roster_shooters:
        print(' ', attacker['name'], shoot[attacker['id']], count(attacker['id']),
              [(defender['name'], round(100 * goal(attacker['id'], defender['id']), 1))
               for defender in roster_keepers])
