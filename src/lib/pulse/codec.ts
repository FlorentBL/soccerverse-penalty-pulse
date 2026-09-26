import { shootingRating } from './shooting-data';
import { goalkeeperRating } from './goalkeeping-data';
export { shootingRating } from './shooting-data';
export { goalkeeperRating } from './goalkeeping-data';
export { isCentreForward, isGoalkeeper } from './positions-data';

export interface PulseState {
  participants: number;
  phase: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  turn: number;
  kick: number;
  goals: [number, number];
  winner: number;
  turnCount: number;
  pendingShooter: number;
  pendingKeeper: number;
  pendingLane: number;
  lastResult: number;
  usedShooters: [number[], number[]];
  usedKeepers: [number[], number[]];
  lastPlayer: number;
  lastKeeper: number;
  lastShot: number;
  lastGuard: number;
  pairShooters: [number, number];
  pairKeepers: [number, number];
  lastReach: number;
}

export function decodeState(bytes: Uint8Array, participants: number): PulseState | null {
  if (bytes.length !== 159 || bytes[0] !== 6 || bytes[1] !== participants || bytes[2] > 6 || bytes[2] === 5) return null;
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const usedShooters: [number[], number[]] = [0, 1].map(seat =>
    Array.from({ length: 5 }, (_, shot) => v.getUint32(48 + 4 * (seat * 5 + shot), true))) as [number[], number[]];
  const usedKeepers: [number[], number[]] = [0, 1].map(seat =>
    Array.from({ length: 5 }, (_, shot) => v.getUint32(111 + 4 * (seat * 5 + shot), true))) as [number[], number[]];
  return {
    participants, phase: bytes[2] as PulseState['phase'], turn: bytes[3], kick: bytes[4],
    goals: [bytes[5], bytes[6]], winner: v.getInt8(7), turnCount: v.getUint16(8, true),
    pendingShooter: v.getUint32(42, true), pendingKeeper: v.getUint32(151, true), pendingLane: bytes[46], lastResult: bytes[47],
    usedShooters, usedKeepers, lastPlayer: v.getUint32(88, true), lastKeeper: v.getUint32(155, true), lastShot: bytes[92], lastGuard: bytes[93],
    pairShooters: [v.getUint32(94, true), v.getUint32(98, true)], pairKeepers: [v.getUint32(103, true), v.getUint32(107, true)], lastReach: bytes[102],
  };
}

export function ratingTier(rating: number | null): number {
  return rating !== null && rating >= 90 && rating <= 100 ? 0 : rating !== null && rating >= 80 && rating < 90 ? 1 :
    rating !== null && rating >= 70 && rating < 80 ? 2 : rating !== null && rating >= 60 && rating < 70 ? 3 :
    rating !== null && rating >= 55 && rating < 60 ? 4 : -1;
}
export function tierUsed(ids: number[], id: number, role: 'shoot' | 'save'): boolean {
  const rating = role === 'shoot' ? shootingRating : goalkeeperRating;
  const tier = ratingTier(rating(id));
  return ids.some(previous => previous !== 0 && ratingTier(rating(previous)) === tier);
}
export function scoringTargetCount(id: number): number {
  const rating = shootingRating(id);
  if (rating === null || goalkeeperRating(id) === null) return 0;
  const count = rating < 55 ? 2 : rating < 60 ? 3 : rating < 65 ? 4 :
    rating < 70 ? 5 : rating < 80 ? 6 : rating < 90 ? 7 : 8;
  return count;
}
export function scoringTargets(id: number): number[] {
  const steps = [1, 2, 4, 5, 7, 8];
  const start = id % 9;
  const step = steps[Math.floor(id / 9) % 6];
  return Array.from({ length: scoringTargetCount(id) }, (_, i) => (start + i * step) % 9);
}
export function canReach(keeperId: number, shooterId: number): boolean {
  const rating = goalkeeperRating(keeperId) ?? -1;
  const targets = scoringTargetCount(shooterId);
  return rating >= 80 ? targets >= 5 : rating >= 70 ? targets >= 6 : rating >= 60 ? targets >= 8 : false;
}
export function adjacent(first: number, second: number): boolean {
  return first !== second && first >= 0 && first <= 8 && second >= 0 && second <= 8 &&
    Math.abs(first % 3 - second % 3) <= 1 &&
    Math.abs(Math.floor(first / 3) - Math.floor(second / 3)) <= 1;
}
export function edgeAdjacent(first: number, second: number): boolean {
  return adjacent(first, second) &&
    ((first % 3 === second % 3) !== (Math.floor(first / 3) === Math.floor(second / 3)));
}
export function validReach(keeperId: number, shooterId: number, first: number, second: number): boolean {
  if (first < 0 || first > 8) return false;
  if (!canReach(keeperId, shooterId)) return second === 255;
  if (second < 0 || second > 8 || second === first) return false;
  return (goalkeeperRating(keeperId) ?? 0) >= 90 ? adjacent(first, second) : edgeAdjacent(first, second);
}
export function encodeShooter(shooter: number): Uint8Array {
  const b = new Uint8Array(5);
  b[0] = 4; new DataView(b.buffer).setUint32(1, shooter, true);
  return b;
}
export function encodeKeeper(keeper: number): Uint8Array {
  const b = new Uint8Array(5);
  b[0] = 5; new DataView(b.buffer).setUint32(1, keeper, true);
  return b;
}
export function encodeShot(lane: number): Uint8Array { return Uint8Array.of(2, lane); }
async function sha(bytes: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(bytes)));
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
