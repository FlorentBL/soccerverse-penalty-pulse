import type { ArcadeChannel, BoardMoveBytes, ParsedBoardState } from '@xayaarcade/sdk';
import { decodeState, encodeCommit, encodePick, encodeReveal, encodeShot } from './codec';

export type PulseInput = { type: 'pick'; kick: number; playerId: number } |
  { type: 'guard'; kick: number; lane: number } |
  { type: 'shot'; kick: number; lane: number };
interface Secret { lane: number; salt: number[] }
function key(channelId: bigint | null, seat: number, kick: number): string {
  return 'penaltypulse:guard:' + String(channelId) + ':' + seat + ':' + kick;
}
function readSecret(channelId: bigint | null, seat: number, kick: number): Secret | null {
  try {
    const value = localStorage.getItem(key(channelId, seat, kick));
    if (!value) return null;
    const secret = JSON.parse(value) as Secret;
    if (!Number.isInteger(secret.lane) || secret.lane < 0 || secret.lane > 2 ||
        !Array.isArray(secret.salt) || secret.salt.length !== 32 ||
        !secret.salt.every(n => Number.isInteger(n) && n >= 0 && n < 256)) return null;
    return secret;
  } catch { return null; }
}
export function keeperChoice(channelId: bigint | null, seat: number, kick: number): number | null {
  return readSecret(channelId, seat, kick)?.lane ?? null;
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
        Number.isInteger(p.kick) && p.kick >= 0 && p.kick < 6 &&
        (p.type === 'pick' ? Number.isInteger(p.playerId) && p.playerId > 0 && p.playerId <= 523571 :
          Number.isInteger(p.lane) && p.lane >= 0 && p.lane <= 2))
      this.pending = p;
  }
  async maybeAutoMove(state: ParsedBoardState): Promise<BoardMoveBytes | null> {
    if (state.whoseTurn() !== this.seat) return null;
    const game = decodeState(state.getEncodedState(), 2);
    if (!game) return null;
    if (game.phase === 3) {
      const secret = readSecret(this.channelId, this.seat, game.kick);
      return secret ? encodeReveal(secret.lane, new Uint8Array(secret.salt)) : null;
    }
    if (!this.pending || this.pending.kick !== game.kick) return null;
    const input = this.pending;
    this.pending = null;
    if (game.phase === 0 && input.type === 'pick')
      return encodePick(input.playerId);
    if (game.phase === 1 && input.type === 'guard') {
      let secret = readSecret(this.channelId, this.seat, game.kick);
      if (!secret) {
        const salt = new Uint8Array(32);
        crypto.getRandomValues(salt);
        secret = { lane: input.lane, salt: [...salt] };
        try { localStorage.setItem(key(this.channelId, this.seat, game.kick), JSON.stringify(secret)); }
        catch { return null; }
      }
      return encodeCommit(game.kick, secret.lane, new Uint8Array(secret.salt));
    }
    if (game.phase === 2 && input.type === 'shot')
      return encodeShot(input.lane);
    return null;
  }
}
