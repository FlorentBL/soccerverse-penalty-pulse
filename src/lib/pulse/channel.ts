import type { ArcadeChannel, BoardMoveBytes, ParsedBoardState } from '@xayaarcade/sdk';
import { decodeState, encodeCommit, encodeKeeper, encodeReveal, encodeShooter, encodeShot, goalkeeperRating, ratingTier, scoringTargets, shootingRating, tierUsed, validReach } from './codec';
import { isRosterShooter, isRosterKeeper } from './players';

export type PulseInput = { type: 'shooter'; kick: number; playerId: number } |
  { type: 'keeper'; kick: number; playerId: number } |
  { type: 'guard'; kick: number; lane: number; reach: number } |
  { type: 'shot'; kick: number; lane: number };
interface GuardSecret { lane: number; reach: number; salt: number[] }
function key(channelId: bigint | null, seat: number, kick: number): string {
  return 'penaltypulse:v5:guard:' + String(channelId) + ':' + seat + ':' + kick;
}
function validSalt(value: unknown): value is number[] {
  return Array.isArray(value) && value.length === 32 &&
    value.every(n => Number.isInteger(n) && n >= 0 && n < 256);
}
function readGuard(channelId: bigint | null, seat: number, kick: number): GuardSecret | null {
  try {
    const value = localStorage.getItem(key(channelId, seat, kick));
    if (!value) return null;
    const secret = JSON.parse(value) as GuardSecret;
    if (!Number.isInteger(secret.lane) || secret.lane < 0 || secret.lane > 8 ||
        !Number.isInteger(secret.reach) || secret.reach !== 255 &&
          (secret.reach < 0 || secret.reach > 8 || secret.reach === secret.lane) ||
        !validSalt(secret.salt)) return null;
    return secret;
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
    if (!Number.isInteger(p.kick) || p.kick < 0 || p.kick >= 254) return;
    if (p.type === 'shooter' ? !isRosterShooter(p.playerId) :
        p.type === 'keeper' ? !isRosterKeeper(p.playerId) :
        (p.type === 'guard' || p.type === 'shot') ?
          !Number.isInteger(p.lane) || p.lane < 0 || p.lane > 8 ||
          (p.type === 'guard' && (!Number.isInteger(p.reach) ||
            (p.reach !== 255 && (p.reach < 0 || p.reach > 8 || p.reach === p.lane)))) : true) return;
    this.pending = p;
  }
  async maybeAutoMove(state: ParsedBoardState): Promise<BoardMoveBytes | null> {
    if (state.whoseTurn() !== this.seat) return null;
    const game = decodeState(state.getEncodedState(), 2);
    if (!game) return null;
    const shooterSeat = game.kick % 2;
    const defenderSeat = 1 - shooterSeat;
    if (game.phase === 4 && this.seat === defenderSeat) {
      const secret = readGuard(this.channelId, this.seat, game.kick);
      return secret && validReach(game.pairKeepers[defenderSeat], game.pairShooters[shooterSeat], secret.lane, secret.reach)
        ? encodeReveal(secret.lane, secret.reach, new Uint8Array(secret.salt)) : null;
    }
    if (!this.pending || this.pending.kick !== game.kick) return null;
    const input = this.pending;
    this.pending = null;
    if (game.phase === 0 && this.seat === shooterSeat && input.type === 'shooter') {
      if (ratingTier(shootingRating(input.playerId)) < 0 ||
          tierUsed(game.usedShooters[this.seat], input.playerId, 'shoot')) return null;
      return encodeShooter(input.playerId);
    }
    if (game.phase === 1 && this.seat === defenderSeat && input.type === 'keeper') {
      if (ratingTier(goalkeeperRating(input.playerId)) < 0 ||
          tierUsed(game.usedKeepers[this.seat], input.playerId, 'save')) return null;
      return encodeKeeper(input.playerId);
    }
    if (game.phase === 2 && this.seat === defenderSeat && input.type === 'guard') {
      const shooter = game.pairShooters[shooterSeat];
      const keeper = game.pairKeepers[defenderSeat];
      if (!validReach(keeper, shooter, input.lane, input.reach)) return null;
      let secret = readGuard(this.channelId, this.seat, game.kick);
      if (!secret) {
        const salt = new Uint8Array(32); crypto.getRandomValues(salt);
        secret = { lane: input.lane, reach: input.reach, salt: [...salt] };
        try { localStorage.setItem(key(this.channelId, this.seat, game.kick), JSON.stringify(secret)); }
        catch { return null; }
      }
      return encodeCommit(game.kick, secret.lane, secret.reach, new Uint8Array(secret.salt));
    }
    if (game.phase === 3 && this.seat === shooterSeat && input.type === 'shot' &&
        scoringTargets(game.pairShooters[shooterSeat]).includes(input.lane)) return encodeShot(input.lane);
    return null;
  }
}
