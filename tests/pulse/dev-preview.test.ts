import { describe, expect, it } from 'vitest';
import { canReach, goalkeeperRating, isCentreForward, isGoalkeeper, ratingTier, scoringTargets, shootingRating, validReach, type PulseState } from '@/lib/pulse/codec';
import { advancePreview, initialPreviewState, type PreviewGuard } from '@/lib/pulse/dev-preview';

const shooters = [[184, 874, 18883, 2866, 1917], [1100, 154, 2493, 18810, 1347]];
const keepers = [[19465, 1438, 313, 161, 3], [556, 2932, 64, 1621, 884]];
function select(state: PulseState): PulseState {
  const seat = state.kick % 2;
  const round = state.kick < 10 ? Math.floor(state.kick / 2) : 0;
  const one = advancePreview(state, { type: 'shooter', kick: state.kick, playerId: shooters[seat][round] }, null);
  expect(one?.state.phase).toBe(1);
  expect(one?.state.turn).toBe(1 - seat);
  const two = advancePreview(one!.state, { type: 'keeper', kick: state.kick, playerId: keepers[1 - seat][round] }, null);
  expect(two?.state.phase).toBe(2);
  expect(two?.state.turn).toBe(1 - seat);
  return two!.state;
}
function kick(state: PulseState, scores: boolean): PulseState {
  const striker = state.pairShooters[state.kick % 2];
  const keeper = state.pairKeepers[1 - state.kick % 2];
  const target = scoringTargets(striker)[0];
  const primary = scores ? (target + 1) % 9 : target;
  const reach = canReach(keeper, striker)
    ? Array.from({ length: 9 }, (_, i) => i).find(i => validReach(keeper, striker, primary, i) && (!scores || i !== target))!
    : 255;
  const committed = advancePreview(state, { type: 'guard', kick: state.kick, lane: primary, reach }, null);
  expect(committed?.state.phase).toBe(3);
  const shot = advancePreview(committed!.state, { type: 'shot', kick: state.kick, lane: target },
    committed!.keeperChoice);
  expect(shot?.state.lastResult).toBe(scores ? 1 : 2);
  return shot!.state;
}
describe('wallet-free local preview', () => {
  it('alternates shooter and goalkeeper roles on every penalty', () => {
    let state = select(initialPreviewState());
    expect(state.pairShooters).toEqual([184, 0]);
    expect(state.pairKeepers).toEqual([0, 556]);
    state = kick(state, true);
    expect(state).toMatchObject({ phase: 0, turn: 1, kick: 1, goals: [1, 0] });
    state = select(state);
    expect(state.pairShooters).toEqual([0, 1100]);
    expect(state.pairKeepers).toEqual([19465, 0]);
    state = kick(state, false);
    expect(state).toMatchObject({ phase: 0, turn: 0, kick: 2, goals: [1, 0], turnCount: 10 });
  });
  it('uses distinct seat rosters and never repeats a card in regulation', () => {
    const state = initialPreviewState();
    expect(advancePreview(state, { type: 'shooter', kick: 0, playerId: 1100 }, null)).toBeNull();
    const p1 = advancePreview(state, { type: 'shooter', kick: 0, playerId: 874 }, null)!;
    expect(advancePreview(p1.state, { type: 'keeper', kick: 0, playerId: 19465 }, null)).toBeNull();
    const after = kick(advancePreview(p1.state, { type: 'keeper', kick: 0, playerId: 556 }, null)!.state, false);
    expect(advancePreview(after, { type: 'shooter', kick: 1, playerId: 874 }, null)).toBeNull();
  });
  it('ends early after three unanswered goals', () => {
    let state = initialPreviewState();
    for (let k = 0; k < 6; k++) state = kick(select(state), k % 2 === 0);
    expect(state).toMatchObject({ phase: 6, kick: 6, goals: [3, 0], winner: 0, turnCount: 30 });
  });
  it('plays sudden death after five shots each and permits reuse', () => {
    let state = initialPreviewState();
    for (let k = 0; k < 12; k++) state = kick(select(state), k === 10);
    expect(state).toMatchObject({ phase: 6, kick: 12, goals: [1, 0], winner: 0 });
  });
  it('forces the fifth, lower-rated shooter after four bands have been used', () => {
    let state = initialPreviewState();
    for (let k = 0; k < 8; k++) state = kick(select(state), false);
    expect(state).toMatchObject({ phase: 0, kick: 8, turn: 0 });
    for (const id of shooters[0].slice(0, 4))
      expect(advancePreview(state, { type: 'shooter', kick: 8, playerId: id }, null)).toBeNull();
    expect(advancePreview(state, { type: 'shooter', kick: 8, playerId: 1917 }, null)?.state.phase).toBe(1);
  });
  it('uses official ratings and touching goalkeeper coverage', () => {
    const state = select(initialPreviewState());
    expect(canReach(19465, 184)).toBe(true);
    expect(canReach(19465, 1917)).toBe(false);
    expect(canReach(556, 2866)).toBe(false);
    expect(canReach(556, 18883)).toBe(true);
    expect(validReach(19465, 184, 6, 8)).toBe(false);
    expect(validReach(19465, 184, 0, 4)).toBe(true);
    expect(validReach(1438, 184, 0, 4)).toBe(false);
    expect(validReach(1438, 184, 0, 1)).toBe(true);
    expect(advancePreview(state, { type: 'guard', kick: 0, lane: 0, reach: 4 }, null)).not.toBeNull();
    const next = advancePreview(state, { type: 'guard', kick: 0, lane: 0, reach: 1 }, null);
    expect(next?.keeperChoice).toEqual({ lane: 0, reach: 1 } satisfies PreviewGuard);
    expect(shootingRating(1917)).toBe(59);
    expect(goalkeeperRating(19465)).toBe(95);
    expect(scoringTargets(1917)).toHaveLength(3);
    expect(scoringTargets(874)).toHaveLength(7);
    expect(scoringTargets(184)).toHaveLength(8);
    expect(ratingTier(shootingRating(1917))).toBe(4);
  });
  it('rejects a shot outside the green zones even when the keeper misses it', () => {
    const state = select(initialPreviewState());
    expect(scoringTargets(184)).not.toContain(0);
    const prepared = advancePreview(state, { type: 'guard', kick: 0, lane: 4, reach: 5 }, null);
    expect(prepared?.state.phase).toBe(3);
    expect(advancePreview(prepared!.state, { type: 'shot', kick: 0, lane: 0 }, prepared!.keeperChoice)).toBeNull();
  });
  it('permits only the fixed FC and GK rosters', () => {
    expect(isCentreForward(1917)).toBe(true);
    expect(isGoalkeeper(159)).toBe(true);
    expect(isCentreForward(159)).toBe(false);
    const state = initialPreviewState();
    for (const id of [159, 1460, 1100])
      expect(advancePreview(state, { type: 'shooter', kick: 0, playerId: id }, null)).toBeNull();
    const afterShooter = advancePreview(state, { type: 'shooter', kick: 0, playerId: 184 }, null)!.state;
    for (const id of [184, 159, 22221])
      expect(advancePreview(afterShooter, { type: 'keeper', kick: 0, playerId: id }, null)).toBeNull();
  });
  it('prevents repeated tiers in regulation and resolves the wire limit', () => {
    let state = initialPreviewState();
    for (let k = 0; k < 254; k++) {
      state = kick(select(state), false);
      if (k === 1) {
        expect(advancePreview(state, { type: 'shooter', kick: 2, playerId: 184 }, null)).toBeNull();
        const next = advancePreview(state, { type: 'shooter', kick: 2, playerId: 874 }, null)!.state;
        expect(advancePreview(next, { type: 'keeper', kick: 2, playerId: 19465 }, null)).toBeNull();
      }
    }
    expect(state).toMatchObject({ phase: 6, kick: 254, winner: 0, goals: [0, 0] });
  });
});
