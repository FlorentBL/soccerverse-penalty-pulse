import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ParsedBoardState } from '@xayaarcade/sdk';
import { PulseChannel, keeperChoice } from '@/lib/pulse/channel';

function bytes(hex: string): Uint8Array { return Uint8Array.from(hex.match(/../g) ?? [], x => parseInt(x, 16)); }
function state(encoded: Uint8Array, turn: number): ParsedBoardState {
  return { whoseTurn: () => turn, getEncodedState: () => encoded } as ParsedBoardState;
}
afterEach(() => { vi.unstubAllGlobals(); });
describe('keeper commitment persistence', () => {
  it('uses the same secret after a retry and reveals the lane originally committed', async () => {
    vi.stubGlobal('crypto', webcrypto);
    const values = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
      removeItem: (key: string) => { values.delete(key); },
      clear: () => values.clear(),
      key: (index: number) => [...values.keys()][index] ?? null,
      get length() { return values.size; },
    } satisfies Storage);
    const lines = readFileSync(resolve(__dirname, '../fixtures/native-trace.txt'), 'utf8').split('\n');
    const afterPick = bytes(lines[2].split(' ')[1]);
    const afterShot = bytes(lines[4].split(' ')[1]);
    const channel = new PulseChannel(42n);
    channel.setPlayerIndex(1);
    channel.setPendingInput({ type: 'guard', kick: 0, lane: 0 });
    const first = await channel.maybeAutoMove(state(afterPick, 1));
    expect(first?.length).toBe(33);
    expect(keeperChoice(42n, 1, 0)).toBe(0);
    channel.setPendingInput({ type: 'guard', kick: 0, lane: 2 });
    const retry = await channel.maybeAutoMove(state(afterPick, 1));
    expect(retry).toEqual(first);
    const reveal = await channel.maybeAutoMove(state(afterShot, 1));
    expect(reveal?.[0]).toBe(3);
    expect(reveal?.[1]).toBe(0);
  });
});
