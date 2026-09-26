import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { decodeState, encodeCommit, encodeKeeper, encodeReveal, encodeShooter, encodeShot, scoringTargets } from '@/lib/pulse/codec';

interface Judge {
  memory: WebAssembly.Memory;
  _initialize(): void;
  arcade_alloc(n: number): number;
  arcade_free(p: number, n: number): void;
  arcade_initial_state(seats: number, cfg: number, n: number, out: number, cap: number): number;
  arcade_parse_state(seats: number, p: number, n: number): number;
  arcade_release(h: number): void;
  arcade_is_valid(h: number): number;
  arcade_whose_turn(h: number): number;
  arcade_turn_count(h: number): number;
  arcade_is_finished(h: number): number;
  arcade_winner(h: number): number;
  arcade_apply_move(h: number, p: number, n: number, out: number, cap: number): number;
  arcade_resolve_timeout(h: number, seat: number, out: number, cap: number): number;
}
function hex(b: Uint8Array): string { return [...b].map(x => x.toString(16).padStart(2, '0')).join(''); }
function bytes(h: string): Uint8Array { return Uint8Array.from(h.match(/../g) ?? [], x => parseInt(x, 16)); }
async function judge(): Promise<Judge> {
  const blob = readFileSync(resolve(__dirname, '../../blob/rules.wasm'));
  const { instance } = await WebAssembly.instantiate(blob, {});
  const api = instance.exports as unknown as Judge;
  api._initialize();
  return api;
}
function call(api: Judge, kind: 'initial' | 'apply' | 'timeout', arg: number, input: Uint8Array = new Uint8Array(), seat = 0): Uint8Array | null {
  const p = api.arcade_alloc(input.length);
  const out = api.arcade_alloc(127);
  new Uint8Array(api.memory.buffer).set(input, p);
  const n = kind === 'initial' ? api.arcade_initial_state(arg, p, input.length, out, 127) :
    kind === 'apply' ? api.arcade_apply_move(arg, p, input.length, out, 127) :
      api.arcade_resolve_timeout(arg, seat, out, 127);
  const value = n < 0 ? null : new Uint8Array(new Uint8Array(api.memory.buffer).slice(out, out + n));
  api.arcade_free(p, input.length); api.arcade_free(out, 127);
  return value;
}
function parse(api: Judge, state: Uint8Array, seats = 2): number {
  const p = api.arcade_alloc(state.length);
  new Uint8Array(api.memory.buffer).set(state, p);
  const h = api.arcade_parse_state(seats, p, state.length);
  api.arcade_free(p, state.length);
  return h;
}
function apply(api: Judge, current: Uint8Array, move: Uint8Array): Uint8Array | null {
  const h = parse(api, current);
  expect(h).toBeGreaterThan(0);
  const next = call(api, 'apply', h, move);
  api.arcade_release(h);
  return next;
}
describe('Penalty Pulse WASM judge', () => {
  it('replays native early finish and sudden-death traces byte for byte', async () => {
    const lines = readFileSync(resolve(__dirname, '../fixtures/native-trace.txt'), 'utf8').trim().split('\n');
    const api = await judge();
    for (let mode = 0; mode < 2; ++mode) {
      expect(lines.shift()).toBe('mode ' + mode);
      let state: Uint8Array = call(api, 'initial', 2)!;
      expect(hex(state)).toBe(lines.shift());
      for (let i = 0; i < (mode === 0 ? 20 : 40); ++i) {
        const [moveHex, stateHex] = lines.shift()!.split(' ');
        const h = parse(api, state);
        expect(h).toBeGreaterThan(0);
        expect(api.arcade_is_valid(h)).toBe(1);
        state = call(api, 'apply', h, bytes(moveHex))!;
        api.arcade_release(h);
        expect(hex(state)).toBe(stateHex);
      }
      expect(decodeState(state, 2)).toMatchObject({ phase: 6, winner: 0, kick: mode === 0 ? 4 : 8 });
    }
  });
  it('rejects malformed config, states, moves and resolves a timeout', async () => {
    const api = await judge();
    expect(call(api, 'initial', 2, Uint8Array.of(1))).toBeNull();
    const state = call(api, 'initial', 2)!;
    expect(parse(api, state.slice(0, 126))).toBe(0);
    const forged = state.slice(); forged[4] = 99;
    const bad = parse(api, forged);
    expect(bad).toBeGreaterThan(0); expect(api.arcade_is_valid(bad)).toBe(0); api.arcade_release(bad);
    const h = parse(api, state);
    expect(call(api, 'apply', h, Uint8Array.of(2, 1))).toBeNull();
    const timeout = call(api, 'timeout', h, new Uint8Array(), 0)!;
    expect(decodeState(timeout, 2)?.winner).toBe(1);
    api.arcade_release(h);
  });
  it('chooses one shooter then the opposing keeper and keeps the dive secret', async () => {
    const api = await judge();
    const salt = Uint8Array.from({ length: 32 }, (_, n) => n + 1);
    const initial = call(api, 'initial', 2)!;
    const afterShooter = apply(api, initial, encodeShooter(184))!;
    expect(decodeState(afterShooter, 2)).toMatchObject({ phase: 1, turn: 1, pairShooters: [184, 0] });
    const afterKeeper = apply(api, afterShooter, encodeKeeper(19465))!;
    expect(decodeState(afterKeeper, 2)).toMatchObject({ phase: 2, turn: 1, pairKeepers: [0, 19465] });
    const target = scoringTargets(184)[0];
    const primary = target % 3 < 2 ? target + 1 : target - 1;
    const afterCommit = apply(api, afterKeeper, await encodeCommit(0, primary, target, salt))!;
    expect(decodeState(afterCommit, 2)).toMatchObject({ phase: 3, turn: 0, lastResult: 0 });
    const afterShot = apply(api, afterCommit, encodeShot(target))!;
    expect(decodeState(afterShot, 2)).toMatchObject({ phase: 4, turn: 1, lastResult: 0 });
    const caught = apply(api, afterShot, encodeReveal(primary, target, salt))!;
    expect(decodeState(caught, 2)).toMatchObject({ phase: 0, kick: 1, turn: 1, lastResult: 2,
      lastReach: target, lastPlayer: 184, lastKeeper: 19465, pairShooters: [0, 0], pairKeepers: [0, 0] });
    const badCommit = apply(api, afterKeeper, await encodeCommit(0, 6, 8, salt))!;
    const badShot = apply(api, badCommit, encodeShot(target))!;
    expect(apply(api, badShot, encodeReveal(6, 8, salt))).toBeNull();
  });
  it('rejects wrong positions and players outside the fixed rosters', async () => {
    const api = await judge();
    const initial = call(api, 'initial', 2)!;
    for (const id of [159, 1460, 1100]) expect(apply(api, initial, encodeShooter(id))).toBeNull();
    const afterShooter = apply(api, initial, encodeShooter(184))!;
    for (const id of [184, 159, 22221]) expect(apply(api, afterShooter, encodeKeeper(id))).toBeNull();
    expect(apply(api, afterShooter, encodeKeeper(1438))).not.toBeNull();
  });
});
