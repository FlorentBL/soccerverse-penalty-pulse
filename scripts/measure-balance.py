#!/usr/bin/env python3
"""Measure exact one-penalty mixed-strategy values from pinned Soccerverse ratings.

Requires scipy only for this analysis script. It is not part of the game runtime.
The striker chooses among reliable targets; the defender chooses a hidden primary
(and, when eligible, adjacent reach). Both may randomize optimally.
"""
from functools import lru_cache
from pathlib import Path
import json
from scipy.optimize import linprog

root = Path(__file__).resolve().parents[1]
shoot = (root / 'data/player-shooting.bin').read_bytes()
keep = (root / 'data/player-goalkeeping.bin').read_bytes()
featured = json.loads((root / 'src/lib/pulse/featured.json').read_text())
steps = (1, 2, 4, 5, 7, 8)

def count(player):
    rating = shoot[player]
    zones = 2 if rating < 55 else 3 if rating < 60 else 4 if rating < 65 else 5 if rating < 70 else 6 if rating < 80 else 7 if rating < 90 else 8
    return min(zones, 4) if keep[player] >= 75 else zones

def targets(player):
    if keep[player] >= 75 and count(player) == 4:
        lanes = [0, 1, 7, 8]
        for _ in range(player % 4):
            lanes = [3 * (lane % 3) + 2 - lane // 3 for lane in lanes]
        return tuple(lanes)
    return tuple((player % 9 + i * steps[(player // 9) % 6]) % 9 for i in range(count(player)))

def adjacent(a, b):
    return a != b and abs(a % 3 - b % 3) <= 1 and abs(a // 3 - b // 3) <= 1

@lru_cache(None)
def score_value(targets_, reach):
    guards = [(a, b) for a in range(9) for b in range(9) if adjacent(a, b)] if reach else [(a,) for a in range(9)]
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
    return score_value(targets(attacker), keep[defender] >= 75 and count(attacker) >= 4)

ids = [i for i, s in enumerate(shoot) if s != 255]
print('Official pinned players:', len(ids))
print('Goalkeepers >=75:', sum(keep[i] >= 75 for i in ids))
print('Shooting 90+ with goalkeeper <75:', sum(shoot[i] >= 90 and keep[i] < 75 for i in ids))
print('Goalkeepers >=75 whose original shooting would exceed four zones:',
      sum(keep[i] >= 75 and shoot[i] >= 65 for i in ids))
print('Featured player matchups (P1 goal %, P2 goal %, P1/P2 win %, draw %):')
for a in featured:
    for b in featured:
        if a['role'] == b['role'] or a['role'] != 'striker':
            continue
        p = goal(a['id'], b['id']); q = goal(b['id'], a['id'])
        win_a, win_b = p * (1 - q), q * (1 - p)
        print(f"  {a['name']} vs {b['name']}: {100*p:.1f}, {100*q:.1f}, "
              f"{100*win_a:.1f}/{100*win_b:.1f}, {100*(1-win_a-win_b):.1f}")
print('Representative specialist vs specialist:',
      f"striker 1100 vs 278 {100*goal(1100,278):.1f}/{100*goal(278,1100):.1f}",
      f"keeper 19465 vs 22221 {100*goal(19465,22221):.1f}/{100*goal(22221,19465):.1f}")
print('Across all legal four-target Arcade patterns vs strong keepers:',
      'min', min(score_value(tuple((r % 9 + i * steps[(r // 9) % 6]) % 9 for i in range(4)), True) for r in range(54)),
      'max', max(score_value(tuple((r % 9 + i * steps[(r // 9) % 6]) % 9 for i in range(4)), True) for r in range(54)))
