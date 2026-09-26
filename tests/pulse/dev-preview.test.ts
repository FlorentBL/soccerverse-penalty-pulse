import { describe, expect, it } from 'vitest';
import { scoringTargets, shootingRating, type PulseState } from '@/lib/pulse/codec';
import { advancePreview, initialPreviewState } from '@/lib/pulse/dev-preview';

function kick(state: PulseState, id: number, scores: boolean): PulseState {
  const number = state.kick;
  const target = scoringTargets(id)[0];
  const picked = advancePreview(state, { type: 'pick', kick: number, playerId: id }, null);
  expect(picked?.state.phase).toBe(1);
  const guard = scores ? (target + 1) % 9 : target;
  const committed = advancePreview(picked!.state, { type: 'guard', kick: number, lane: guard }, null);
  expect(committed?.state.phase).toBe(2);
  const shot = advancePreview(committed!.state, { type: 'shot', kick: number, lane: target }, guard);
  expect(shot?.state.lastResult).toBe(scores ? 1 : 2);
  return shot!.state;
}

describe('wallet-free local preview', () => {
  it('ends when the trailing side cannot catch up', () => {
    let state = initialPreviewState();
    const players = [1100, 278, 154, 874];
    for (let i = 0; i < 4; i++) state = kick(state, players[i], i % 2 === 0);
    expect(state).toMatchObject({ phase: 4, kick: 4, goals: [2, 0], winner: 0, turnCount: 16 });
    expect(advancePreview(state, { type: 'pick', kick: 4, playerId: 3 }, null)).toBeNull();
  });

  it('plays paired sudden-death kicks after a regulation tie and permits player reuse', () => {
    let state = initialPreviewState();
    for (const id of [1100, 278, 154, 874, 129718, 1]) state = kick(state, id, false);
    expect(state).toMatchObject({ phase: 0, kick: 6, goals: [0, 0], winner: -1 });
    state = kick(state, 1100, true);
    expect(state).toMatchObject({ phase: 0, kick: 7, goals: [1, 0], winner: -1 });
    state = kick(state, 278, false);
    expect(state).toMatchObject({ phase: 4, kick: 8, goals: [1, 0], winner: 0 });
  });

  it('rejects repeated regulation players and invalid phases', () => {
    let state = initialPreviewState();
    expect(advancePreview(state, { type: 'shot', kick: 0, lane: 0 }, null)).toBeNull();
    state = kick(state, 1100, false);
    state = kick(state, 278, false);
    expect(advancePreview(state, { type: 'pick', kick: 2, playerId: 1100 }, null)).toBeNull();
    expect(advancePreview(state, { type: 'pick', kick: 3, playerId: 154 }, null)).toBeNull();
    expect(advancePreview(state, { type: 'pick', kick: 2, playerId: 9999999 }, null)).toBeNull();
  });

  it('uses pinned official shooting ratings for the number of reliable zones', () => {
    expect(shootingRating(1100)).toBe(96);
    expect(shootingRating(1)).toBe(51);
    expect(scoringTargets(1100)).toHaveLength(8);
    expect(scoringTargets(154)).toHaveLength(7);
    expect(scoringTargets(1)).toHaveLength(2);
    expect(new Set(scoringTargets(1100)).size).toBe(8);
  });

  it('resolves the finite wire-format limit with a documented first-shooter tiebreak', () => {
    let state = initialPreviewState();
    const starters = [1100, 278, 154, 874, 129718, 1];
    for (let i = 0; i < 254; i++) state = kick(state, i < 6 ? starters[i] : i % 2 ? 278 : 1100, false);
    expect(state).toMatchObject({ phase: 4, kick: 254, winner: 0, goals: [0, 0] });
  });
});
