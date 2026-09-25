# WASM: shipping the same rules to the browser and to the referee

A channel game is only trustworthy if the browser and the referee compute the **same
state from the same ordered moves**. Both paths in this skill get there by compiling the
game's C++ rules to WebAssembly rather than hand-porting them to TypeScript, because a
hand-port is a second implementation and a second implementation eventually disagrees.

The two paths use different toolchains and produce different artifacts, and this file
covers both:

| You are… | Read |
|---|---|
| building for the hosted Xaya Arcade | **§A: the rules blob.** One zero-import `rules.wasm` reactor exposing the `arcade_*` ABI. The host GSP runs it in wasmtime; the SDK runs the same bytes in the browser. You write no GSP and no bindings. |
| building a standalone channel game you host yourself | **§B: the full-channel WASM build.** Your own C++ GSP's board logic, cross-compiled with `libxayagame`'s emscripten support so the browser can replay and verify state proofs itself. |

| Use WASM at all | Don't bother |
|---|---|
| A game channel (off-chain signed states) needs identical state transitions in the browser and at the referee | A fully on-chain game: the GSP owns all logic and the browser only displays state; load the building-persistent-games skill |
| You have C++ rules you want to reuse *exactly*, not re-derive | The logic is trivial enough that a TS port is obviously correct **and** nothing signs its output |
| Disputes/resolutions require the browser to verify a state proof independently | No channel at all |

The channel protocol these plug into is in `SKILL.md` (shared) and `STANDALONE.md`
(self-hosted internals); the Arcade's end-to-end shipping flow is in `ARCADE.md`.

---

# §A: The rules blob (Arcade path)

## A1. What the blob is: a zero-import freestanding reactor

The artifact you ship to the Arcade is a single `blob/rules.wasm`. It is
**content-addressed**: the chain knows it by its sha256 and every node runs exactly those
bytes, so the toolchain is not an implementation detail: it is part of the artifact
(`blob/Dockerfile.blob-builder`'s header says exactly this, and a different wasi-sdk point
release produces a different blob).

Three properties are non-negotiable:

- **Zero imports.** The blob may not import anything: no WASI, no host functions, no
  clock, no randomness, no I/O. It is built with `-mexec-model=reactor`, so it has an
  `_initialize` entry point instead of a `main`, and an undefined symbol is a hard link
  error rather than a silent import (`blob/build-blob.sh`). That link error
  *is* the zero-import discipline: you do not need a separate check to enforce it, you need
  to not reach for `<iostream>`.
- **A fixed export set.** The chain requires the twelve consensus `arcade_*` functions plus
  `_initialize` as a function and `memory` as an exported wasm memory, each present *and*
  of the right kind: the authority is `kRequiredFuncs` in
  `arcade-platform/engine/judge/wasm_judge.cpp` (thirteen entries: the twelve
  `arcade_*` plus `_initialize`, each checked as an exported **function** by `WasmJudge::HasArcadeAbi`),
  with the exported `memory` checked separately in the same function. Not any document. Extra
  exports are harmless to the chain. Two additive ones are worth having
  (`arcade_share_weights`, `arcade_ejected_mask`); see `ARCADE.md` for what settlement
  falls back to without them, and read that before assuming you can skip the first one,
  because above two seats omitting it *is* a payout decision.

  **The TypeScript mirror, which is the one you will actually be debugging against.** The
  submission gate walks your wasm in TS, not C++: `REQUIRED_FUNC_EXPORTS` at
  `arcade-platform/submissions/src/wasm-abi.ts` carries the same thirteen names in the
  same order, and it is what rejects your submission. When a build clears your local checks and
  pre-flight still refuses, read that file.

  **A clean pre-flight is not a clean gate, and the difference is whether anything ran your blob.**
  That TS mirror is a static read of the export table and deliberately never instantiates
  untrusted bytes, so it cannot see behaviour. The on-chain registration gate does instantiate
  and call: it runs `arcade_alloc(0)` and refuses a blob that answers `0` or traps. So a submission
  that passes pre-flight can still be refused at registration: `ARCADE.md` §3 step 2 has that
  rule and what to do about it.

  **The signatures, because you cannot write a blob from a list of names.** Payloads cross the
  boundary as linear-memory offsets: the host allocates scratch with `arcade_alloc`, writes input
  bytes there, and passes `(ptr, len)`; outputs go into a host-allocated `(ptr, cap)` buffer it
  reads back. State is **handle-based**: `arcade_parse_state` returns an opaque `i32` handle, every
  query and mutation takes it, and `0` is never a valid handle, it is the parse-failure sentinel.
  Full contract, argument by argument, in `arcade-platform/docs/ARCADE-ABI.md` §§1-2; the memory
  and handle primitives are:

  ```
  arcade_alloc(len: u32) -> ptr: i32      // 0 return is the failure sentinel
  arcade_free(ptr: i32, len: u32) -> ()   // free an arcade_alloc region
  arcade_release(handle: i32) -> ()       // destroy a parsed-state handle

  arcade_parse_state(participants: i32, ptr: i32, len: u32) -> handle: i32  // 0 = reject
  arcade_whose_turn(handle: i32) -> i32   // seat index, or -1 = no turn
  arcade_winner(handle: i32)     -> i32   // -1 undecided, -2 draw, else seat index
  ```

  **The sentinel values are the part to get right first.** `arcade_winner` returning `-1` for
  *undecided* and `-2` for *draw* is a convention, not a deduction: pick them the obvious way round
  and every drawn game is misjudged, on a platform with no self-serve update path (PITFALLS row 74;
  what a draw then does at settlement - the designated closer, the share-weight fallback - is
  `SKILL.md` §5 and `ARCADE.md` §6). The complete set,
  argument by argument, is in `arcade-platform/docs/ARCADE-ABI.md` §§1-3, and: importantly if you
  do not have repo access yet: the same signatures are **public** at
  https://arcade.xaya.io/docs/rules-blob.

  **`arcade_free` and `arcade_release` must be REAL implementations, and this is a trap.** The host
  GSP never calls either: each parsed handle owns its own fuelled wasm instance and the instance is
  dropped whole, so a blob that stubs them out **passes the register gate and every on-chain test
  you can run**. But the SDK's in-browser judge *does* call both, so the stub leaks in the client:
  the game plays correctly for a few turns and then degrades in the browser only
  (`docs/ARCADE-ABI.md`). Implement them properly the first time; nothing on the platform side
  will ever tell you that you did not.
- **Integer-only determinism.** No floats, no wall clock, no unseeded RNG, no hash-map
  iteration order. The same bytes run natively in your tests, in wasmtime at the referee,
  and in V8 in the browser, and a dispute is decided by their byte-for-byte agreement.
  There is no entropy source in the ABI at all.

Compile flags are `-O2 -std=c++17 -fno-exceptions -fno-rtti -mexec-model=reactor -I rules`
(`blob/build-blob.sh`). No exceptions and no RTTI is not a style preference: it is
what keeps the artifact small and its control flow enumerable.

## A2. `blob/build-blob.sh`: the three things that decide the hash

The build runs **inside a container** whose toolchain is pinned by version *and* sha256
(`blob/Dockerfile.blob-builder`: `ARG WASI_SDK_VERSION` / `ARG WASI_SDK_SHA256`, with the
download failing closed if upstream ever moves the bytes under the tag). That is the whole
reason the build is containerised: a host-local `llvm-strip` and the container's have been
measured to disagree by two bytes (`blob/Dockerfile.blob-builder`).

```bash
bash blob/build-blob.sh                 # -> blob/rules.wasm + blob/rules.wasm.sha256
```

`blob/build-blob.sh` names the three things that decide the output hash. Do not change
any of them casually:

1. **The source list, in this order.** Link input order fixes the code layout. Reordering
   the `.cpp` files changes the bytes from identical source.
2. **The strip.** `strip-blob` is one fixed command baked into the builder image:
   `llvm-strip --strip-debug`, a **post-link** pass (`blob/Dockerfile.blob-builder`).
   It is deliberately *not* `-Wl,--strip-debug`: the linker flag rewrites the wasm `name`
   section differently and yields different bytes. Stripping is not cosmetic: wasi-sdk's
   prebuilt sysroot ships DWARF for libc++ and musl, which in the template's blob was 58.5%
   of the unstripped artifact (`blob/MANIFEST.md`), and every byte of it is paid for
   on chain. The strip leaves the `code` section byte-identical: the program that
   adjudicates is unchanged.
3. **The output basename.** The linker records it in the wasm `name` custom section, so
   `-o rules.wasm` and `-o foo.wasm` hash differently. It is pinned to `rules.wasm`, and
   `blob/check-blob.sh` asserts the file it checks is that name (`build-blob.sh`).

After the strip there are no source paths left in the artifact, so the build is
path-independent: the same sources built from two different absolute prefixes agree byte
for byte (`blob/MANIFEST.md`).

**Pin the platform, or the build is broken on Apple Silicon.** `blob/Dockerfile.blob-builder`
is `FROM debian:bookworm-slim` (multi-arch) and then downloads the **x86_64** wasi-sdk
tarball and runs `/opt/wasi-sdk/bin/clang++ --version` as a build step
(`blob/Dockerfile.blob-builder`). On an arm64 host Docker resolves the arm64 base and
the build dies at exactly that verification line. The fix, and what your fork must carry:

- `FROM --platform=linux/amd64 debian:bookworm-slim` in `blob/Dockerfile.blob-builder`;
- `--platform linux/amd64` on **both** the `docker build` and the `docker run` in
  `blob/build-blob.sh`.

Docker Desktop then runs the same pinned x86_64 clang on the same inputs under emulation:
slower, and byte-identical output. The acceptance test is not an argument, it is a run: on
an arm64 host, `bash blob/build-blob.sh` must reproduce the committed
`blob/rules.wasm.sha256`, and `bash blob/check-blob.sh --rebuild` must pass.

**The committed `.sha256` sidecar is the authority, not the file's mtime.** `build-blob.sh`
writes `blob/rules.wasm.sha256` on every build (its `sha256sum` line), and every downstream gate compares
against it. The battery's `blob-fresh` target asserts exactly three things: the blob is
present and non-empty, its sha256 matches the sidecar, and it passes `check-blob.sh`'s
structural gate (`blob/tests/Makefile`). **File mtimes are deliberately not consulted**
(`blob/tests/Makefile`): a git checkout writes sources and artifact in arbitrary
order, so an mtime comparison would call every freshly cloned tree stale. Whether the blob
really matches the sources is proven by the rebuild-and-compare leg, `check-blob.sh
--rebuild`, and by nothing else. Never "fix" a hash mismatch by rewriting the sidecar.

## A3. `blob/check-blob.sh`: the structural gate, the rebuild leg, and the fuel probe

```bash
bash blob/check-blob.sh              # structural gate: fast, no docker
bash blob/check-blob.sh --strict     # + exports outside the known set are FATAL (what CI runs)
bash blob/check-blob.sh --rebuild    # + rebuild from a CLEAN tree and compare hashes
```

The structural gate is a stdlib-only wasm section parser (no `wasm2wat`, no runtime
dependency: it must run anywhere) and asserts five things (`blob/check-blob.sh`):

1. **zero imports**: the consensus rule;
2. **the CONSENSUS export set**: the twelve `arcade_*` names plus `memory` and
   `_initialize`. Only these FAIL when missing. The gate sorts exports into three tiers and
   treats them differently, which is what lets you copy the file into your own game unedited:
   **consensus** (missing = FAIL), **ABI-optional**: `arcade_share_weights`,
   `arcade_ejected_mask`, a distinct tier the ABI itself marks optional (§3) - where missing
   prints a NOTE naming the fallback you just chose, and **house** (`arcade_scripted_move` - a
   helper export the chain never calls and no gate in the template invokes; the determinism legs
   replay the committed `moveHex` of each trace, not this export), likewise a NOTE. Anything
   outside all three is export bloat: reported as a WARN and
   **passing** by default, fatal only under `--strict`. So dropping the template's helper
   exports needs no edit here;
3. **no `.debug_*` sections** - proof the strip policy actually held;
4. **the toolchain fingerprint** - the wasm `producers` and `target_features` custom
   sections must carry the expected literals, so a blob built with
   the wrong compiler is loud rather than silent;
5. **the sha256 matches the sidecar.**

`--rebuild` adds the leg that backs the "you do not have to trust us" promise: it rebuilds
from `git archive HEAD` - **a clean tree, not your working tree** - into a scratch dir and
asserts the bytes hash to the committed value. Building from
`git archive` is the point: it also catches "it only builds because of an uncommitted file".

**The fuel probe.** Every metered export call runs under a fresh fuel budget of
**500,000,000** units, and exhausting it traps, which is a reject
(`arcade-platform/docs/ARCADE-ABI.md` §5 "Fuel", `kFuelCap` in the judge host). Each instance
is bounded at **64 MiB** with one instance and one memory per store (§5 "Memory"), and
`arcade_apply_move` / `arcade_initial_state` / `arcade_resolve_timeout` get a **16384**-byte
output buffer, where a returned length outside `0..16384` - including the `-2` "too small"
answer - is a terminal reject with no retry (§5 "Output buffer"; `kStateOutputCap` in `engine/judge/wasm_judge.hpp` is the
authority, and the template's test host `blob/tests/wasm_host.hpp` hands the blob the same 16384-byte
buffer so the native and wasmtime legs run under the consensus bound). Every bullet in that section
is named rather than line-pinned, because §5 moves whenever the sections above it grow.
A game whose worst reachable call approaches the cap is a
game that wedges under adversarial input, so the number has to be **measured, not assumed**.
`arcade_share_weights` is the exception to the 16384: it gets a **1024**-byte buffer and its
return must be exactly `2 × participants` bytes or the host falls back: `ARCADE.md` §6 owns
that rule and what the fallback costs you.

**Optional performance measurements.** When investigating game capacity, time browser
proof construction/signing/compression separately from native GSP proof verification.
Record the workload, fuel, hardware and pinned runtime so results are comparable.
These timings are optional developer information, never a consensus condition or a
submission requirement. See https://arcade.xaya.io/docs/testing for measurement guidance.

**The runtime is version-pinned, and this is the number you want when native and wasmtime
disagree.** The reference build is wasmtime **46.0.1**, x86-64-linux, installed by version
and sha256 in `docker/Dockerfile.arcaded` and `engine/test/Dockerfile.testenv`
(`arcade-platform/docs/ARCADE-ABI.md`). A different wasmtime version, or a different
ISA, is a consensus re-gate rather than a drop-in swap, so if your native tests and the
judge disagree, check you are comparing against that runtime before you go looking for a bug
in your rules.

`blob/tests/fuel_probe.cpp` measures two shapes against the real blob, under the same pinned
deterministic wasmtime configuration the production judge uses: a **legit** run (the
production cfg, replayed forward to its heaviest state) and an **adversarial** one (a
hand-built state that saturates every bound the packed decoder allows). It links the native
rules core purely to construct the input bytes; every measurement is taken through the raw
`arcade_*` exports on the blob itself. It asserts head-room: the template's probe requires
the worst measured call to be an order of magnitude under the cap
(`EXPECT(mx * 10 < host::kFuelCap)` in `blob/tests/fuel_probe.cpp`), and it deliberately
probes **one seat above** the seat range that game registers: the probe's seat count is
`constexpr int kPlayers = 4` against a registered maximum of 3, both stated at
`blob/tests/fuel_probe.cpp`, so the ceiling it measures bounds every channel the chain
can admit. That constant is yours to maintain: if you widen your seat range, raise it, or
your worst-case number stops being a worst case. Record the resulting table in your fork's
`blob/MANIFEST.md`: nothing else keeps the measurement.

The probe runs as part of the battery, from the repo root:

```bash
bash blob/tests/run-tests.sh   # engine, golden, blob-fresh, packed-determinism, fuel-probe …
```

`run-tests.sh` builds its test image on first use and reuses it thereafter
(`blob/tests/run-tests.sh`): the image is named after the checkout directory and tagged with
the sha256 of `blob/tests/Dockerfile.testenv`, so two forks on one machine never share one
and an edited Dockerfile is rebuilt on the next run. There is no tag to re-derive.

## A4. Authoring your golden traces

**This is the section a new game cannot skip**, and nothing outside your repo will make you
do it. Pre-flight reads the seat range you declare and enforces only that it is
integers with `2 <= min <= max <= MAX_SEATS`, `MAX_SEATS` being 4 in
`arcade-platform/submissions/src/preflight.ts`. It does not replay your blob, it does not
know how many seats you have ever exercised, and a blob that has only ever run at 2 seats
registers a 4-seat range without a murmur. The traces are the only thing standing between
"my rules are deterministic at every seat count I ship" and a hope.

That is the engineering reason, and it is enough: a golden trace is how *you* learn that the
native build, wasmtime and V8 compute the same bytes from the same moves, at every seat count
and every cfg your game admits. A disagreement between those three legs is a consensus bug,
and the trace is what turns it into a failing test instead of a stuck channel. This is the
only page in the skills tree that teaches it.

The template's generator also **cannot** produce a trace for your game as shipped.
`blob/tests/gen_packed_trace.cpp` hardcodes `for (const int numPlayers : {2, 3})` in `main`,
builds every entry through `arcade::scriptedMove(step, turn, mode, numPlayers, …)` in
`buildModeEntry` - a template-game-specific scripted move driver - and its CLI is `--seed --blast
--bombs` (parsed in `main`). For any new game, and for any game shipping more seats than the
template's, getting a trace at all means **editing that C++ file**. That is the work; this is
how to do it.

### What a trace is

A committed JSON file recording **one deterministic play-through per `{mode, numPlayers}`
combination**, produced by the **native** build of your rules and then replayed byte-for-byte
by two other legs: wasmtime inside the test container
(`blob/tests/packed_determinism_test.cpp`, driven by the Makefile's `packed-determinism`
target) and V8 in `e2e/packed-determinism.ts`. Its shape, from the generator's own header and
`buildModeEntry` (`gen_packed_trace.cpp`):

- `steps[0] = { moveHex: "", stateHex: hex(initial state) }`: no move applied yet; this is
  what `arcade_initial_state` must byte-equal;
- `steps[i>0] = { moveHex: hex(the i-th scripted move), stateHex: hex(the state after
  applying it to steps[i-1]'s state) }`;
- `timeouts`: zero or one mid-trace probe `{ atStep, seat, stateHex }`: at a mid-trace
  RUNNING state, eliminate a live non-mover seat via `arcade_resolve_timeout` and record the
  post-elimination bytes;
- `root.cfg`: **the config the trace was generated under, recorded in the file**, so every
  replay leg reads it from there instead of keeping a private copy. A private copy is exactly
  how a leg silently drifts off the cfg the chain registers
  (`gen_packed_trace.cpp`).

`blob/tests/packed_trace*.json` are therefore **outputs, not inputs**. Never hand-edit them;
always regenerate.

### Those file names are the template's shape: a fork renames them

`gen_packed_trace.cpp` → `packed_trace*.json` is the template's pair. `arcade-xayaships`
already carries its own (`blob/tests/gen_ships_trace.cpp` → `blob/tests/ships_trace.json`),
and its mode entries are `{mode, steps, timeouts}` with **no `numPlayers` and no `cfg`**,
because that blob takes neither: it is hard 2-player with an empty cfg
(`gen_ships_trace.cpp`, and `arcade-xayaships/blob/MANIFEST.md`'s Config section
explains why). Everything here that names a file names an *example*. What is **normative** is
the shape: one committed deterministic play-through per scenario, regenerated by your own
generator, replayed by every leg. A game whose traces carry no seat field supplies the seat
counts from its runner instead, as xayaships does in `e2e/ships-determinism.ts`.

### What you must rewrite, and what you must not

The three-leg **comparison** and the Makefile's overall shape are game-agnostic. Almost nothing else
in this leg is: the JSON shape included.

What you must rewrite:

- **`scriptedMove`**: the template game's move format and move *content*. The one function whose
  body is entirely yours.
- **The cfg, in every file that builds one.** The generator, `blob/tests/packed_determinism_test.cpp`
  and `e2e/packed-determinism.ts` each construct a cfg with the template's own field names and
  byte layout. They must all agree with *your* layout, and nothing checks that they do.
- **The Makefile target names**, which carry the template's game name.
- **Your trace's `modes`.** The schema is not just `root.cfg`, `steps[]` and `timeouts[]`: there is
  a top-level `modes` array, and the replay legs iterate it. A trace missing it replays nothing
  while still looking like a valid file.

Write it as a pure function of `(step, whoseTurn, mode, numPlayers)` producing a move your
own `arcade_apply_move` accepts, and make it cover **the interesting shapes of your game**:
a capture, an illegal-then-legal pair, a win, a draw, rather than the same move N times. A
trace of one repeated no-op proves determinism of nothing worth having.

### The seat loop is a literal: make it a parameter

`{2, 3}` is written into the generator's source (`gen_packed_trace.cpp`), and the two
committed vectors come from the Makefile invoking that binary twice with different cfg flags
(`blob/tests/Makefile`). Nothing derives the loop from anything. So the first thing a
fork with a wider seat range does is lift it out: give the generator a `--seats` flag of your
own, pass it from the `gen-trace` target, and now the range is written down in one place
instead of buried in an initializer list.

Write that range down where you will see it again: your fork's `blob/MANIFEST.md`, beside
the fuel table (every count in that file - scenarios, transitions, timeout probes, fuel - is
copied from the generated fixtures and the completed run that produced them, so a fixture added
later means the table is regenerated, never edited by hand), because three things have to agree and **nothing checks them against each
other**: the seats your traces replay, the `kPlayers` your fuel probe measures at
(`blob/tests/fuel_probe.cpp`), and the seat range you declare in the submission (`ARCADE.md` §3
step 6). Nothing you submit through argues with the range you give it. Reading your own
manifest before you fill it in is the whole defence.

### How to regenerate and commit: the whole loop

```bash
# after ANY change to rules/ or to the scripted move driver
bash blob/build-blob.sh                 # rebuild rules.wasm + its committed .sha256
make -f blob/tests/Makefile gen-trace   # regenerate EVERY trace vector
bash blob/tests/run-tests.sh            # native == wasmtime, every cfg vector, fuel under cap
npm run e2e:determinism                 # the V8 leg, replaying both trace files
bash blob/check-blob.sh --rebuild       # the docker leg run-tests.sh cannot run itself
git add blob/rules.wasm blob/rules.wasm.sha256 blob/tests/*trace*.json
```

The traces are **committed artifacts, and a diff in them is a consensus diff**. Reviewing
that diff is how you notice a rules change you did not intend: treat an unexplained trace
diff the way you would treat an unexplained migration.

Generate **more than one cfg vector** if your blob takes a cfg. The template's second vector
(`packed_trace_blast3.json`, produced by the same `gen-trace` target at a different
`--blast`) exists to prove the blob **honours its cfg bytes rather than ignoring them**: a
blob that ignored cfg would produce identical states for both files and the pair would
collide (`blob/tests/Makefile`). See `ARCADE.md` for deriving the cfg suffix you
declare at submission.

### Why the seat range is the trap

Stated plainly: **a seat count that nothing has ever replayed is a channel size nothing has
judged.** The failure is quiet, which is what makes it a trap. Liveness proves nothing here:
the template's `arcade_initial_state` validates the cfg length and never bounds the
participant count (`rules/arcade_core.cpp`, and `MAX_PLAYERS = 4` in
`rules/game/constants.hpp`), so a 4-seat call succeeds happily on a blob whose goldens only
ever ran at 2 and 3 seats. It returns a state. It looks fine. The three engines have simply
never been compared at that seat count, and the first time they disagree is in a real channel
holding a real stake.

So widening a seat range is a code change, not a form field: widen the traces, re-run the
three legs, raise the fuel probe's `kPlayers`, and only then declare the wider range.

---

# §B: The standalone full-channel WASM build

You are here if you run your own GSP. The goal is different from §A: not one small blob
under a frozen ABI, but the **complete channel stack**: `libchannelcore` + `xayautil` +
your board logic: compiled to WASM so the browser can parse states, apply moves and verify
state proofs with the exact code the GSP runs. Verified against `wasm/CMakeLists.txt`,
`wasm/bindings/wasm_bindings.cpp`, `wasm/build.sh`, `docker/Dockerfile.wasm-builder` and
`docker/Dockerfile.libxayagame-wasm` in the frozen pre-split `xaya/xayaman` codebase, which
`EXAMPLES.md` lists as the reference implementation.

## B.1. Architecture: the `XayaGameWasm` CMake package + a prebuilt Docker image

`libxayagame` ships WASM build support in its `wasm/` directory **on `master`** (the module
file is `wasm/XayaGameWasmConfig.cmake.in`, installed into the emscripten sysroot as the
**`XayaGameWasm`** CMake package: that is where `xaya_wasm_setup_target()` is defined; there
is no `XayaWasm.cmake`, and no special `wasm` branch to check out). Check out the **same
pinned commit your native GSP builds from**: a branch tip is a different commit, which is
exactly the native/WASM drift §B.8 calls consensus-fatal. It compiles the **complete
`libchannelcore` + `xayautil`** to WASM, unchanged from native. The only shimmed dependency
is `glog` (its native backend is not worth cross-compiling); everything else - protobuf,
OpenSSL, jsoncpp, secp256k1, eth-utils - is a real cross-compiled library, not a stub.

Build this in **layers**, so the expensive parts are cached in Docker images instead of
rebuilt on every game-source change:

```
libxayagame-wasm:latest          <- emsdk + WASM-compiled deps (protobuf/OpenSSL/
                                    jsoncpp/secp256k1/eth-utils), built once
       │  (docker/Dockerfile.libxayagame-wasm)
       ▼
libxayagame-wasm-<game>:latest   <- + xayautil/channelcore recompiled at the
                                    PINNED libxayagame commit, installed as the
                                    `XayaGameWasm` CMake package into the
                                    emscripten sysroot
       │  (docker/Dockerfile.wasm-builder)
       ▼
<game>-wasm-builder:latest       <- + wasm/ (this game's CMakeLists.txt +
                                    bindings) compiled against that package
                                    -> wasm/build/<game>-channel.{js,wasm}
```

`docker/Dockerfile.libxayagame-wasm` rebuilds *only* `xayautil` + `channelcore` (`emcmake
cmake -B build wasm && cmake --install`) and produces its **own** tag: it never overwrites
the shared `libxayagame-wasm:latest` dep image. Rerun it whenever the pinned libxayagame
commit moves; rerun `wasm/build.sh` (which only touches the top layer) whenever the game C++
changes.

Repo layout:

```
wasm/
├── CMakeLists.txt          # find_package(XayaGameWasm) + this game's sources
├── build.sh                # docker build + docker cp artifacts to public/wasm/
└── bindings/
    └── wasm_bindings.cpp   # Embind JS bindings (game-specific)
docker/
├── Dockerfile.libxayagame-wasm   # rebuild xayautil+channelcore at pinned commit
└── Dockerfile.wasm-builder       # protoc + emcmake + emmake for this game
```

Game source files (`engine/game/*.cpp`, `engine/board/board.cpp`) are compiled **directly**:
no local copies, no fork. The GSP (native) and the browser (WASM) both compile the identical
`.cpp`/`.hpp` out of `engine/`.

## B.2. Dependencies

All cross-compiled to WASM static libraries and installed into the emscripten sysroot as the
`XayaGameWasm` CMake package (found via `find_package(XayaGameWasm REQUIRED)` under
`emcmake`): none of these are hand-rolled shims:

| Library | Purpose |
|---|---|
| Protobuf (full, pinned by the dep image) | Protobuf serialization + reflection: same wire format as native |
| OpenSSL | SHA-256, base64, crypto randomness |
| jsoncpp | JSON serialization |
| secp256k1 (bitcoin-core) | ECDSA |
| eth-utils | Ethereum-style signatures (depends on secp256k1) |

**glog shim** (from `libxayagame/wasm/shims/`, upstream): provides `LOG()` / `CHECK()` /
`VLOG()` macros that discard output and abort on `FATAL`, placed first in the include path to
shadow `glog/logging.h`. This is the *only* non-real dependency.

Because these deps live in prebuilt Docker layers, a game repo does not run a `build-deps.sh`
step itself: it inherits them `FROM libxayagame-wasm-<game>:latest` (or `FROM
libxayagame-wasm:latest` when bootstrapping a new game's own xayautil layer).

## B.3. CMakeLists.txt pattern

Verified, `wasm/CMakeLists.txt` (trimmed):

```cmake
cmake_minimum_required(VERSION 3.14)
project(xayaman-channel-wasm LANGUAGES CXX)
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Resolves automatically under emcmake once XayaGameWasm is installed in the
# sysroot (see docker/Dockerfile.libxayagame-wasm). Gamechannel protos are
# already compiled into channelcore: don't regenerate them.
find_package(XayaGameWasm REQUIRED)

set(ENGINE_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../engine")

# The SAME .cpp files the GSP compiles natively -> bit-identical by
# construction. Integer-only game logic; no floating point, no platform-
# dependent math.
set(XAYAMAN_SOURCES
  "${ENGINE_DIR}/game/state.cpp"
  "${ENGINE_DIR}/game/update.cpp"
  "${ENGINE_DIR}/game/state_hash.cpp"
  "${ENGINE_DIR}/board/board.cpp"
)

# Only this game's generated proto stubs: gamechannel protos (metadata,
# signatures, stateproof, broadcast) are already inside channelcore.
set(PROTO_SOURCES
  "${CMAKE_CURRENT_SOURCE_DIR}/generated/xayaman/proto/boardstate.pb.cc"
  "${CMAKE_CURRENT_SOURCE_DIR}/generated/xayaman/proto/boardmove.pb.cc"
  "${CMAKE_CURRENT_SOURCE_DIR}/generated/xayaman/proto/config.pb.cc"
)

add_executable(xayaman-channel
  ${XAYAMAN_SOURCES}
  ${PROTO_SOURCES}
  bindings/wasm_bindings.cpp
)

target_include_directories(xayaman-channel PRIVATE
  "${ENGINE_DIR}"                              # board/board.hpp, game/*.hpp
  "${CMAKE_CURRENT_SOURCE_DIR}/generated"       # "xayaman/proto/boardstate.pb.h"
)

# Handles glog shim, all dep linking, all Emscripten flags + embind. Second
# arg is the JS module factory name (MODULARIZE output).
xaya_wasm_setup_target(xayaman-channel createXayamanModule)
```

`xaya_wasm_setup_target()` (from the `XayaGameWasm` package) owns *all* library linking and
include paths: a new game's `CMakeLists.txt` only needs its own game sources + game protos,
mirroring the pattern above.

## B.4. Embind bindings

Only `Uint8Array` (serialized protobuf bytes) crosses the JS↔WASM boundary: never raw
structs. Verified surface, `wasm/bindings/wasm_bindings.cpp`: seven free functions, one
class, one constant:

```cpp
// parseState: channel-id hex + serialized ChannelMetadata + serialized
// BoardState bytes in -> a WasmBoardState handle (or null if invalid).
val parseState(const std::string& channelIdHex,
               const val& metadataBytes,   // Uint8Array
               const val& stateBytes);     // Uint8Array

class WasmBoardState {
  int whoseTurn() const;
  unsigned turnCount() const;
  bool isValid() const;
  val applyMove(const val& moveBytes);      // Uint8Array in -> Uint8Array|null out
  std::string getStateJson() const;         // full board for rendering
  unsigned getNetTick() const;
  unsigned getGameTick() const;
  bool getFinished() const;
  int getWinner() const;
};

// State construction and move encoding: the game-specific half.
val initialBoardState(unsigned numPlayers, unsigned seed);
val createInputMove(int playerIdx, int direction, bool placeBomb);

// The proof-chain half: game-agnostic, and the reason the JS side can hand in
// signing/recovery callbacks (the wasm module owns no keys).
bool verifyStateProof(const val& jsVerifier, const std::string& gameId,
                      const std::string& channelIdHex, const val& metadataBytes,
                      const val& reinitStateBytes, const val& proofBytes);
val extendStateProof(const val& jsVerifier, const val& jsSigner,
                     const std::string& signerAddress, const std::string& gameId,
                     const std::string& channelIdHex, const val& metadataBytes,
                     const val& oldProofBytes, const val& moveBytes);
val unverifiedProofEndState(const val& proofBytes);
val getChannelSignatureMessage(const std::string& gameId,
                               const std::string& channelIdHex,
                               const val& metadataBytes,
                               const std::string& topic, const val& dataBytes);

// constant("NO_TURN", ParsedBoardState::NO_TURN)
```

The four proof helpers are exposed for completeness and for Node harnesses: the reference
implementation's browser channel layer reimplements verification in TypeScript
(`src/lib/channel/state-proof.ts`) and does not call them. `src/lib/wasm/wasm-loader.ts`'s
module interface is the TypeScript mirror of this whole block; keep the two in step or a
binding silently goes unreachable.

`getStateJson()` is the one exception that returns rich data (a JSON string, not protobuf
bytes): it is the rendering surface, not something re-fed into the state machine, so no
round-trip fidelity is required.

**`uint64_t` caveat**: Embind maps `uint64_t` → JS `Number`, which loses precision above
2^53. The reference game's state stays in 32-bit ticks and counts (`net_tick`, `game_tick`
are `unsigned`), so this has not bitten, but if your game needs a true 64-bit value (a
bitboard, say) across the boundary, pass it as a hex string and parse it with
`std::stoull(hex, nullptr, 16)` on the C++ side rather than trusting the JS `Number`.

## B.5. TypeScript loader (`<script>` tag + cache-bust)

Emscripten's `MODULARIZE=1` output is a UMD-style script exposing a global factory
(`createXayamanModule`), not an ES module: load it with a `<script>` tag, not `import`.
Verified, `src/lib/wasm/wasm-loader.ts`:

```typescript
function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if ((globalThis as { createXayamanModule?: unknown }).createXayamanModule) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    // Cache-bust: JS glue and .wasm binary must match exactly.
    script.src = src + '?v=' + Date.now();
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
}

export async function loadXayamanWasm(): Promise<XayamanWasmModule> {
  if (cachedModule) return cachedModule;
  await loadScript('/wasm/xayaman-channel.js');
  const createModule = (globalThis as { createXayamanModule?: CreateXayamanModule })
    .createXayamanModule;
  if (typeof createModule !== 'function') {
    throw new Error('createXayamanModule not found after loading script');
  }
  cachedModule = await createModule();
  return cachedModule;
}
```

**CRITICAL: cache-busting.** A stale JS glue file paired with a fresh `.wasm` binary (or vice
versa) throws something like `Import #0 "env": module is not an object or function`: the
glue's expected import table no longer matches the binary. Always suffix the script src with
`?v=<timestamp>` on every deploy so the browser cannot serve a mismatched pair from cache.
This module also memoizes a `loadingPromise` so concurrent callers during app startup share
one load instead of racing separate `<script>` tags.

## B.6. Build + deploy

```bash
# Rebuild the pinned-commit libxayagame WASM layer (only when the upstream
# commit moves -- see the gates in §B.8):
docker build -f docker/Dockerfile.libxayagame-wasm \
  -t libxayagame-wasm-xayaman:latest /path/to/libxayagame-at-pinned-commit

# Rebuild + extract this game's module (fast; run after any engine/ change):
bash wasm/build.sh
# -> writes public/wasm/xayaman-channel.js + public/wasm/xayaman-channel.wasm
```

`wasm/build.sh` does a plain `docker build` (creates **no** network: safe on a shared host)
then `docker create` + `docker cp` the two artifacts out, leaving no running container
behind.

## B.7. The signature bridge

`xaya::SignatureVerifier` / `xaya::SignatureSigner` are abstract C++ interfaces; the WASM
build implements them as thin wrappers around JS callbacks passed in via Embind (verified,
`wasm_bindings.cpp`):

```cpp
class JSSignatureVerifier : public xaya::SignatureVerifier {
  emscripten::val jsRecoverFn;
public:
  explicit JSSignatureVerifier(emscripten::val fn) : jsRecoverFn(std::move(fn)) {}
  std::string RecoverSigner(const std::string& msg,
                             const std::string& sgn) const override {
    return jsRecoverFn(emscripten::val(msg), stringToUint8Array(sgn)).as<std::string>();
  }
};

class JSSignatureSigner : public xaya::SignatureSigner {
  std::string address;
  emscripten::val jsSignFn;
public:
  JSSignatureSigner(const std::string& addr, emscripten::val fn)
    : address(addr), jsSignFn(std::move(fn)) {}
  std::string GetAddress() const override { return address; }
  std::string SignMessage(const std::string& msg) override {
    return uint8ArrayToString(jsSignFn(emscripten::val(msg)));
  }
};
```

Both callbacks are **synchronous**: no Asyncify needed:

| C++ call | JS implementation |
|---|---|
| `RecoverSigner` | `@noble/secp256k1` ecrecover (pure math on the message + signature, no I/O) |
| `SignMessage` | the session-key private key signs directly (no wallet popup: see `STANDALONE.md` for session keys) |

Because neither needs to await a wallet extension or a network call, the WASM module never
needs Emscripten's Asyncify machinery: a real simplification versus bridging, say, a
hardware-wallet signer.

## B.8. The native == WASM gates

The rule that makes any of this worth building: **the same ordered moves must produce
byte-identical state on both sides**, and the full statement of that law, with its
consequences for state serialization, ordering and resync, is homed in the
building-persistent-games skill: load the building-persistent-games skill for the full
section.

What lives here is the two **gates** that continuously prove it for a channel game, because
channel games are the ones that ship the same code to a browser:

| gate | proves |
|---|---|
| `engine/test/determinism_gate.sh` | the pure game sim is byte-identical native (g++) vs WASM (emscripten): sha256 the per-tick output of both over fixed golden scenarios. A copy-me starting point ships with this skill at `scripts/determinism-gate.template.sh`. |
| `engine/test/proto_determinism_gate.sh` | the full proto/channel adapter (`board.cpp`) matches the **prebuilt** WASM artifact over many scenarios (N = 2..4, draw, pickup, stalemate/must-terminate) |

Native (the GSP) and WASM (the browser) **must build from the same pinned `libxayagame`
commit**, and that pin is a declared fact, stated once in the files that build each side
(your `docker/Dockerfile.libxayagame-wasm` layer and the native GSP image) and read from
there by the gate script, never a number repeated in prose. arcade-platform, which builds
the shared host GSP, keeps its own pin beside the patch it applies to that commit
(`docker/patches/README.md`, with the source table in `docs/RUN-FROM-SCRATCH.md`). If they
drift, the two sides can disagree on a state proof's validity and a dispute
becomes **unresolvable, or worse, exploitable**.

Re-run **both** gates after any change to `engine/game/`, `engine/board/board.cpp`, the
protos, or the pinned commit. A **self-play** harness alongside them runs the deterministic
bot on both sides, asserts lockstep state-hash equality every game, and reruns each seed to
assert an identical winner and final-state hash.

Two shapes, one discipline: §A's three-leg trace replay and §B's two gate scripts are the
same idea: you do not *believe* the two engines agree, you compare their bytes on every
build.
