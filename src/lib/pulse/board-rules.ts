import type { BoardRules, ParsedBoardState, BoardStateBytes, BoardMoveBytes, ChannelMetadata, PackedJudge } from '@xayaarcade/sdk';
import { PlaceholderBoardState } from '@xayaarcade/sdk/core';
import { decodeState } from './codec';

class ParsedPulseState implements ParsedBoardState {
  constructor(private judge: PackedJudge, private raw: Uint8Array, private seats: number,
              private turn: number, private count: number, private finished: boolean, private winningSeat: number) {}
  equals(other: BoardStateBytes): boolean {
    return this.raw.length === other.length && this.raw.every((b, i) => b === other[i]);
  }
  whoseTurn(): number { return this.turn; }
  turnCount(): number { return this.count; }
  isFinished(): boolean { return this.finished; }
  winner(): number { return this.winningSeat; }
  async applyMove(move: BoardMoveBytes): Promise<BoardStateBytes | null> {
    return this.judge.withHandle(this.seats, this.raw, h => h.applyMove(move));
  }
  toJson(): Record<string, unknown> { return (decodeState(this.raw, this.seats) ?? {}) as unknown as Record<string, unknown>; }
  getEncodedState(): BoardStateBytes { return this.raw; }
}

export class PulseBoardRules implements BoardRules {
  constructor(private judge: PackedJudge) {}
  parseState(_id: bigint, metadata: ChannelMetadata, encoded: BoardStateBytes): ParsedBoardState | null {
    if (!encoded.length) return new PlaceholderBoardState();
    const seats = metadata.participants.length;
    if (!decodeState(encoded, seats)) return null;
    const scalars = this.judge.withHandle(seats, encoded, h => ({
      turn: h.whoseTurn(), count: h.turnCount(), finished: h.isFinished(), winner: h.winner(),
    }));
    if (!scalars) return null;
    return new ParsedPulseState(this.judge, encoded, seats, scalars.turn, scalars.count, scalars.finished, scalars.winner);
  }
  getProtoVersion(): number { return 1; }
}
