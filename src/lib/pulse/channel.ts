import type { ArcadeChannel, BoardMoveBytes, ParsedBoardState } from '@xayaarcade/sdk';
import { decodeState, encodeCommit, encodePick, encodePickCommit, encodePickReveal, encodeReveal, encodeShot, goalkeeperRating, ratingTier, shootingRating, tierUsed, validReach } from './codec';

export type PulseInput = { type: 'pick'; kick: number; shooterId: number; keeperId: number } |
  { type: 'guard'; kick: number; lane: number; reach: number } |
  { type: 'shot'; kick: number; lane: number };
interface GuardSecret { lane: number; reach: number; salt: number[] }
interface PickSecret { shooterId: number; keeperId: number; salt: number[] }
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
        !Number.isInteger(secret.reach) || secret.reach !== 255 &&
          (secret.reach < 0 || secret.reach > 8 || secret.reach === secret.lane) ||
        !validSalt(secret.salt)) return null;
    return secret;
  } catch { return null; }
}
function readPick(channelId: bigint | null, seat: number, kick: number): PickSecret | null {
  try {
    const value = localStorage.getItem(key('pick', channelId, seat, kick));
    if (!value) return null;
    const secret = JSON.parse(value) as PickSecret;
    return Number.isInteger(secret.shooterId) && secret.shooterId > 0 && secret.shooterId <= 523571 &&
      Number.isInteger(secret.keeperId) && secret.keeperId > 0 && secret.keeperId <= 523571 &&
      secret.shooterId !== secret.keeperId && validSalt(secret.salt) ? secret : null;
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
        (p.type === 'pick' ? Number.isInteger(p.shooterId) && p.shooterId > 0 && p.shooterId <= 523571 &&
          Number.isInteger(p.keeperId) && p.keeperId > 0 && p.keeperId <= 523571 && p.shooterId !== p.keeperId :
          Number.isInteger(p.lane) && p.lane >= 0 && p.lane <= 8) &&
        (p.type !== 'guard' || Number.isInteger(p.reach) &&
          (p.reach === 255 || p.reach >= 0 && p.reach <= 8 && p.reach !== p.lane)))
      this.pending = p;
  }
  async maybeAutoMove(state: ParsedBoardState): Promise<BoardMoveBytes | null> {
    if (state.whoseTurn() !== this.seat) return null;
    const game = decodeState(state.getEncodedState(), 2);
    if (!game) return null;
    if (game.phase === 2) {
      const secret = readPick(this.channelId, this.seat, game.kick);
      return secret ? encodePickReveal(secret.shooterId, secret.keeperId, new Uint8Array(secret.salt)) : null;
    }
    if (game.phase === 5) {
      const secret = readGuard(this.channelId, this.seat, game.kick);
      return secret && validReach(game.pairKeepers[this.seat], game.pairShooters[1 - this.seat], secret.lane, secret.reach)
        ? encodeReveal(secret.lane, secret.reach, new Uint8Array(secret.salt)) : null;
    }
    if (!this.pending || this.pending.kick !== game.kick) return null;
    const input = this.pending;
    this.pending = null;
    if (game.phase === 0 && this.seat === 0 && input.type === 'pick') {
      if (ratingTier(shootingRating(input.shooterId)) < 0 || ratingTier(goalkeeperRating(input.keeperId)) < 0 ||
          tierUsed(game.usedShooters[this.seat], input.shooterId, 'shoot') ||
          tierUsed(game.usedKeepers[this.seat], input.keeperId, 'save')) return null;
      let secret = readPick(this.channelId, this.seat, game.kick);
      if (!secret) {
        const salt = new Uint8Array(32); crypto.getRandomValues(salt);
        secret = { shooterId: input.shooterId, keeperId: input.keeperId, salt: [...salt] };
        try { localStorage.setItem(key('pick', this.channelId, this.seat, game.kick), JSON.stringify(secret)); }
        catch { return null; }
      }
      return encodePickCommit(Math.floor(game.kick / 2), secret.shooterId, secret.keeperId, new Uint8Array(secret.salt));
    }
    if (game.phase === 1 && this.seat === 1 && input.type === 'pick') {
      if (ratingTier(shootingRating(input.shooterId)) < 0 || ratingTier(goalkeeperRating(input.keeperId)) < 0 ||
          tierUsed(game.usedShooters[this.seat], input.shooterId, 'shoot') ||
          tierUsed(game.usedKeepers[this.seat], input.keeperId, 'save')) return null;
      return encodePick(input.shooterId, input.keeperId);
    }
    if (game.phase === 3 && input.type === 'guard') {
      const shooter = game.pairShooters[game.kick % 2];
      const keeper = game.pairKeepers[1 - game.kick % 2];
      if (!validReach(keeper, shooter, input.lane, input.reach)) return null;
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
