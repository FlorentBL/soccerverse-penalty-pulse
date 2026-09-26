import type { PulseInput } from './channel';
import { primaryLane, secondaryLane, type PulseState } from './codec';

/** Local UI rehearsal only. Real matches are judged by rules.wasm through the SDK. */
export function initialPreviewState(): PulseState {
  return {
    participants: 2, phase: 0, turn: 0, kick: 0, goals: [0, 0], winner: -1,
    turnCount: 0, pendingPlayer: 0, pendingLane: 255, lastResult: 0,
    used: [[0, 0, 0], [0, 0, 0]], lastPlayer: 0, lastShot: 255, lastGuard: 255,
  };
}

export function advancePreview(
  state: PulseState, input: PulseInput, keeperLane: number | null,
): { state: PulseState; keeperLane: number | null } | null {
  if (state.phase === 4 || input.kick !== state.kick) return null;
  const shooter = state.kick % 2;
  if (state.phase === 0 && input.type === 'pick') {
    if (!Number.isInteger(input.playerId) || input.playerId < 1 ||
        state.used[shooter].includes(input.playerId)) return null;
    return {
      state: { ...state, phase: 1, turn: 1 - shooter, pendingPlayer: input.playerId, turnCount: state.turnCount + 1 },
      keeperLane: null,
    };
  }
  if (state.phase === 1 && input.type === 'guard' && input.lane >= 0 && input.lane <= 2) {
    return {
      state: { ...state, phase: 2, turn: shooter, turnCount: state.turnCount + 1 },
      keeperLane: input.lane,
    };
  }
  if (state.phase === 2 && input.type === 'shot' && keeperLane !== null &&
      input.lane >= 0 && input.lane <= 2) {
    const result = input.lane === keeperLane ? 2 :
      input.lane === primaryLane(state.pendingPlayer) ||
      input.lane === secondaryLane(state.pendingPlayer) ? 1 : 3;
    const goals: [number, number] = [...state.goals];
    if (result === 1) goals[shooter]++;
    const used: [number[], number[]] = [state.used[0].slice(), state.used[1].slice()];
    used[shooter][Math.floor(state.kick / 2)] = state.pendingPlayer;
    const kick = state.kick + 1;
    const finished = kick === 6;
    return {
      state: {
        ...state, phase: finished ? 4 : 0, turn: finished ? 255 : kick % 2,
        kick, goals, winner: finished ? goals[0] === goals[1] ? -2 : goals[0] > goals[1] ? 0 : 1 : -1,
        turnCount: state.turnCount + 2, pendingPlayer: 0, pendingLane: 255,
        lastResult: result, used, lastPlayer: state.pendingPlayer,
        lastShot: input.lane, lastGuard: keeperLane,
      },
      keeperLane: null,
    };
  }
  return null;
}
