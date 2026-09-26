import type { PulseInput } from './channel';
import { goalkeeperRating, ratingTier, scoringTargets, shootingRating, tierUsed, validReach, type PulseState } from './codec';
import { isRosterShooter, isRosterKeeper } from './players';

export interface PreviewGuard { lane: number; reach: number }
/** Local UI rehearsal only. Real matches are judged by rules.wasm through the SDK. */
export function initialPreviewState(): PulseState {
  return {
    participants: 2, phase: 0, turn: 0, kick: 0, goals: [0, 0], winner: -1,
    turnCount: 0, pendingShooter: 0, pendingKeeper: 0, pendingLane: 255, lastResult: 0,
    usedShooters: [[0, 0, 0], [0, 0, 0]], usedKeepers: [[0, 0, 0], [0, 0, 0]],
    lastPlayer: 0, lastKeeper: 0, lastShot: 255, lastGuard: 255,
    pairShooters: [0, 0], pairKeepers: [0, 0], lastReach: 255,
  };
}
function scoreWinner(kick: number, goals: [number, number]): number {
  if (kick < 6) {
    if (goals[0] > goals[1] + 3 - Math.floor(kick / 2)) return 0;
    if (goals[1] > goals[0] + 3 - Math.ceil(kick / 2)) return 1;
    return -1;
  }
  if (kick % 2) return -1;
  if (goals[0] !== goals[1]) return goals[0] > goals[1] ? 0 : 1;
  return kick === 254 ? 0 : -1;
}
export function advancePreview(
  state: PulseState, input: PulseInput, keeperChoice: PreviewGuard | null,
): { state: PulseState; keeperChoice: PreviewGuard | null } | null {
  if (state.phase === 6 || state.kick >= 254 || input.kick !== state.kick) return null;
  const shooter = state.kick % 2;
  if ((state.phase === 0 || state.phase === 1) && input.type === 'pick') {
    const seat = state.phase;
    if (!Number.isInteger(input.shooterId) || !Number.isInteger(input.keeperId) ||
        input.shooterId === input.keeperId || !isRosterShooter(input.shooterId) || !isRosterKeeper(input.keeperId) ||
        ratingTier(shootingRating(input.shooterId)) < 0 ||
        ratingTier(goalkeeperRating(input.keeperId)) < 0 || state.kick < 6 &&
        (tierUsed(state.usedShooters[seat], input.shooterId, 'shoot') ||
         tierUsed(state.usedKeepers[seat], input.keeperId, 'save'))) return null;
    if (seat === 0) return {
      state: { ...state, phase: 1, turn: 1, pendingShooter: input.shooterId, pendingKeeper: input.keeperId, turnCount: state.turnCount + 1 },
      keeperChoice: null,
    };
    const pairShooters: [number, number] = [state.pendingShooter, input.shooterId];
    const pairKeepers: [number, number] = [state.pendingKeeper, input.keeperId];
    const usedShooters: [number[], number[]] = [state.usedShooters[0].slice(), state.usedShooters[1].slice()];
    const usedKeepers: [number[], number[]] = [state.usedKeepers[0].slice(), state.usedKeepers[1].slice()];
    if (state.kick < 6) {
      usedShooters[0][Math.floor(state.kick / 2)] = pairShooters[0];
      usedShooters[1][Math.floor(state.kick / 2)] = pairShooters[1];
      usedKeepers[0][Math.floor(state.kick / 2)] = pairKeepers[0];
      usedKeepers[1][Math.floor(state.kick / 2)] = pairKeepers[1];
    }
    return {
      state: { ...state, phase: 3, turn: 1, pendingShooter: 0, pendingKeeper: 0,
        pairShooters, pairKeepers, usedShooters, usedKeepers,
        turnCount: state.turnCount + 2 }, keeperChoice: null,
    };
  }
  if (state.phase === 3 && input.type === 'guard' && Number.isInteger(input.lane) && input.lane >= 0 && input.lane <= 8) {
    if (!validReach(state.pairKeepers[1 - shooter], state.pairShooters[shooter], input.lane, input.reach)) return null;
    return {
      state: { ...state, phase: 4, turn: shooter, turnCount: state.turnCount + 1 },
      keeperChoice: { lane: input.lane, reach: input.reach },
    };
  }
  if (state.phase === 4 && input.type === 'shot' && keeperChoice &&
      Number.isInteger(input.lane) && input.lane >= 0 && input.lane <= 8) {
    const striker = state.pairShooters[shooter];
    const keeper = state.pairKeepers[1 - shooter];
    const result = input.lane === keeperChoice.lane || input.lane === keeperChoice.reach ? 2 :
      scoringTargets(striker).includes(input.lane) ? 1 : 3;
    const goals: [number, number] = [...state.goals];
    if (result === 1) goals[shooter]++;
    const kick = state.kick + 1;
    const winner = scoreWinner(kick, goals);
    const finished = winner !== -1;
    const nextPair = kick % 2 === 0;
    return {
      state: {
        ...state, phase: finished ? 6 : nextPair ? 0 : 3,
        turn: finished ? 255 : nextPair ? 0 : 0,
        kick, goals, winner, turnCount: state.turnCount + 2,
        pendingLane: 255, pairShooters: nextPair ? [0, 0] : state.pairShooters,
        pairKeepers: nextPair ? [0, 0] : state.pairKeepers,
        lastResult: result, lastPlayer: striker, lastKeeper: keeper, lastShot: input.lane,
        lastGuard: keeperChoice.lane, lastReach: keeperChoice.reach,
      }, keeperChoice: null,
    };
  }
  return null;
}
