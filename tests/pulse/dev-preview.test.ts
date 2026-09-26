import { describe, expect, it } from 'vitest';
import { primaryLane } from '@/lib/pulse/codec';
import { advancePreview, initialPreviewState } from '@/lib/pulse/dev-preview';

describe('wallet-free local preview', () => {
  it('hands each turn to the right role and finishes after six kicks', () => {
    let state = initialPreviewState();
    let guard: number | null = null;
    const players = [1100, 278, 154, 874, 129718, 1];
    for (let kick = 0; kick < 6; kick++) {
      const pick = advancePreview(state, { type: 'pick', kick, playerId: players[kick] }, guard);
      expect(pick?.state.phase).toBe(1);
      expect(pick?.state.turn).toBe(1 - kick % 2);
      state = pick!.state;
      guard = pick!.keeperLane;

      const dive = advancePreview(state, { type: 'guard', kick, lane: kick === 1 ? primaryLane(players[kick]) : (primaryLane(players[kick]) + 1) % 3 }, guard);
      expect(dive?.state.phase).toBe(2);
      expect(dive?.state.turn).toBe(kick % 2);
      state = dive!.state;
      guard = dive!.keeperLane;

      const shot = advancePreview(state, { type: 'shot', kick, lane: primaryLane(players[kick]) }, guard);
      expect(shot?.state.lastResult).toBe(kick === 1 ? 2 : 1);
      state = shot!.state;
      guard = shot!.keeperLane;
    }
    expect(state.phase).toBe(4);
    expect(state.turnCount).toBe(24);
    expect(state.goals).toEqual([3, 2]);
    expect(state.winner).toBe(0);
    expect(advancePreview(state, { type: 'pick', kick: 6, playerId: 3 }, guard)).toBeNull();
  });

  it('rejects a repeated player and moves from the wrong phase', () => {
    let state = initialPreviewState();
    expect(advancePreview(state, { type: 'shot', kick: 0, lane: 0 }, null)).toBeNull();
    state = advancePreview(state, { type: 'pick', kick: 0, playerId: 1100 }, null)!.state;
    state = advancePreview(state, { type: 'guard', kick: 0, lane: 1 }, null)!.state;
    state = advancePreview(state, { type: 'shot', kick: 0, lane: 2 }, 1)!.state;
    state = advancePreview(state, { type: 'pick', kick: 1, playerId: 278 }, null)!.state;
    state = advancePreview(state, { type: 'guard', kick: 1, lane: 1 }, null)!.state;
    state = advancePreview(state, { type: 'shot', kick: 1, lane: 2 }, 1)!.state;
    expect(advancePreview(state, { type: 'pick', kick: 2, playerId: 1100 }, null)).toBeNull();
    expect(advancePreview(state, { type: 'pick', kick: 3, playerId: 154 }, null)).toBeNull();
  });
});
