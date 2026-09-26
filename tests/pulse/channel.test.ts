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
function trace(): string[] {
  return readFileSync(resolve(__dirname, '../fixtures/native-trace.txt'), 'utf8').split('\n');
}
afterEach(() => { vi.unstubAllGlobals(); });
describe('sequential selection and goalkeeper commitment', () => {
  it('allows only a roster shooter, then a roster goalkeeper', async () => {
    const lines = trace();
    const initial = bytes(lines[1]);
    const afterShooter = bytes(lines[2].split(' ')[1]);
    const attacker = new PulseChannel(99n);
    attacker.setPlayerIndex(0);
    attacker.setPendingInput({ type: 'shooter', kick: 0, playerId: 1100 });
    expect(await attacker.maybeAutoMove(state(initial, 0))).toBeNull();
    attacker.setPendingInput({ type: 'shooter', kick: 0, playerId: 184 });
    expect(await attacker.maybeAutoMove(state(initial, 0))).toEqual(Uint8Array.of(4, 184, 0, 0, 0));
    const defender = new PulseChannel(99n);
    defender.setPlayerIndex(1);
    defender.setPendingInput({ type: 'keeper', kick: 0, playerId: 22221 });
    expect(await defender.maybeAutoMove(state(afterShooter, 1))).toBeNull();
    defender.setPendingInput({ type: 'keeper', kick: 0, playerId: 1438 });
    expect(await defender.maybeAutoMove(state(afterShooter, 1))).toEqual(Uint8Array.of(5, 158, 5, 0, 0));
  });
  it('persists the hidden dive and reveals the original lanes after a retry', async () => {
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
    const lines = trace();
    const afterKeeper = bytes(lines[3].split(' ')[1]);
    const afterShot = bytes(lines[5].split(' ')[1]);
    const channel = new PulseChannel(42n);
    channel.setPlayerIndex(1);
    channel.setPendingInput({ type: 'guard', kick: 0, lane: 0, reach: 1 });
    const first = await channel.maybeAutoMove(state(afterKeeper, 1));
    expect(first?.length).toBe(33);
    expect(keeperChoice(42n, 1, 0)).toMatchObject({ lane: 0, reach: 1 });
    channel.setPendingInput({ type: 'guard', kick: 0, lane: 2, reach: 1 });
    expect(await channel.maybeAutoMove(state(afterKeeper, 1))).toEqual(first);
    const reveal = await channel.maybeAutoMove(state(afterShot, 1));
    expect(reveal?.[0]).toBe(3);
    expect(reveal?.[1]).toBe(0);
    expect(reveal?.[2]).toBe(1);
  });
  it('does not send an aim outside the selected shooter’s green zones', async () => {
    const afterCommit = bytes(trace()[4].split(' ')[1]);
    const attacker = new PulseChannel(99n);
    attacker.setPlayerIndex(0);
    attacker.setPendingInput({ type: 'shot', kick: 0, lane: 0 });
    expect(await attacker.maybeAutoMove(state(afterCommit, 0))).toBeNull();
    attacker.setPendingInput({ type: 'shot', kick: 0, lane: 1 });
    expect(await attacker.maybeAutoMove(state(afterCommit, 0))).toEqual(Uint8Array.of(2, 1));
  });
});
