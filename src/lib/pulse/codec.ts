import { shootingRating } from './shooting-data';
import { goalkeeperRating } from './goalkeeping-data';
export { shootingRating } from './shooting-data';
export { goalkeeperRating } from './goalkeeping-data';

export interface PulseState {
  participants: number;
  phase: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  turn: number;
  kick: number;
  goals: [number, number];
  winner: number;
  turnCount: number;
  pendingPlayer: number;
  pendingLane: number;
  lastResult: number;
  used: [number[], number[]];
  lastPlayer: number;
  lastShot: number;
  lastGuard: number;
  pairPlayers: [number, number];
  lastReach: number;
}

export function decodeState(bytes: Uint8Array, participants: number): PulseState | null {
  if (bytes.length !== 87 || bytes[0] !== 2 || bytes[1] !== participants || bytes[2] > 6) return null;
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const used: [number[], number[]] = [
    [v.getUint32(48, true), v.getUint32(52, true), v.getUint32(56, true)],
    [v.getUint32(60, true), v.getUint32(64, true), v.getUint32(68, true)],
  ];
  return {
    participants, phase: bytes[2] as PulseState['phase'], turn: bytes[3], kick: bytes[4],
    goals: [bytes[5], bytes[6]], winner: v.getInt8(7), turnCount: v.getUint16(8, true),
    pendingPlayer: v.getUint32(42, true), pendingLane: bytes[46], lastResult: bytes[47],
    used, lastPlayer: v.getUint32(72, true), lastShot: bytes[76], lastGuard: bytes[77],
    pairPlayers: [v.getUint32(78, true), v.getUint32(82, true)], lastReach: bytes[86],
  };
}

export function scoringTargetCount(id: number): number {
  const rating = shootingRating(id);
  if (rating === null || goalkeeperRating(id) === null) return 0;
  const count = rating < 55 ? 2 : rating < 60 ? 3 : rating < 65 ? 4 :
    rating < 70 ? 5 : rating < 80 ? 6 : rating < 90 ? 7 : 8;
  return (goalkeeperRating(id) ?? 0) >= 75 ? Math.min(count, 4) : count;
}
export function scoringTargets(id: number): number[] {
  if ((goalkeeperRating(id) ?? 0) >= 75 && scoringTargetCount(id) === 4) {
    return [0, 1, 7, 8].map(lane => {
      for (let turn = 0; turn < id % 4; turn++) lane = 3 * (lane % 3) + 2 - Math.floor(lane / 3);
      return lane;
    });
  }
  const steps = [1, 2, 4, 5, 7, 8];
  const start = id % 9;
  const step = steps[Math.floor(id / 9) % 6];
  return Array.from({ length: scoringTargetCount(id) }, (_, i) => (start + i * step) % 9);
}
export function canReach(keeperId: number, shooterId: number): boolean {
  return (goalkeeperRating(keeperId) ?? -1) >= 75 && scoringTargetCount(shooterId) >= 4;
}
export function adjacent(first: number, second: number): boolean {
  return first !== second && first >= 0 && first <= 8 && second >= 0 && second <= 8 &&
    Math.abs(first % 3 - second % 3) <= 1 &&
    Math.abs(Math.floor(first / 3) - Math.floor(second / 3)) <= 1;
}
export function encodePick(id: number): Uint8Array {
  const b = new Uint8Array(5);
  b[0] = 4;
  new DataView(b.buffer).setUint32(1, id, true);
  return b;
}
export function encodeShot(lane: number): Uint8Array { return Uint8Array.of(2, lane); }
async function sha(bytes: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(bytes)));
}
export async function encodePickCommit(round: number, id: number, salt: Uint8Array): Promise<Uint8Array> {
  const preimage = new Uint8Array(38);
  preimage[0] = 0x50; preimage[1] = round;
  new DataView(preimage.buffer).setUint32(2, id, true);
  preimage.set(salt, 6);
  const move = new Uint8Array(33);
  move[0] = 5; move.set(await sha(preimage), 1);
  return move;
}
export function encodePickReveal(id: number, salt: Uint8Array): Uint8Array {
  const b = new Uint8Array(37);
  b[0] = 6; new DataView(b.buffer).setUint32(1, id, true); b.set(salt, 5);
  return b;
}
export async function encodeCommit(kick: number, guard: number, reach: number, salt: Uint8Array): Promise<Uint8Array> {
  const preimage = new Uint8Array(36);
  preimage[0] = 0x47; preimage[1] = kick; preimage[2] = guard; preimage[3] = reach;
  preimage.set(salt, 4);
  const move = new Uint8Array(33);
  move[0] = 1; move.set(await sha(preimage), 1);
  return move;
}
export function encodeReveal(guard: number, reach: number, salt: Uint8Array): Uint8Array {
  const b = new Uint8Array(35); b[0] = 3; b[1] = guard; b[2] = reach; b.set(salt, 3); return b;
}
