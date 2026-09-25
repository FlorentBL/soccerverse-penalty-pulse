export interface PulseState {
  participants: number;
  phase: 0 | 1 | 2 | 3 | 4;
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
}

export function decodeState(bytes: Uint8Array, participants: number): PulseState | null {
  if (bytes.length !== 78 || bytes[0] !== 1 || bytes[1] !== participants || bytes[2] > 4) return null;
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const winner = v.getInt8(7);
  const used: [number[], number[]] = [
    [v.getUint32(48, true), v.getUint32(52, true), v.getUint32(56, true)],
    [v.getUint32(60, true), v.getUint32(64, true), v.getUint32(68, true)],
  ];
  return {
    participants, phase: bytes[2] as PulseState['phase'], turn: bytes[3], kick: bytes[4],
    goals: [bytes[5], bytes[6]], winner, turnCount: v.getUint16(8, true),
    pendingPlayer: v.getUint32(42, true), pendingLane: bytes[46], lastResult: bytes[47],
    used, lastPlayer: v.getUint32(72, true), lastShot: bytes[76], lastGuard: bytes[77],
  };
}

export function primaryLane(id: number): number { return id % 3; }
export function secondaryLane(id: number): number { return (primaryLane(id) + 1 + Math.floor(id / 3) % 2) % 3; }
export function encodePick(id: number): Uint8Array {
  const b = new Uint8Array(5);
  b[0] = 4;
  new DataView(b.buffer).setUint32(1, id, true);
  return b;
}
export function encodeShot(lane: number): Uint8Array {
  return Uint8Array.of(2, lane);
}

export async function encodeCommit(kick: number, guard: number, salt: Uint8Array): Promise<Uint8Array> {
  const preimage = new Uint8Array(34);
  preimage[0] = kick; preimage[1] = guard; preimage.set(salt, 2);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', preimage));
  const move = new Uint8Array(33);
  move[0] = 1; move.set(digest, 1);
  return move;
}
export function encodeReveal(guard: number, salt: Uint8Array): Uint8Array {
  const b = new Uint8Array(34); b[0] = 3; b[1] = guard; b.set(salt, 2); return b;
}
