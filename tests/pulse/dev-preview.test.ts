import { describe, expect, it } from 'vitest';
import { adjacent, canReach, goalkeeperRating, scoringTargets, shootingRating, type PulseState } from '@/lib/pulse/codec';
import { advancePreview, initialPreviewState, type PreviewGuard } from '@/lib/pulse/dev-preview';

function pair(state: PulseState, first: number, second: number): PulseState {
  const one = advancePreview(state, { type: 'pick', kick: state.kick, playerId: first }, null);
  expect(one?.state.phase).toBe(1);
  const two = advancePreview(one!.state, { type: 'pick', kick: state.kick, playerId: second }, null);
  expect(two?.state.phase).toBe(3);
  return two!.state;
}
function kick(state: PulseState, scores: boolean): PulseState {
  const striker = state.pairPlayers[state.kick % 2];
  const keeper = state.pairPlayers[1 - state.kick % 2];
  const target = scoringTargets(striker)[0];
  const primary = scores ? (target + 1) % 9 : target;
  const reach = canReach(keeper, striker)
    ? Array.from({ length: 9 }, (_, i) => i).find(i => adjacent(primary, i) && (!scores || i !== target))!
    : 255;
  const committed = advancePreview(state, { type: 'guard', kick: state.kick, lane: primary, reach }, null);
  expect(committed?.state.phase).toBe(4);
  const shot = advancePreview(committed!.state, { type: 'shot', kick: state.kick, lane: target },
    committed!.keeperChoice);
  expect(shot?.state.lastResult).toBe(scores ? 1 : 2);
  return shot!.state;
}

describe('wallet-free local preview', () => {
  it('plays paired penalties with the same selected player shooting and guarding', () => {
    let state = pair(initialPreviewState(), 1100, 19465);
    expect(state.pairPlayers).toEqual([1100, 19465]);
    state = kick(state, true);
    expect(state).toMatchObject({ phase: 3, kick: 1, goals: [1, 0] });
    expect(state.pairPlayers).toEqual([1100, 19465]);
    state = kick(state, false);
    expect(state).toMatchObject({ phase: 0, kick: 2, goals: [1, 0], turnCount: 9 });
  });
  it('ends early after two unanswered goals', () => {
    let state = initialPreviewState();
    state = pair(state, 1100, 278);
    state = kick(state, true); state = kick(state, false);
    state = pair(state, 154, 874);
    state = kick(state, true); state = kick(state, false);
    expect(state).toMatchObject({ phase: 6, kick: 4, goals: [2, 0], winner: 0, turnCount: 18 });
  });
  it('plays sudden death after a tie and permits reuse', () => {
    let state = initialPreviewState();
    for (const [a, b] of [[1100, 278], [154, 874], [129718, 1]]) {
      state = pair(state, a, b); state = kick(state, false); state = kick(state, false);
    }
    expect(state).toMatchObject({ phase: 0, kick: 6, goals: [0, 0] });
    state = pair(state, 1100, 278);
    state = kick(state, true); state = kick(state, false);
    expect(state).toMatchObject({ phase: 6, kick: 8, goals: [1, 0], winner: 0 });
  });
  it('requires adjacent reach only for a strong goalkeeper facing at least four zones', () => {
    const state = pair(initialPreviewState(), 1100, 19465);
    expect(canReach(19465, 1100)).toBe(true);
    expect(canReach(19465, 1)).toBe(false);
    expect(advancePreview(state, { type: 'guard', kick: 0, lane: 0, reach: 8 }, null)).toBeNull();
    expect(advancePreview(state, { type: 'guard', kick: 0, lane: 0, reach: 255 }, null)).toBeNull();
    const next = advancePreview(state, { type: 'guard', kick: 0, lane: 0, reach: 4 }, null);
    expect(next?.keeperChoice).toEqual({ lane: 0, reach: 4 } satisfies PreviewGuard);
  });
  it('caps goalkeeper specialists at four targets to balance their two-zone reach', () => {
    expect(shootingRating(19465)).toBe(70);
    expect(goalkeeperRating(19465)).toBe(95);
    expect(scoringTargets(19465)).toHaveLength(4);
    expect(scoringTargets(1100)).toHaveLength(8);
    expect(scoringTargets(1)).toHaveLength(2);
  });
  it('prevents repeated players in regulation and resolves the wire limit', () => {
    let state = initialPreviewState();
    const pairs = [[1100, 278], [154, 874], [129718, 1]];
    for (let i = 0; i < 127; i++) {
      const [a, b] = pairs[i] ?? [1100, 278];
      state = pair(state, a, b); state = kick(state, false); state = kick(state, false);
      if (i === 0) {
        const prior = state;
        const one = advancePreview(state, { type: 'pick', kick: 2, playerId: 1100 }, null);
        expect(one).toBeNull();
        expect(state).toBe(prior);
      }
    }
    expect(state).toMatchObject({ phase: 6, kick: 254, winner: 0, goals: [0, 0] });
  });
});
