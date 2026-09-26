import type { PulseInput } from './channel';
import { scoringTargetCount, scoringTargets, type PulseState } from './codec';

/** Local UI rehearsal only. Real matches are judged by rules.wasm through the SDK. */
export function initialPreviewState(): PulseState {
  return {
    participants: 2, phase: 0, turn: 0, kick: 0, goals: [0, 0], winner: -1,
    turnCount: 0, pendingPlayer: 0, pendingLane: 255, lastResult: 0,
    used: [[0, 0, 0], [0, 0, 0]], lastPlayer: 0, lastShot: 255, lastGuard: 255,
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
  state: PulseState, input: PulseInput, keeperLane: number | null,
): { state: PulseState; keeperLane: number | null } | null {
  if (state.phase === 4 || state.kick >= 254 || input.kick !== state.kick) return null;
  const shooter = state.kick % 2;
  if (state.phase === 0 && input.type === 'pick') {
    if (!Number.isInteger(input.playerId) || scoringTargetCount(input.playerId) === 0 ||
        state.kick < 6 && state.used[shooter].includes(input.playerId)) return null;
    return {
      state: { ...state, phase: 1, turn: 1 - shooter, pendingPlayer: input.playerId, turnCount: state.turnCount + 1 },
      keeperLane: null,
    };
  }
  if (state.phase === 1 && input.type === 'guard' && Number.isInteger(input.lane) && input.lane >= 0 && input.lane <= 8) {
    return {
      state: { ...state, phase: 2, turn: shooter, turnCount: state.turnCount + 1 },
      keeperLane: input.lane,
    };
  }
  if (state.phase === 2 && input.type === 'shot' && keeperLane !== null &&
      Number.isInteger(input.lane) && input.lane >= 0 && input.lane <= 8) {
    const result = input.lane === keeperLane ? 2 :
      scoringTargets(state.pendingPlayer).includes(input.lane) ? 1 : 3;
    const goals: [number, number] = [...state.goals];
    if (result === 1) goals[shooter]++;
    const used: [number[], number[]] = [state.used[0].slice(), state.used[1].slice()];
    if (state.kick < 6) used[shooter][Math.floor(state.kick / 2)] = state.pendingPlayer;
    const kick = state.kick + 1;
    const winner = scoreWinner(kick, goals);
    const finished = winner !== -1;
    return {
      state: {
        ...state, phase: finished ? 4 : 0, turn: finished ? 255 : kick % 2,
        kick, goals, winner,
        turnCount: state.turnCount + 2, pendingPlayer: 0, pendingLane: 255,
        lastResult: result, used, lastPlayer: state.pendingPlayer,
        lastShot: input.lane, lastGuard: keeperLane,
      },
      keeperLane: null,
    };
  }
  return null;
}
