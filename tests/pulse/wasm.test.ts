import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { decodeState, encodeCommit, encodePick, encodePickCommit, encodePickReveal, encodeReveal, encodeShot, scoringTargets } from '@/lib/pulse/codec';

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
describe('Penalty Pulse WASM judge', () => {
  it('replays native early finish and sudden-death traces byte for byte', async () => {
    const lines = readFileSync(resolve(__dirname, '../fixtures/native-trace.txt'), 'utf8').trim().split('\n');
    const api = await judge();
    for (let mode = 0; mode < 2; ++mode) {
      expect(lines.shift()).toBe('mode ' + mode);
      let state: Uint8Array = call(api, 'initial', 2)!;
      expect(hex(state)).toBe(lines.shift());
      for (let i = 0; i < (mode === 0 ? 18 : 36); ++i) {
        const [moveHex, stateHex] = lines.shift()!.split(' ');
        const h = parse(api, state);
        expect(h).toBeGreaterThan(0);
        expect(api.arcade_is_valid(h)).toBe(1);
        state = call(api, 'apply', h, bytes(moveHex))!;
        api.arcade_release(h);
        expect(hex(state)).toBe(stateHex);
      }
      const final = decodeState(state, 2)!;
      expect(final.phase).toBe(6);
      expect(final.winner).toBe(0);
      expect(final.kick).toBe(mode === 0 ? 4 : 8);
    }
  });
  it('rejects malformed config, states, moves and invalid reveals; resolves a timeout', async () => {
    const api = await judge();
    expect(call(api, 'initial', 2, Uint8Array.of(1))).toBeNull();
    const state = call(api, 'initial', 2)!;
    expect(parse(api, state.slice(0, 126))).toBe(0);
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
  it('uses elite goalkeeper reach and separate shooter and keeper in WASM', async () => {
    const api = await judge();
    const salt = Uint8Array.from({ length: 32 }, (_, n) => n + 1);
    async function applyAll(moves: Uint8Array[]): Promise<Uint8Array> {
      let current = call(api, 'initial', 2)!;
      for (const move of moves) {
        const h = parse(api, current);
        const next = call(api, 'apply', h, move);
        api.arcade_release(h);
        expect(next).not.toBeNull();
        current = next!;
      }
      return current;
    }
    const striker = 184, keeper = 19465;
    const target = scoringTargets(striker)[0];
    const primary = (target + 2) % 9;
    const pairMoves = [await encodePickCommit(0, striker, 62, salt), encodePick(874, keeper), encodePickReveal(striker, 62, salt)];
    const caught = await applyAll([...pairMoves, await encodeCommit(0, primary, target, salt),
      encodeShot(target), encodeReveal(primary, target, salt)]);
    expect(decodeState(caught, 2)).toMatchObject({ lastResult: 2, lastReach: target,
      pairShooters: [striker, 874], pairKeepers: [62, keeper] });
    const h = parse(api, caught);
    expect(api.arcade_is_valid(h)).toBe(1);
    api.arcade_release(h);
    const badState = await applyAll(pairMoves);
    const h2 = parse(api, badState);
    expect(call(api, 'apply', h2, encodeShot(target))).toBeNull();
    api.arcade_release(h2);
  });
  it('rejects GK and wing players as shooters and FC players as keepers', async () => {
    const api = await judge();
    const salt = Uint8Array.from({ length: 32 }, (_, n) => n + 3);
    const initial = call(api, 'initial', 2)!;
    const first = parse(api, initial);
    const committed = call(api, 'apply', first, await encodePickCommit(0, 184, 19465, salt))!;
    api.arcade_release(first);
    const second = parse(api, committed);
    expect(call(api, 'apply', second, encodePick(159, 1438))).toBeNull();
    expect(call(api, 'apply', second, encodePick(1460, 1438))).toBeNull();
    expect(call(api, 'apply', second, encodePick(874, 184))).toBeNull();
    expect(call(api, 'apply', second, encodePick(1100, 1438))).toBeNull();
    expect(call(api, 'apply', second, encodePick(874, 22221))).toBeNull();
    expect(call(api, 'apply', second, encodePick(874, 1438))).not.toBeNull();
    api.arcade_release(second);
  });
});
