# Determinism

> **The law.** Given the same genesis state and the same ordered sequence of moves, every node must compute **byte-identical** game state: on
> any machine, any CPU, any build of your GSP, forever.

This is the single home of that law in this skill tree, and it is a law rather than a guideline because nothing else in the system agrees on
anything. The chain agrees on *which moves happened, in what order*. It does not agree on what they mean. Every player's GSP re-derives the world
from those bytes on its own, and there is no vote, no quorum and no arbitration: a node that computes a different world is not "slightly buggy",
it is on a different game. It will show its owner an inventory, a battle result or a balance that nobody else will honour, and - because state is
cumulative and there is no rollback authority - it stays wrong forever, from the first divergent block onward.

The law binds channel games too. A channel game ships the same rules to a browser and to a referee and proves agreement with a pair of
native-versus-WASM gate scripts that sha256 the per-tick output of both builds over fixed scenarios and fail on any difference. That is a *gate*
on this same law, not a different law: load the **building-channel-games** skill and read the "native == WASM gates" section of its WebAssembly
module for those two scripts.

## 1. What the law actually requires

- **State is a pure function of the ordered move sequence.** Everything that function touches is your consensus surface. If a value can differ
  between two machines, it must not reach state.
- **Serialize state and undo data through a schema, not an ad-hoc dump.** The `mover` worked example in `libxayagame` uses protobuf for both
  (`libxayagame/mover/proto/mover.proto`), which is the pattern to copy. Never depend on JSON key ordering or hash-map iteration order for the
  contents of state.
- **No wall-clock time, no external I/O, no unseeded randomness, no floating point** in consensus-relevant math. §2 takes each apart.
- **Invalid moves are logged and skipped, never fatal.** Anyone can send any JSON to your game id. `mover` shows the shape exactly:
  `LOG (WARNING) << "Ignoring invalid move:\n" << obj; continue;` (`libxayagame/mover/logic.cpp`). An abort on bad input is worse than a wrong
  answer: every node aborts identically on the same on-chain move, which halts the game for everyone.
- **Backwards must invert forwards exactly.** Polygon reorgs, so libxayagame calls `ProcessBackwards` with the undo data recorded by
  `ProcessForward` (`libxayagame/xayagame/gamelogic.cpp`) and expects the database to land exactly where it was. Undo data that is
  *nearly* complete produces a node whose state depends on which forks it happened to see: the purest possible violation of the law.

**Two state models, one law.** With the plain `GameLogic` model your state is a serialized blob you hand back each block. With `SQLiteGame` the
state *is* the SQLite database, and undo data is a `sqlite3` session changeset that gets inverted and applied on block detach
(`libxayagame/xayagame/sqlitegame.cpp`, `SQLiteSession` and the inline `sqlite3changeset_invert_strm` call). The law is identical in both; only the surface you
compare changes (§3).

**One honest caveat about protobuf bytes.** Protobuf gives you a stable schema and stable semantics; it does not promise a canonical *encoding*.
The C++ runtime exposes `SetSerializationDeterministic` precisely because deterministic output is opt-in, and `libxayagame`'s own `mover` tests
compare **parsed messages**, not serialized strings, with the comment "to avoid issues due to non-deterministic proto serialisation"
(`libxayagame/mover/logic_tests.cpp`). So: build state out of protobuf, but if you ever hash or byte-compare a serialized state blob, make the
serializer deterministic first or compare a canonical form instead. Two nodes must agree on state *as a value*; that is what the law demands, and
what §3's acceptance test measures.

## 2. The hazards, one at a time

**Floating point.** `float`/`double` are the classic consensus splitter. Intermediate results may be kept in extended precision on x87 targets,
multiply-add may or may not be contracted into a single fused instruction, `-ffast-math` or a different `-O` level licenses the compiler to
reassociate expressions, and `sin`/`exp`/`pow` are not correctly rounded: their last bits differ between libm versions and between platforms.
None of that is a bug in the compiler; all of it is a fork in your game. Use integers, or fixed-point with an explicit format, for anything a
player's outcome depends on. (Fixed-point *technique*: format choice, `fxMul`/`fxDiv` overflow, CORDIC clamping, and the one legal float
boundary at a WASM/JS edge: is homed in the building-channel-games skill's pitfalls, under fixed-point and determinism.)

**Iteration order.** `std::unordered_map`/`unordered_set` iteration order depends on bucket count, insertion history and standard-library
version. Protobuf `map<>` fields are worse: the runtime deliberately does not promise a stable traversal order. So never *iterate* an unordered
container to build state. Sort into a total order first, with an explicit comparator over game-level keys. `taurion_gsp` does exactly this before
picking a prospected resource: it collects candidates into a `std::set` with a comparator over type and coordinate, with the comment "This
ensures a deterministic order beyond what order the areas and resource types are in in the config proto" (`taurion_gsp/src/resourcedist.cpp`).
Two related traps: `std::sort` is not stable, so equal elements may come out in different orders under a different standard library: use
`std::stable_sort` or a comparator that cannot tie; and **SQL is a container too**, so a `SELECT` without an `ORDER BY` that is a *total* order is
exactly as non-deterministic as a hash map. `taurion_gsp` queries characters "ordered by ID to make the result deterministic"
(`taurion_gsp/database/character.hpp`); when your natural sort key can tie, append the row id to break it.

**Uninitialised memory.** A struct field you forgot to initialise reads whatever the allocator last left there: usually the same value on your
box for a whole test run, and something else on someone else's. Padding bytes are the same trap wearing a disguise: two structs that compare equal
field-by-field can have different bytes, so `memcmp`ing or hashing raw struct memory is never a valid state comparison. Initialise everything;
compare and serialize through the schema.

**Locale.** The C locale changes what `printf("%f")`, `std::to_string`, `strtod`, `std::stoi`, `toupper` and any locale-aware collation actually
do: a decimal comma instead of a point, a different case mapping, a different sort order for the same two strings. It is process-wide, and it is
set by the *operator's* environment, which means two honest nodes running your identical binary can disagree because one of them has a different
`LC_ALL`. Keep locale-sensitive conversions out of consensus code entirely: parse move fields as integers, and never round-trip a consensus value
through a formatted string. `libxayagame` gives you `IsIntegerValue` for exactly this, which distinguishes a JSON value that was really parsed
from an integer literal from a float that happens to be integral (`libxayagame/xayautil/jsonutils.hpp`).

**Time.** There is no wall clock in a consensus function. `system_clock::now()`, uptime, timezone, "has an hour passed": all forbidden. What you
*do* have is the block metadata that arrives with each update: the block **height** and the block **timestamp**, which are the same for every node
because they came off the chain. Read them out of `blockData["block"]` and pass them down as your notion of "now": that is what `tfgsp` does,
lifting `height` and `timestamp` from the block metadata into a `Context` before any rule runs (`tfgsp/src/logic.cpp`). Durations become block
counts or timestamp deltas, never measured intervals.

**Randomness.** Unseeded RNG is obviously fatal; seeded-from-anything-local is fatal too. libxayagame hands you a deterministic stream: it derives
a per-block seed by hashing the literal `"block"`, your game id and the block's `rngseed` field, and seeds an `xaya::Random` with it
(`BlockRngSeed` in `libxayagame/xayagame/gamelogic.cpp`). Draw everything from that instance, and use `Random::BranchOff(key)` when independent
subsystems need their own streams that do not perturb each other (`libxayagame/xayautil/random.hpp`). Two rules follow. First, **order of draws is
part of consensus**: if two subsystems consume from the same stream, changing which runs first changes every subsequent number, so branch off
rather than share. Second - and this one is a design constraint, not a determinism bug - on the Polygon path the seed **is the block hash**:
`xayax` fills `rngseed` with the block hash and says so with a `FIXME: Determine proper value for rngseed` (`xayax/eth/ethchain.cpp`). That is
perfectly deterministic and perfectly *predictable*: whoever proposes a block knows it, and can in principle discard a proposal whose randomness
it dislikes. Never let a high-value outcome (rare loot, a wager settlement) hang on that seed alone; take unpredictability from player-supplied
commitments under a commit-reveal discipline instead.

**Pointer values.** Anything derived from an address varies per process: ASLR, allocator behaviour and insertion history all move objects around.
So `std::set<T*>`, `std::map<Foo*, X>`, sorting by pointer, hashing an address, or "iterate the objects in the order they happen to sit in memory"
are all non-deterministic even though nothing looks random. Key and order by a stable game-level identity - the database id, the player name, the
coordinate - never by identity-of-object.

**Integer overflow.** Unsigned wraparound is defined and therefore deterministic; signed overflow is undefined behaviour, and undefined behaviour
is exactly the thing a compiler is allowed to resolve differently at another optimisation level, another version or another architecture. Bound
every accumulator that a player can push upward, and where a wrap really is unreachable, say so in a comment with the arithmetic that makes it
unreachable, so the next reader does not "fix" it into a different consensus. The same discipline applies to anything used as an index or a size:
a value that reaches a bound must be rejected by a rule, not by a crash: §1's invalid-move rule again.

## 3. How to prove it

Reasoning about determinism does not scale; comparing bytes does. Build both suites early, because retrofitting a golden onto a game that has
already drifted means picking which of two histories was the real one.

**Golden replay.** Drive a fixed, deterministic script of moves and heights through your **real** state-update pipeline, then snapshot the full
resulting state as canonical JSON and compare it byte-for-byte against a golden file committed to the repo. `tfgsp` ships this as
`src/goldenreplay_tests.cpp` with its snapshot in `src/goldenreplay.golden.json` (branch `polygon-rewrite`). Three details of that implementation
are worth copying:

- It is a **separate test binary**. Other tests in the same process mutate a global config singleton, and that contamination would make the golden
  order-dependent: the header comment says exactly that, and the build keeps it separate on purpose (`tfgsp/src/Makefile.am`).
- Regeneration is deliberate and awkward: an env flag (`GOLDEN_REGEN`) rewrites the snapshot, and the failure message tells you to regenerate only
  after the change has been reviewed. The Dockerfile states the discipline in one sentence: if the golden goes red after a base-image bump, "that
  is a real consensus change to investigate: never `GOLDEN_REGEN` it away" (`tfgsp/docker/Dockerfile`).
- The actual snapshot is always written next to the golden, so a failure gives you a diff rather than a boolean.
- **The randomness has to be pinned as well as the moves**, or the golden encodes whatever block hashes the test happened to fabricate. `tfgsp`
  names its pins in the test's own header: a regtest chain with no per-block reseed, one fixed-seed test RNG, and an identical move-and-height
  script, and its update path skips the per-block reseed on regtest precisely to hold that property (`tfgsp/src/goldenreplay_tests.cpp`,
  `tfgsp/src/logic.cpp`).

**Reorg round-trip.** A golden proves forward. This proves that backward exactly undoes it. `tfgsp` runs two tiers (`tfgsp/src/Makefile.am`):
`reorg_tests` drives activity at scale through the game's own update entry point and then undoes each block through the same session-changeset
invert-and-apply that `xaya::SQLiteGame` uses, asserting the whole database round-trips exactly; `reorg_game_tests` does it again on the
production path, through a real `xaya::Game` with `BlockAttach`/`BlockDetach`, asserting exact table round-trips **and** fork switching. Do both:
the first isolates your rules, the second catches everything that only appears when the framework is driving.

**Bake both into the image build, so they gate deploys.** Unit tests that a human remembers to run are not a gate on a consensus system. `tfgsp`'s
production Dockerfile builds the daemon and then runs the whole C++ suite - unit tests, the golden replay, and both reorg gates - as a build step,
dumping the test logs and failing the build on any failure (`tfgsp/docker/Dockerfile`). A schema or determinism regression therefore cannot
produce an image at all. This costs build minutes and buys the one property you cannot test for after the fact. Keep the slow chain-level
end-to-end suites outside the image build (they need a forked chain: see FORK-TESTING.md); it is the deterministic, chain-free suites that belong
in it.

**The acceptance test: two independently synced GSPs.** This is the strongest statement of the law, because it is the law itself rather than a
proxy for it. Sync a second GSP - different datadir, ideally a different machine, pointed at its own XayaX - from your game's genesis height, wait
for both to report they are up to date, then compare their state **at the same block hash**. If both nodes are honest and the code is
deterministic, the two states are identical; if they are not, you have found a violation before your players did, and the block hash where they
first differ tells you which block to replay.

Three practical notes on doing it properly:

1. **Compare at the same block, not at the same wall-clock moment.** The state RPC's envelope carries the block hash and height alongside
   `gamestate`; a comparison that ignores the block hash just tells you the two nodes are at different heights. Poll until both report the same
   block hash, then compare.
2. **Compare a surface you control.** Compare the `gamestate` JSON (canonicalise it - sort keys - before diffing, so a serializer's field order is
   not what you are testing), or add libxayagame's `SQLiteHasher`, a processor that SHA256-hashes the non-internal tables of your database and
   records `(block hash, game-state hash)` per block, retrievable with `GetHash` (`libxayagame/xayagame/sqliteproc.hpp`, attached via
   `SQLiteGame::AddProcessor`). A stored per-block hash turns the acceptance test into one cheap comparison per block and gives you the exact
   divergence point for free. What you must **not** compare is raw serialized proto bytes, for the reason in §1.
3. **Vary something between the two nodes.** Two GSPs on one box, from one image, built minutes apart, mostly prove your disk works. Value comes
   from difference: another machine, another CPU generation, a rebuilt image, a different compiler version, and a node that synced from genesis
   compared against one that has been running for months, which is the reorg and pruning path nobody else exercises.

Run it before launch, after any consensus-relevant change, and keep one independently synced node alive afterwards as a permanent tripwire.

## 4. The pitfall row

Carried here from the consolidated list (PITFALLS.md keeps it as row #16) because it is the one-line form of this whole
file:

| # | Pitfall | Fix |
|---|---------|-----|
| 16 | Non-deterministic state (wall-clock, external I/O, unseeded RNG, floats, hash-map or pointer ordering, locale) | Never let any of these touch consensus-relevant state: every node must compute byte-identical results from the same ordered move sequence. Prove it with a golden replay plus a reorg round-trip baked into the image build, and accept it only when two independently synced GSPs agree at the same block hash (§3) |
