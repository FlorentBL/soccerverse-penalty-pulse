import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { decodeState, encodeCommit, encodePick, encodeReveal, encodeShot, scoringTargets } from '@/lib/pulse/codec';

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
  const out = api.arcade_alloc(78);
  new Uint8Array(api.memory.buffer).set(input, p);
  const n = kind === 'initial' ? api.arcade_initial_state(arg, p, input.length, out, 78) :
    kind === 'apply' ? api.arcade_apply_move(arg, p, input.length, out, 78) :
      api.arcade_resolve_timeout(arg, seat, out, 78);
  const value = n < 0 ? null : new Uint8Array(new Uint8Array(api.memory.buffer).slice(out, out + n));
  api.arcade_free(p, input.length); api.arcade_free(out, 78);
  return value;
}
function parse(api: Judge, state: Uint8Array, seats = 2): number {
  const p = api.arcade_alloc(state.length);
  new Uint8Array(api.memory.buffer).set(state, p);
  const h = api.arcade_parse_state(seats, p, state.length);
  api.arcade_free(p, state.length);
  return h;
}
describe('Penalty Pulse WASM judge', () => {
  it('replays native early finish and sudden-death traces byte for byte', async () => {
    const lines = readFileSync(resolve(__dirname, '../fixtures/native-trace.txt'), 'utf8').trim().split('\n');
    const api = await judge();
    for (let mode = 0; mode < 2; ++mode) {
      expect(lines.shift()).toBe('mode ' + mode);
      let state: Uint8Array = call(api, 'initial', 2)!;
      expect(hex(state)).toBe(lines.shift());
      for (let i = 0; i < (mode === 0 ? 16 : 32); ++i) {
        const [moveHex, stateHex] = lines.shift()!.split(' ');
        const h = parse(api, state);
        expect(h).toBeGreaterThan(0);
        expect(api.arcade_is_valid(h)).toBe(1);
        state = call(api, 'apply', h, bytes(moveHex))!;
        api.arcade_release(h);
        expect(hex(state)).toBe(stateHex);
      }
      const final = decodeState(state, 2)!;
      expect(final.phase).toBe(4);
      expect(final.winner).toBe(0);
      expect(final.kick).toBe(mode === 0 ? 4 : 8);
    }
  });
  it('rejects malformed config, states, moves and invalid reveals; resolves a timeout', async () => {
    const api = await judge();
    expect(call(api, 'initial', 2, Uint8Array.of(1))).toBeNull();
    const state = call(api, 'initial', 2)!;
    expect(parse(api, state.slice(0, 77))).toBe(0);
    const forged = state.slice(); forged[4] = 99;
    const bad = parse(api, forged);
    expect(bad).toBeGreaterThan(0); expect(api.arcade_is_valid(bad)).toBe(0); api.arcade_release(bad);
    const h = parse(api, state);
    expect(call(api, 'apply', h, Uint8Array.of(2, 1))).toBeNull();
    expect(call(api, 'apply', h, Uint8Array.of(1))).toBeNull();
    const timeout = call(api, 'timeout', h, new Uint8Array(), 0)!;
    expect(decodeState(timeout, 2)?.winner).toBe(1);
    api.arcade_release(h);
  });
  it('applies the pinned shooting tiers to goals and wide shots', async () => {
    const api = await judge();
    for (const [id, lane, result] of [
      [1100, scoringTargets(1100)[7], 1],
      [1, [0, 1, 2, 3, 4, 5, 6, 7, 8].find(n => !scoringTargets(1).includes(n))!, 3],
    ]) {
      let state = call(api, 'initial', 2)!;
      const guard = (lane + 1) % 9;
      const salt = Uint8Array.from({ length: 32 }, (_, n) => n + 1);
      for (const move of [encodePick(id), await encodeCommit(0, guard, salt), encodeShot(lane), encodeReveal(guard, salt)]) {
        const handle = parse(api, state);
        state = call(api, 'apply', handle, move)!;
        api.arcade_release(handle);
        expect(state).not.toBeNull();
      }
      expect(decodeState(state, 2)?.lastResult).toBe(result);
    }
  });
});
