import type { PulseInput } from './channel';
import { adjacent, canReach, scoringTargetCount, scoringTargets, type PulseState } from './codec';

export interface PreviewGuard { lane: number; reach: number }
/** Local UI rehearsal only. Real matches are judged by rules.wasm through the SDK. */
export function initialPreviewState(): PulseState {
  return {
    participants: 2, phase: 0, turn: 0, kick: 0, goals: [0, 0], winner: -1,
    turnCount: 0, pendingPlayer: 0, pendingLane: 255, lastResult: 0,
    used: [[0, 0, 0], [0, 0, 0]], lastPlayer: 0, lastShot: 255, lastGuard: 255,
    pairPlayers: [0, 0], lastReach: 255,
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
    if (!Number.isInteger(input.playerId) || scoringTargetCount(input.playerId) === 0 ||
        state.kick < 6 && state.used[seat].includes(input.playerId)) return null;
    if (seat === 0) return {
      state: { ...state, phase: 1, turn: 1, pendingPlayer: input.playerId, turnCount: state.turnCount + 1 },
      keeperChoice: null,
    };
    const pairPlayers: [number, number] = [state.pendingPlayer, input.playerId];
    const used: [number[], number[]] = [state.used[0].slice(), state.used[1].slice()];
    if (state.kick < 6) {
      used[0][Math.floor(state.kick / 2)] = pairPlayers[0];
      used[1][Math.floor(state.kick / 2)] = pairPlayers[1];
    }
    return {
      state: { ...state, phase: 3, turn: 1, pendingPlayer: 0, pairPlayers, used,
        turnCount: state.turnCount + 2 }, keeperChoice: null,
    };
  }
  if (state.phase === 3 && input.type === 'guard' && Number.isInteger(input.lane) && input.lane >= 0 && input.lane <= 8) {
    const reach = canReach(state.pairPlayers[1 - shooter], state.pairPlayers[shooter]);
    if (reach ? !adjacent(input.lane, input.reach) : input.reach !== 255) return null;
    return {
      state: { ...state, phase: 4, turn: shooter, turnCount: state.turnCount + 1 },
      keeperChoice: { lane: input.lane, reach: input.reach },
    };
  }
  if (state.phase === 4 && input.type === 'shot' && keeperChoice &&
      Number.isInteger(input.lane) && input.lane >= 0 && input.lane <= 8) {
    const striker = state.pairPlayers[shooter];
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
        pendingLane: 255, pairPlayers: nextPair ? [0, 0] : state.pairPlayers,
        lastResult: result, lastPlayer: striker, lastShot: input.lane,
        lastGuard: keeperChoice.lane, lastReach: keeperChoice.reach,
      }, keeperChoice: null,
    };
  }
  return null;
}
