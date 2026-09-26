import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ParsedBoardState } from '@xayaarcade/sdk';
import { PulseChannel, keeperChoice } from '@/lib/pulse/channel';
import { encodePickCommit } from '@/lib/pulse/codec';

function bytes(hex: string): Uint8Array { return Uint8Array.from(hex.match(/../g) ?? [], x => parseInt(x, 16)); }
function state(encoded: Uint8Array, turn: number): ParsedBoardState {
  return { whoseTurn: () => turn, getEncodedState: () => encoded } as ParsedBoardState;
}
afterEach(() => { vi.unstubAllGlobals(); });
describe('keeper commitment persistence', () => {
  it('persists the hidden first-player selection through reveal and retries', async () => {
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
    const initial = bytes(lines[1]);
    const afterSecondPick = bytes(lines[3].split(' ')[1]);
    const channel = new PulseChannel(52n);
    channel.setPlayerIndex(0);
    channel.setPendingInput({ type: 'pick', kick: 0, shooterId: 184, keeperId: 19465 });
    const committed = await channel.maybeAutoMove(state(initial, 0));
    expect(committed?.[0]).toBe(5);
    channel.setPendingInput({ type: 'pick', kick: 0, shooterId: 1460, keeperId: 1438 });
    expect(await channel.maybeAutoMove(state(initial, 0))).toEqual(committed);
    const reveal = await channel.maybeAutoMove(state(afterSecondPick, 0));
    expect(reveal?.[0]).toBe(6);
    expect(new DataView(reveal!.buffer).getUint32(1, true)).toBe(184);
    expect(new DataView(reveal!.buffer).getUint32(5, true)).toBe(19465);
    expect(await encodePickCommit(0, 184, 19465, reveal!.slice(9))).toEqual(committed);
  });

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
    const afterPair = bytes(lines[4].split(' ')[1]);
    const afterShot = bytes(lines[6].split(' ')[1]);
    const channel = new PulseChannel(42n);
    channel.setPlayerIndex(1);
    channel.setPendingInput({ type: 'guard', kick: 0, lane: 0, reach: 4 });
    const first = await channel.maybeAutoMove(state(afterPair, 1));
    expect(first?.length).toBe(33);
    expect(keeperChoice(42n, 1, 0)).toMatchObject({ lane: 0, reach: 4 });
    channel.setPendingInput({ type: 'guard', kick: 0, lane: 2, reach: 4 });
    const retry = await channel.maybeAutoMove(state(afterPair, 1));
    expect(retry).toEqual(first);
    const reveal = await channel.maybeAutoMove(state(afterShot, 1));
    expect(reveal?.[0]).toBe(3);
    expect(reveal?.[1]).toBe(0);
    expect(reveal?.[2]).toBe(4);
  });
});
