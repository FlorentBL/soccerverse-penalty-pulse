import { describe, expect, it } from 'vitest';
import { canReach, goalkeeperRating, isCentreForward, isGoalkeeper, ratingTier, scoringTargets, shootingRating, validReach, type PulseState } from '@/lib/pulse/codec';
import { advancePreview, initialPreviewState, type PreviewGuard } from '@/lib/pulse/dev-preview';

const shooters0 = [184, 874, 1917];
const keepers0 = [19465, 1438, 62];
const shooters1 = [874, 1917, 184];
const keepers1 = [1438, 62, 19465];
function pair(state: PulseState, round: number): PulseState {
  const i = round < 3 ? round : 0;
  const one = advancePreview(state, { type: 'pick', kick: state.kick,
    shooterId: shooters0[i], keeperId: keepers0[i] }, null);
  expect(one?.state.phase).toBe(1);
  const two = advancePreview(one!.state, { type: 'pick', kick: state.kick,
    shooterId: shooters1[i], keeperId: keepers1[i] }, null);
  expect(two?.state.phase).toBe(3);
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
  expect(committed?.state.phase).toBe(4);
  const shot = advancePreview(committed!.state, { type: 'shot', kick: state.kick, lane: target },
    committed!.keeperChoice);
  expect(shot?.state.lastResult).toBe(scores ? 1 : 2);
  return shot!.state;
}

describe('wallet-free local preview', () => {
  it('plays a pair with separate shooters and keepers', () => {
    let state = pair(initialPreviewState(), 0);
    expect(state.pairShooters).toEqual([184, 874]);
    expect(state.pairKeepers).toEqual([19465, 1438]);
    state = kick(state, true);
    expect(state).toMatchObject({ phase: 3, kick: 1, goals: [1, 0] });
    state = kick(state, false);
    expect(state).toMatchObject({ phase: 0, kick: 2, goals: [1, 0], turnCount: 9 });
  });
  it('ends early after two unanswered goals', () => {
    let state = initialPreviewState();
    state = pair(state, 0);
    state = kick(state, true); state = kick(state, false);
    state = pair(state, 1);
    state = kick(state, true); state = kick(state, false);
    expect(state).toMatchObject({ phase: 6, kick: 4, goals: [2, 0], winner: 0, turnCount: 18 });
  });
  it('plays sudden death after a tie and permits tier reuse', () => {
    let state = initialPreviewState();
    for (let round = 0; round < 3; round++) {
      state = pair(state, round); state = kick(state, false); state = kick(state, false);
    }
    expect(state).toMatchObject({ phase: 0, kick: 6, goals: [0, 0] });
    state = pair(state, 3);
    state = kick(state, true); state = kick(state, false);
    expect(state).toMatchObject({ phase: 6, kick: 8, goals: [1, 0], winner: 0 });
  });
  it('differentiates elite, strong and underdog goalkeeper coverage', () => {
    const first = advancePreview(initialPreviewState(), { type: 'pick', kick: 0, shooterId: 184, keeperId: 62 }, null)!;
    const state = advancePreview(first.state, { type: 'pick', kick: 0, shooterId: 874, keeperId: 19465 }, null)!.state;
    expect(canReach(19465, 184)).toBe(true);
    expect(canReach(19465, 1917)).toBe(false);
    expect(validReach(19465, 184, 6, 8)).toBe(false);
    expect(validReach(19465, 184, 0, 8)).toBe(false);
    expect(validReach(19465, 184, 0, 4)).toBe(true);
    expect(validReach(1438, 184, 0, 4)).toBe(false);
    expect(validReach(1438, 184, 0, 1)).toBe(true);
    expect(validReach(1438, 184, 0, 8)).toBe(false);
    expect(validReach(62, 184, 0, 255)).toBe(true);
    expect(advancePreview(state, { type: 'guard', kick: 0, lane: 0, reach: 255 }, null)).toBeNull();
    expect(advancePreview(state, { type: 'guard', kick: 0, lane: 6, reach: 8 }, null)).toBeNull();
    const next = advancePreview(state, { type: 'guard', kick: 0, lane: 0, reach: 4 }, null);
    expect(next?.keeperChoice).toEqual({ lane: 0, reach: 4 } satisfies PreviewGuard);
  });
  it('uses the official shooting rating for 3, 7 and 8 scoring zones', () => {
    expect(shootingRating(1917)).toBe(59);
    expect(goalkeeperRating(19465)).toBe(95);
    expect(scoringTargets(1917)).toHaveLength(3);
    expect(scoringTargets(874)).toHaveLength(7);
    expect(scoringTargets(184)).toHaveLength(8);
    expect(ratingTier(shootingRating(1917))).toBe(2);
  });
  it('permits only the three offered FC shooters and GK keepers', () => {
    expect(isCentreForward(1917)).toBe(true);
    expect(isGoalkeeper(159)).toBe(true);
    expect(isCentreForward(159)).toBe(false);
    expect(isCentreForward(1460)).toBe(false);
    const state = initialPreviewState();
    expect(advancePreview(state, { type: 'pick', kick: 0, shooterId: 159, keeperId: 19465 }, null)).toBeNull();
    expect(advancePreview(state, { type: 'pick', kick: 0, shooterId: 1460, keeperId: 19465 }, null)).toBeNull();
    expect(advancePreview(state, { type: 'pick', kick: 0, shooterId: 874, keeperId: 184 }, null)).toBeNull();
    expect(advancePreview(state, { type: 'pick', kick: 0, shooterId: 1100, keeperId: 1438 }, null)).toBeNull();
    expect(advancePreview(state, { type: 'pick', kick: 0, shooterId: 184, keeperId: 22221 }, null)).toBeNull();
  });
  it('prevents repeated rating bands per role in regulation and resolves the wire limit', () => {
    let state = initialPreviewState();
    for (let round = 0; round < 127; round++) {
      state = pair(state, round); state = kick(state, false); state = kick(state, false);
      if (round === 0) {
        const prior = state;
        const one = advancePreview(state, { type: 'pick', kick: 2, shooterId: 1100, keeperId: 1438 }, null);
        expect(one).toBeNull();
        expect(state).toBe(prior);
      }
    }
    expect(state).toMatchObject({ phase: 6, kick: 254, winner: 0, goals: [0, 0] });
  });
});
