import type { ArcadeChannel, BoardMoveBytes, ParsedBoardState } from '@xayaarcade/sdk';
import { adjacent, canReach, decodeState, encodeCommit, encodePick, encodePickCommit, encodePickReveal, encodeReveal, encodeShot } from './codec';

export type PulseInput = { type: 'pick'; kick: number; playerId: number } |
  { type: 'guard'; kick: number; lane: number; reach: number } |
  { type: 'shot'; kick: number; lane: number };
interface GuardSecret { lane: number; reach: number; salt: number[] }
interface PickSecret { playerId: number; salt: number[] }
function key(kind: string, channelId: bigint | null, seat: number, kick: number): string {
  return 'penaltypulse:' + kind + ':' + String(channelId) + ':' + seat + ':' + kick;
}
function validSalt(value: unknown): value is number[] {
  return Array.isArray(value) && value.length === 32 &&
    value.every(n => Number.isInteger(n) && n >= 0 && n < 256);
}
function readGuard(channelId: bigint | null, seat: number, kick: number): GuardSecret | null {
  try {
    const value = localStorage.getItem(key('guard', channelId, seat, kick));
    if (!value) return null;
    const secret = JSON.parse(value) as GuardSecret;
    if (!Number.isInteger(secret.lane) || secret.lane < 0 || secret.lane > 8 ||
        !Number.isInteger(secret.reach) || secret.reach !== 255 && !adjacent(secret.lane, secret.reach) ||
        !validSalt(secret.salt)) return null;
    return secret;
  } catch { return null; }
}
function readPick(channelId: bigint | null, seat: number, kick: number): PickSecret | null {
  try {
    const value = localStorage.getItem(key('pick', channelId, seat, kick));
    if (!value) return null;
    const secret = JSON.parse(value) as PickSecret;
    return Number.isInteger(secret.playerId) && secret.playerId > 0 &&
      secret.playerId <= 523571 && validSalt(secret.salt) ? secret : null;
  } catch { return null; }
}
export function keeperChoice(channelId: bigint | null, seat: number, kick: number): GuardSecret | null {
  return readGuard(channelId, seat, kick);
}
export class PulseChannel implements ArcadeChannel {
  private seat = -1;
  private pending: PulseInput | null = null;
  constructor(private readonly channelId: bigint | null) {}
  setPlayerIndex(index: number): void { this.seat = index; }
  setPendingInput(input: unknown): void {
    if (!input || typeof input !== 'object') return;
    const p = input as PulseInput;
    if ((p.type === 'guard' || p.type === 'shot' || p.type === 'pick') &&
        Number.isInteger(p.kick) && p.kick >= 0 && p.kick < 254 &&
        (p.type === 'pick' ? Number.isInteger(p.playerId) && p.playerId > 0 && p.playerId <= 523571 :
          Number.isInteger(p.lane) && p.lane >= 0 && p.lane <= 8) &&
        (p.type !== 'guard' || Number.isInteger(p.reach) &&
          (p.reach === 255 || adjacent(p.lane, p.reach))))
      this.pending = p;
  }
  async maybeAutoMove(state: ParsedBoardState): Promise<BoardMoveBytes | null> {
    if (state.whoseTurn() !== this.seat) return null;
    const game = decodeState(state.getEncodedState(), 2);
    if (!game) return null;
    if (game.phase === 2) {
      const secret = readPick(this.channelId, this.seat, game.kick);
      return secret ? encodePickReveal(secret.playerId, new Uint8Array(secret.salt)) : null;
    }
    if (game.phase === 5) {
      const secret = readGuard(this.channelId, this.seat, game.kick);
      return secret ? encodeReveal(secret.lane, secret.reach, new Uint8Array(secret.salt)) : null;
    }
    if (!this.pending || this.pending.kick !== game.kick) return null;
    const input = this.pending;
    this.pending = null;
    if (game.phase === 0 && this.seat === 0 && input.type === 'pick') {
      let secret = readPick(this.channelId, this.seat, game.kick);
      if (!secret) {
        const salt = new Uint8Array(32); crypto.getRandomValues(salt);
        secret = { playerId: input.playerId, salt: [...salt] };
        try { localStorage.setItem(key('pick', this.channelId, this.seat, game.kick), JSON.stringify(secret)); }
        catch { return null; }
      }
      return encodePickCommit(Math.floor(game.kick / 2), secret.playerId, new Uint8Array(secret.salt));
    }
    if (game.phase === 1 && this.seat === 1 && input.type === 'pick') return encodePick(input.playerId);
    if (game.phase === 3 && input.type === 'guard') {
      const shooter = game.pairPlayers[game.kick % 2];
      const keeper = game.pairPlayers[1 - game.kick % 2];
      if (canReach(keeper, shooter) ? !adjacent(input.lane, input.reach) : input.reach !== 255) return null;
      let secret = readGuard(this.channelId, this.seat, game.kick);
      if (!secret) {
        const salt = new Uint8Array(32); crypto.getRandomValues(salt);
        secret = { lane: input.lane, reach: input.reach, salt: [...salt] };
        try { localStorage.setItem(key('guard', this.channelId, this.seat, game.kick), JSON.stringify(secret)); }
        catch { return null; }
      }
      return encodeCommit(game.kick, secret.lane, secret.reach, new Uint8Array(secret.salt));
    }
    if (game.phase === 4 && input.type === 'shot') return encodeShot(input.lane);
    return null;
  }
}
