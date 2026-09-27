# Ship a game on the Xaya Arcade

Build and test a channel game, then submit it for operator review.

## 0. Authority, where every claim in this file comes from

| Question | Authority |
|---|---|
| The judge ABI: which exports, which caps, what a trap means | `arcade-platform/engine/judge/wasm_judge.cpp` (the register gate's `kRequiredFuncs` list is the ABI, in code) |
| The same contract, written out, with the execution limits | `arcade-platform/docs/ARCADE-ABI.md` |
| Every submission bound: sizes, patterns, seat clamp, reserved names | `arcade-platform/submissions/src/preflight.ts` |
| How a bundle is mounted and what a base path means | `arcade-platform/games-host/src/{bake.ts,handler.ts,server.ts}` |
| Public builder documentation | **https://arcade.xaya.io/docs**: public, no login, no repo access (source: `xaya-arcade/content/docs/`) |

**Read that last one first if you do not have repo access yet.** Four of the five authorities above
are paths inside `arcade-platform`, which is private during the curated phase, but the site's
`/docs` is public and carries the parts you need soonest, in readable form:

| You need | Public page |
|---|---|
| Who to ask for access, and the tooling versions | https://arcade.xaya.io/docs/requirements |
| The clone command, `npm ci`, and a tour of the tree | https://arcade.xaya.io/docs/getting-started |
| **The full `arcade_*` signatures and their sentinel values** | https://arcade.xaya.io/docs/rules-blob |
| `GameAdapter`, `configureApp`, the presentation declaration | https://arcade.xaya.io/docs/sdk |

This skill summarizes the builder workflow. Verify implementation details against the authority
files. Numeric claims must name their authority in the same sentence.

## 1. What the Arcade is: start here with zero access

One shared host GSP runs every game as a sandboxed `rules.wasm` blob under one referee, and one
shell hosts every game UI as a hash-verified static bundle. You write **rules** (C++ → wasm) and a
**board UI** (React). Reuse the SDK for wallet and channel operations. To play your build in the real
shell before you submit, attach it to the public playground at https://test-arcade.xaya.io/attach
(§3 step 4), or run the supplied platform services on your own playground. The public arcade's
operator reviews and registers accepted games.

**Submit a tested source commit through a GitHub issue.** Open the Game submission form at
https://github.com/xaya/arcade-submissions/issues/new?template=game-submission.yml.
It asks for the repository, full commit covering frontend and rules, compiled WASM path and
SHA-256, game/registration details, test results and a wagering request with the Polygon address
your game's fee is paid to. Keep the rules source, compiled WASM, its hash and reproducible build
instructions in the same game repository.
The form is defined in `arcade-submissions/.github/ISSUE_TEMPLATE/game-submission.yml`.

The operator rebuilds the frontend for the target arcade, verifies the WASM hash, reviews the
source and tests on a private playground before listing the game. No production frontend bundle
hash is required. Running an arcade server is optional; do not make access to deployment tooling
a prerequisite for preparing a submission. Click **Submit new issue** and follow that issue for
review questions. For an update, use the same form with a new tested commit and the earlier issue.

Acceptance is discretionary either way: a human reads your repo before your game goes on the shelf,
so if the repo is private, say so and grant access. Public self-serve is deliberately *not* open.
The public arcade serves bundles at `/g/<slug>/` on a games hostname separate from the shell.
The operator's private test plane uses the same separation. The optional same-origin override
in §5 is disabled on those deployments. Games on a shared games origin must still namespace
storage and use relative asset paths. A name is registered only when the operator accepts it.

**Try the clone first, because if it 404s that is the one item in your schedule with a lead time.**
Repo visibility is per-repo and it changes, so run the clone before you plan around it. A 404 means
the repo is not open to your account yet: ask in `#builders` on
[Discord](https://discord.gg/FdZWZj4) for access to `xaya/arcade-xayaman`, **with the account you
will clone with**, and start that request before anything else: waiting on a human is the one thing
you cannot compress. Everything at https://arcade.xaya.io/docs is public and readable either way, so
start with `/docs/requirements` and `/docs/rules-blob` while you wait.

**No key and no funds, though: those really are zero.** Building, testing and the whole run on your
own stack need no wallet, no `p/` name and no WCHI: the stack mints what its fork needs; you only
need those to play on the real arcade. What the stack does need from a box (Docker, an archive
Polygon RPC to fork from, a hostname for the plane) is its own `docs/INSTALL.md`, not this file.

**Then:** read §3 step 0, pick a `slug` and a `gameType`. **There is no name-probe endpoint.** Nothing on
the arcade will tell you in advance whether a name is free, and nothing reserves one for you; the
names are checked for the first time when the operator runs pre-flight over your submission. The rules
those checks apply - the reserved slugs, the slug and gameType patterns, the seat bounds, the
cfg-suffix cap - are all in `arcade-platform/submissions/src/preflight.ts`, and this file quotes them
in §3 step 0 and §3 step 6. Read them there before you pick: your own stack applies none of them; the
public playground's attach applies them, against that plane's registry only.

## 2. The repos

The template is the starting point; the platform is the SDK and ABI reference. The shell and
deployment tooling are optional reading. The first-party games are a reading list: they live in this skill's `EXAMPLES.md`, one row each saying
what that game is the reference for.

| Repo | What it is | What you do with it |
|---|---|---|
| **arcade-xayaman** | **THE copy-me template** | **Fork this one.** Its README is the 10-section builder guide; §9 is *Make your own game from this* and §7 is the build/bundle/register run. |
| arcade-platform | the host GSP (`arcaded`), `@xayaarcade/sdk`, the `games-host` bundle server, the submissions service | Check it out so YOUR FORK's `scripts/vendor-sdk.sh` can re-cut the SDK tarball from it (`ARCADE_PLATFORM=~/arcade-platform npm run vendor:sdk`): that script lives in the template, not here. **Read the banner it prints (§2.1).** Also the ABI/judge reference. |
| xaya-arcade | the shell site (wallet, XAYA name, cross-game lobby, the closed submission front, embed + presentation) | Consumed, never forked. |
| xaya-stack | the arcade deployment - substrate, beta, playground, chat, edge - one clone with every service a pinned submodule, `./stack up <plane>` to bring one up. Private during the curated phase: access on request | Optional: clone it to run your own integration playground (§3 step 4). It is not required for submission. |
| arcade-wager | the deployed `ArcadeWager.sol` the arcade's stakes escrow into | Read-only, and only if you want to reason about payouts. Wagering is an operator switch, not game code - see `WAGERING.md` §1. |
| a fork-testing deployment | the operator's forked-EVM deployment repo - the whole stack, no real funds. Not published | Nothing: it is operator-grade infra, and no step below needs it. |

**What you actually need:** a fork of **arcade-xayaman** - you only ever fork that one repo - a
checkout of **arcade-platform** when updating the SDK or checking ABI source. The template
already vendors its SDK. **xaya-stack** is optional deployment tooling.

Repo URLs, and which of these are public today, live in this skill's `EXAMPLES.md`. Do not assume
visibility from a name: **most `xaya/*` repos are private during the curated phase: access on
request.** If a `git clone` fails with a 404, that is what it means; it is not a typo in the URL.

```
git clone https://github.com/xaya/arcade-xayaman.git
```

**If a required build-source repository cannot be cloned, request access. Optional deployment
repositories do not block building or submitting a game.** Post in `#builders`
on [Discord](https://discord.gg/FdZWZj4) with the repository name and one line on what you are
building. Do not reconstruct the judge ABI, the SDK surface or the submission contract from memory:
every one of them is a consensus surface, and a guess that compiles still fails at registration or,
worse, at the first real match. That Discord is also where to say so if your idea does not fit the
constraints in §1: say so before you build.

### 2.1 One clone of arcade-platform, and prove it is the right one

`ARCADE_PLATFORM=~/arcade-platform` is a **default path, not a guarantee**, and the vendored SDK is
the one thing in this flow where picking the wrong checkout produces a build that installs cleanly,
compiles cleanly and then fails at runtime: an older checkout at that path packs an older SDK, and
the game ships against a shell that has moved on.

The template's `scripts/vendor-sdk.sh` **prints what it picked before it packs anything**:
the resolved absolute path, the SDK version, the branch, the commit, and whether that checkout is
behind its upstream, and **refuses outright** when it is behind (override with
`ALLOW_STALE_PLATFORM=1` only if you mean it). Read that banner every time:

```
==> SDK SOURCE   <the absolute path it resolved>
    sdk version  <whatever that checkout's sdk/package.json says>
    branch       <branch>
    commit       <short sha>
    freshness    up to date with <upstream>   |   N commit(s) BEHIND <upstream>
                                              |   unknown: <why it could not check>
```

If the version or the branch is not the one you expect, stop: do not pack. `freshness unknown`
means the script could not reach the remote (no upstream, or offline); that is not a pass, it is a
"nobody checked". Keeping exactly **one** `arcade-platform` clone on the machine is the cheapest way
to never have this question.

### Prerequisites

| | |
|---|---|
| **Node** | **20.9 floor, and use 22** - 20.9 is Next's own `engines` floor and 22 is what CI pins, so 22 is the only version every gate is actually proven on (https://arcade.xaya.io/docs/requirements) |
| **Docker** | required - the blob toolchain and the blob tests both run in containers. The template's builder image is **not** platform-pinned, so on an arm64 host you add the two `linux/amd64` pins yourself before the blob will build at all: `WASM.md` §A2 names both |
| **Python 3** | any: `blob/check-blob.sh`'s structural gate is stdlib-only Python, deliberately, so that one rung runs even where Docker does not |
| **git**, **curl** | |
| A Xaya `p/` name and WCHI | **not needed to build or to play on a playground.** Only to play on the real arcade. Everything in §3 steps 1-5 runs with no account, no key and no funds |

## 3. The builder flow

### Step 0: choose the four registration values

Four facts get registered on chain when your game is accepted. **They are supplied outside your repo
: the attach form or the row you add to your own stack's games table (§3 step 4) and the
submission you open (§3 step 6), and nowhere else. No file in your repo declares them, no build step
reads them, and nothing validates them before a pre-flight: the playground's attach, or the
operator's.** Two of them are permanent once accepted and should be chosen
before you write a line of code; two are provisional and you revise them freely while the rules
settle.

| fact | permanence | when you fix it |
|---|---|---|
| `gameType` (= your `GAME_KEY`) | **burned forever once accepted.** Globally unique across every game ever registered; nothing frees one (`preflight.ts` refuses any gameType the GSP registry or another pending submission carries) | **now**, before code |
| `slug` (your site URL) | **a one-shot claim** in practice - changing it means a new slug and a dead URL | **now**, before code |
| `seats` (min..max) | operator can re-register it; **no self-serve path** | provisional - settle it when your goldens do |
| `cfgSuffix` | operator can re-register it - *unless a channel of your game type is open*, and a wrong suffix wedges every channel part-filled, which **is** an open channel. **The mistake creates the state that blocks its own fix.** | provisional - derived from rules that do not exist yet (§3 step 2) |

**When the names are checked: by pre-flight over your submission, and not one moment earlier.** There are
exactly three name checks and they all live in `preflight.ts`:

- a `slug` in the first-party `RESERVED_SLUGS` list (`preflight.ts`) is refused
  outright, and no token or exemption changes that. **That list grows every time a first-party
  game ships**, so read it in the source rather than trusting any count written down elsewhere;
- a `slug` already held by a live game or another non-rejected queued submission is refused;
- a `gameType` the GSP registry carries, or another queued submission claims, is refused.

**There is no availability endpoint and no way to ask in advance.** A name is not yours until the
operator's pre-flight has passed it, and it is not permanent until the registration. A playground
proves none of this: the public one's attach checks the rules against that plane's registry only, and
your own stack checks nothing; its registry holds your games and the first-party ones, so a slug or `gameType`
that works there says nothing about the real registry; read `RESERVED_SLUGS` in `preflight.ts`
before you pick, and have a second `gameType` in mind (§3 step 4).

**The relief valve, in the same breath, because you will want it:** nothing is claimed until
pre-flight sees the name and nothing is burned until an operator registers your game, so a
submission that is turned down is fixed and reopened under the same slug and gameType. Only
registration is terminal.

**Keep the four values written down somewhere you will not retype them from memory**: your fork's
README is the obvious place. Two of them already have a home in files you maintain and should be
*copied* from there, never retyped: `gameType` is `GAME_KEY` in `src/app-identity.ts`, and
`cfgSuffix` is the byte layout you record in your own `blob/MANIFEST.md` (§3 step 2). Get the two
permanent names right today; let seats and `cfgSuffix` converge as the rules settle, and reconcile
all four against your green run in step 5.

### Step 1: fork the template and re-identify it

Fork **arcade-xayaman** and follow its README §9, *Make your own game from this*. Two starting
points, and its §9 splits them the same way:

**(A) Re-identify only.** A reskin over the shipped rules is a complete, submittable game. The
identity is single-sourced, so this is a small closed edit.

**(B) New rules.** Do A, then replace the rules core, the codecs, the adapter/board UI and the e2e
content. Delete `rules/heritage/` **together with** `rules/`: heritage is a test oracle valid only
against the rules it was ported from, and read the pitfalls table in this skill's `PITFALLS.md`
first: the heritage README's removal note is incomplete, and the Makefile needs more surgery than
"delete the two targets".

**The identity surface, closed.** The template's README §9 names three anchors and then sends you to
https://arcade.xaya.io/docs/make-it-yours for the maintained walkthrough. These eight are the subset
that fails *silently* if missed, so do them in one edit:

| # | edit | what changes |
|---|---|---|
| 1 | `src/app-identity.ts` | `GAME_KEY`, `TITLE`, `STORAGE_PREFIX` - the one source of every id. `MOVE_NS` derives itself; leave it. |
| 2 | `package.json` | `"name"` (plus `description`/`repository` for tidiness) |
| 3 | `tests/repo/copyright-guard.test.ts` | the **self-identity pin block** at the top - `pkg.name`, `GAME_KEY`, `STORAGE_PREFIX`, deliberately a second independent copy that exists to catch a half-finished rename. Leave the forbidden-title sweep below it untouched. |
| 4-6 | `docker/Dockerfile.frontend`, `docker/frontend.env.example`, `scripts/build-frontend-image.sh` | the `NEXT_PUBLIC_GAME_ID` build-time default |
| **7** | `package.json`'s **`arcadeGameLibDir`** | names your game's lib dir (`src/lib/xayaman` in the template). Rename it with the directory below, in the same commit: `e2e/imports.test.ts` **derives** the path it sweeps from this field, and a stale value makes that gate fail closed rather than sweep the wrong tree. |
| **8** | **`src/lib/<game>/`** | the template's game directory is `src/lib/xayaman/`; rename it and every import of it, in the same commit as #7. |

**Eight rows is the closed part, not the whole surface.** A real re-identification reaches well beyond
them, and the rest fails loudly rather than silently: once your declared identity diverges from the
template's, the copyright guard's template-identity sweep (`tests/repo/copyright-guard.test.ts`)
lists every remaining tracked file that still carries the template's name or game key: the vendored
`vendor/` and `.claude/skills/` trees and the `rules/`+`blob/` you may keep verbatim are exempt,
nothing else is. Five facts to know before the first run:

- **The template's name is refused anywhere**, a README link to `github.com/xaya/arcade-xayaman`
  included. Credit the template without spelling its name, or not at all.
- **`package-lock.json` carries the package name twice**: the root `name` and the `packages[""]`
  entry. Edit both fields by hand; no reinstall and no registry access is needed.
- **Only tracked files exist to the gates.** The sweep and `e2e/imports.test.ts` both read
  `git ls-files`, so a new directory that is not yet `git add`ed reports as "no tracked files under
  `<dir>`" rather than as a rename. Stage new files before running the ladder.
- **Include every header you use in `rules/`.** The wasm build (wasi-sdk) and the native test build
  resolve transitive includes differently, so a `size_t` that arrives for free under one toolchain is
  `'size_t' does not name a type` under the other; a green `build-blob.sh` does not prove the native
  battery compiles.
- **The blob test image needs no edit.** `blob/tests/run-tests.sh` names its image after the checkout
  directory and tags it with the sha256 of `blob/tests/Dockerfile.testenv`, so two forks on one machine
  never share an image and an edited Dockerfile is rebuilt on the next run.
- **The first `blob/tests/run-tests.sh` needs the network**: it builds the test image, and
  `blob/tests/Dockerfile.testenv` downloads the pinned wasmtime C API during that build. The image is
  large because it derives from the libxayagame image for the heritage oracle's dependencies; a fork
  that has deleted `rules/heritage/` needs only a C++ toolchain, `libjsoncpp-dev` and wasmtime, and
  can base the image on a slim Debian instead.

Budget for that, and expect the ladder - not this list - to be what tells you when you are done.

### The FOUR SDK entry points, and which one your shared code must use

This is the single most common way a new game repo fails to build, and it is not obvious from
the package name. `@xayaarcade/sdk` publishes four subpaths:

| import | for |
|---|---|
| `@xayaarcade/sdk` | your **app** code - React screens, hooks, the bridge, wallet + chain. |
| `@xayaarcade/sdk/core` | your **shared** code - `BoardRules`, your `OpenChannel`, your packed codec. **Isomorphic**: it evaluates in the browser bundle *and* under a bare `npx tsx`. |
| `@xayaarcade/sdk/e2e` | node-only scenario infrastructure: on-chain moves, `WsBroadcast`, `RecordingTxSender`, `quietChannelLogs()`. |
| `@xayaarcade/sdk/server` | node-safe serving pieces, e.g. `buildSecurityHeaders`: §3 step 4 has its contract, and you need it only if you host a build yourself. |

The rule: **a file that both the Next bundle and the tsx e2e suite load may not import a runtime
value from the main entry.** The main entry statically pulls in connectkit, whose `exports` map has
no `default` condition, so `tsx` dies with `ERR_PACKAGE_PATH_NOT_EXPORTED` and the whole scenario
suite fails at import: before a single assertion runs. Type-only imports are erased and are safe
from anywhere.

`/core` carries what shared code actually needs: the protobuf types, base64 + SHA-256, the channel
value types and wire constants (`NO_TURN`, `WINNER_UNDECIDED`, `DRAW_WINNER`, `channelIdHex`),
`ChannelConfig`, the dispute/resolution move bodies, and `PackedJudge`. Before SDK 0.7.0 it did not
exist, and every game repo had independently built a two-file `sdk-proto.ts`/`sdk-proto.node.ts`
twin behind a package.json `imports` map to reach one protobuf schema. If you inherited that
pattern from an older template, delete it and import from `/core`.

**`e2e/imports.test.ts` enforces exactly that rule, and it fails closed.** It reads `package.json`'s
`arcadeGameLibDir` and takes that directory as a required sweep root, so a fork that renames
`src/lib/<game>/` **and that field together** (edit #7 above) needs no edit here; its `ALLOW` set
contains no source file, because `/core` means no shared file needs an exemption to reach a runtime
value. Any sweep root with zero tracked `.ts`/`.tsx` files is a hard FAIL naming the root: an empty
root means the directory was renamed without the field, or its files are not yet `git add`ed. Still
read the file count it prints on PASS; a number that drops after a rename is the signal something
left the sweep.

**Two ladder rungs need a real git repository**, which is easy to miss if you started from a
downloaded copy rather than a clone: `tests/repo/copyright-guard.test.ts` and `e2e/imports.test.ts`
both shell out to `git ls-files`, and `blob/check-blob.sh --rebuild` wants a clean tree. `git init`
and commit once before running the ladder, and stage new files as you add them.

**Path B also needs a frontend rename checklist**, because the game directory is not the only place
the template's own game leaks into a fork:

- `src/lib/games/<game>-adapter.ts`: the adapter module and its exported symbol.
- `src/bootstrap.ts`: the adapter import and the `registerAdapter(GAME_KEY, …)` call; the
  registry key is `GAME_KEY`, **not** the move namespace.
- The board components and their CSS module names.
- `e2e/harness.ts`'s game imports and every game-shaped assertion in the scenarios.
- `e2e/app-config.ts`, which the whole e2e suite reads its identity from. (It imports from
  `@/app-identity` exactly as its header promises, so it usually needs **no** edit: verified.)
- **The rest of `e2e/`, which carries far more game shape than the two files above suggest.** `e2e/suite.ts` contains a whole scenario written around the
  template's own mechanics plus board fields another game does not have; **`e2e/match-cfg.ts` owns
  this game's cfg fields, `encodeCfgSuffix`/`cfgSuffixHex` and `PROD_CFG_SUFFIX`, and hands them to
  the SDK's `ChannelConfig.build()`**: it is the single most game-shaped file in `e2e/`, and the
  one whose wrong contents wedge every channel of your fork part-filled with no error, so rewrite it
  for your own suffix layout; `e2e/onchain-scenarios.ts` only imports from it;
  `e2e/onchain-scenarios.test.ts` pins the literal cfg hex; `e2e/onchain-scenarios.smoke.test.ts`
  asserts the blob accepts the production cfg and rejects the empty one via `prodCfg`/
  `PROD_CFG_SUFFIX`: no cfg edit once `match-cfg.ts` is yours, but its assertions are game-shaped;
  `e2e/packed-determinism.ts` carries its own cfg builder, field names and trace filenames; and
  `e2e/selfplay.ts` imports the template's bot.
- **A second game directory the row above does not name:** `src/game/` (types, and any mechanic
  module beside them) is separate from `src/lib/<game>/` and is just as game-shaped.
- `src/hooks/use-<game>-input.ts`, and `src/lib/arcade/presentation.ts`'s exported presentation
  constant.
- The game-shaped unit tests under `tests/lib/`, `tests/hooks/` and `tests/components/`: rung 1 of
  the ladder runs them, so they are not optional.
- Stale `xbm`/`xayaman` words in *comments* (`src/bootstrap.ts`, `blob/tests/fuel_probe.cpp`) are
  not identity config, but on path B you rewrite those files anyway.

`STORAGE_PREFIX` is the one in that list that can silently break a *live* game, not just yours:
see §5, and set it from your `GAME_KEY` in the same edit.

### Step 2: write the rules blob

C++ → `blob/rules.wasm` via `blob/build-blob.sh`, reproducible and DWARF-stripped. The full
toolchain: the zero-import freestanding reactor, the reproducible build, `check-blob.sh
--rebuild`, the fuel probe, **and how to author the golden traces your seat declaration rests on**
: is this skill's `WASM.md`; its §A4 is the only place golden traces are documented, and there is no
procedure for them anywhere else.

The hard constraints:

- **Zero-import wasm.** The register gate refuses any module with a non-zero import count
  (`ARCADE-ABI.md` §7; `wasm_judge.cpp`'s `imports.size == 0`).
- **Twelve consensus exports, plus two structural ones.** `arcade_alloc`, `arcade_free`,
  `arcade_parse_state`, `arcade_release`, `arcade_is_valid`, `arcade_whose_turn`,
  `arcade_turn_count`, `arcade_is_finished`, `arcade_winner`, `arcade_apply_move`,
  `arcade_initial_state`, `arcade_resolve_timeout`: plus `_initialize` **as a function** and
  `memory` **as an exported wasm memory** (`wasm_judge.cpp`'s `kRequiredFuncs` + the memory check).
  Each must be present *and* of the right kind; a same-named global or table fails the gate. Extra
  exports are harmless.

  **Do not write a single export from this list of names: get the signatures and the sentinel
  values first**, from `WASM.md §A1` or, with no repo access, the public
  https://arcade.xaya.io/docs/rules-blob. The sentinels are the part that bites: `arcade_winner`
  returns **`-1` undecided, `-2` draw**, and a seat index otherwise. Guess it
  the obvious way round and you ship a blob that misjudges every drawn game: in a system with no
  self-serve update path, where the fix costs a new slug and a new gameType.
- **Integer-only determinism.** No floats, no randomness, no clock, no I/O. The same bytes run
  natively in your tests, in wasmtime inside the GSP referee, and in V8 in the browser; dispute
  resolution depends on byte-identical agreement between all three. (The determinism *law*: same
  ordered inputs must produce byte-identical state: is the foundation both game architectures rest
  on; load the **building-persistent-games** skill for the full section.)
- **No entropy source exists in the ABI**: state bytes and move bytes, nothing else. If your game
  needs unpredictability, players supply it in move payloads under a commit-reveal discipline;
  arcade-xayaships is the worked example.

**Your cfg bytes, and how to derive `cfgSuffix`.** Do this once the rules exist, and write the answer
down in your own `blob/MANIFEST.md`:

1. `arcade_initial_state(participants, cfg, cfgLen, out, cap)` receives **opaque bytes**. The host
   never parses them (`ARCADE-ABI.md`); your blob defines and validates its own layout, and
   whatever `cfgLen` values you accept *is* your config contract.

   **`participants` is not always your seat minimum.** A blob that
   hard-codes its seat count and rejects `participants == 1` compiles, passes its own unit tests,
   clears the register gate - and then dies at setup in the template's e2e suite: `buildWorld`
   seeds **every** scenario with `judge.initialState(numPlayers, prodCfg(seed))` - a `ChannelConfig`
   built by the SDK, never loose bytes, and throws when it comes back null, and scenario 7 builds
   its world with `buildWorld(1, 42)`
   (`buildWorld` in `e2e/suite.ts`). Accept every count in `[1 .. seats.max]`, answer the one-seat board as
   valid, and have `arcade_whose_turn` say nobody has the turn.

   **But the chain never asks your blob for the pre-start board, whatever else you may have read.**
   A freshly created channel is stored with an **empty** state (`HandleCreateChannel`
   calls `Reinitialise (meta, "")`, `engine/gsp/logic.cpp`); the referee short-circuits that empty
   state into a placeholder of its own without ever calling the judge (`ARCADE-ABI.md`, "The
   pre-start waiting state never reaches the blob"), and the template's browser-side rules do the
   same for a zero-length state. Every count the referee *does* pass to `arcade_initial_state` is
   clamped into your registered `min..max` before a channel can open at all
   (`ParseCreateChannelMove`, same file). The one-seat call is the **harness's**, not the
   platform's, which is exactly why answering it is cheap and skipping it costs you a red suite.
2. The host builds `cfg = LE32(channel seed) ++ cfgSuffix`: **but only when the suffix is
   non-empty.** With an empty suffix it skips the seed prefix entirely and hands you a **0-byte**
   cfg (`BuildCfg` in `engine/gsp/logic.cpp`; the Config section of the template's
   `blob/MANIFEST.md`).
   There is no "seed only, no config" option: if you want per-channel variety you **must** register
   a non-empty suffix. **If variety is all you want, one byte is enough**: the suffix exists here
   only to make itself non-empty so the host prefixes the seed. Dungeon Channel registers exactly
   `01`, a single version byte that must never be empty
   (`arcade-dungeonchannel/blob/MANIFEST.md`), which is the cheapest way to buy
   `LE32(channel seed)`.
3. Write the layout down in your own `blob/MANIFEST.md` as a byte table. Two shipped examples bracket
   the space above the single version byte of point 2: xayaman's two-field suffix
   `0200000001000000`
   (`arcade-xayaman/blob/MANIFEST.md`), and - a better "copy this byte table" model at 2..4 seats - xayatrails' real multi-field one, `0102090c068403` = version 1, targetWins 2, maxRounds 9, and
   the rest (`arcade-xayatrails/blob/MANIFEST.md`). The `cfgSuffix` you submit is that layout
   **minus** the leading LE32 seed, hex-encoded, lowercase, even length, and at most 128 hex chars
   (`CFG_SUFFIX_MAX` in `preflight.ts`).
4. **A game with no config takes the zero-length path, and it is a contract of its own.** Submit
   `cfgSuffix: null`: never `""`; pre-flight refuses an explicit empty string because a
   present-but-empty suffix *sets* the registry row to empty rather than leaving it unset
   (`validateMeta` in `preflight.ts`). With no suffix registered the host hands
   `arcade_initial_state` **zero bytes and no seed**: `ChannelConfig.build(seed, '')` mirrors that
   and drops the seed, so your blob must accept `cfgLen == 0` and reject every other length. The
   inverse mistake is the silent one: register a suffix for a blob that wants none and every channel
   receives `LE32(seed) ++ suffix`, the blob refuses it, and the channel wedges part-filled with no
   error. Pin both directions in a test that feeds the blob the registered shape and the other one.
   Two worked zero-byte examples: `arcade-xayaships/blob/MANIFEST.md`, and Vector Sumo, whose blob
   **rejects every non-zero cfg length** because the game has no randomness and needs no seed
   (`arcade-vector-sumo/blob/MANIFEST.md`).
5. **Copy the value into the form (or into `meta`) from your `MANIFEST.md`: never type it from
   memory.** Your golden traces must be replayed under the same bytes you submit, not under a
   private copy of them (`WASM.md` §A4).

**Blob-side consensus safety: the untrusted-input discipline, blob edition.** Everything reaching
your blob is attacker-controlled: anyone can send any JSON as a move, and a channel's stored state
is whatever the last accepted move produced.

- **Parse and validate are two steps, and the split is not cosmetic.** `arcade_parse_state` turns
  bytes into a handle; `arcade_is_valid` answers whether that handle is a state your rules would
  ever have produced. The host treats `handle == 0 || is_valid == 0` as a plain reject
  (`ARCADE-ABI.md`). Never let a parse imply a validation.
- **Bound every count you read.** A length, a seat index, a piece count or an array size decoded
  from input is a hostile number until you clamp it. A blob that indexes on an unbounded decoded
  count traps, and a trap is a reject, so it is not a fork, but it is a permanently dead game.
- **You are metered and capped, and you cannot opt out.** Each metered export call gets a fresh
  budget of **500,000,000** fuel units, each instance is bounded at **64 MiB**, and
  `arcade_apply_move` / `arcade_initial_state` / `arcade_resolve_timeout` write into an
  **16384-byte** output buffer: a returned length outside `0..16384`, including the `-2`
  "too small" answer, is a terminal reject with no retry (`docs/ARCADE-ABI.md` §5, matching
  `kFuelCap` and `kStateOutputCap` in `engine/judge/wasm_judge.hpp`, and
  `kMemoryLimitBytes` in `engine/judge/wasm_judge.cpp`). The judge is the authority for the 16384-byte cap; the template's test host
  `blob/tests/wasm_host.hpp` mirrors it so the determinism legs run under the same bound. Run the
  fuel probe (`WASM.md`).
- **`arcade_alloc(0)` must return a valid non-zero pointer.** The referee's judge calls
  `arcade_alloc(len)` with the input's real length, so an empty move/state/cfg calls
  `arcade_alloc(0)`, and a `0` return there is a reject (`docs/ARCADE-ABI.md` §5, "Allocation
  sentinel"). **As of SDK 0.16.0 the in-browser judge does the same thing**: `arcade_alloc(len)`
  and `arcade_free(ptr, len)` with the true length, so both judges refuse an empty input
  identically. A bundle built on 0.15.5 or older still asks for `alloc(len || 1)`, which is exactly
  how a blob whose `arcade_alloc(0)` answers `0` plays fine in the browser and rejects on chain.
  **The on-chain registration gate settles it either way, by RUNNING your blob rather than reading
  its export table:** the referee instantiates the module and calls `arcade_alloc(0)`, and a blob
  that answers `0` - or traps - is refused registration outright instead of failing later on its
  first empty input. Pre-flight does **not** mirror that: it walks your wasm's export table in
  TypeScript and deliberately never instantiates untrusted bytes (`WASM.md`), so a clean pre-flight
  is not a clean gate: a playground's GSP applies the real one when your blob's registration
  reaches it (§3 step 4). A naive `malloc(0)` is how you fail it; `malloc(len ? len : 1)` is
  what the template's ABI shim does (`arcade-xayaman/rules/arcade_abi.cpp`). Refusing zero-length
  inputs by length inside your rules is still worth doing, but it does not get you past the gate:
  answer `arcade_alloc(0)` with a real pointer either way.

### Step 3: write the UI on `@xayaarcade/sdk`

**Hard limitation, stated before you plan anything: the SDK is React/Next only today.** It declares
`react`, `react-dom`, `wagmi`, `@wagmi/core`, `viem`, `@tanstack/react-query` and `connectkit` as
peer dependencies (`arcade-platform/sdk/package.json`), and it ships React components: the lobby, the
channel screens, the runtime-config gate. **A non-React frontend has no supported path.** If your
game must be canvas-first, that is fine: render your canvas inside a React board component. If it
must be another framework, there is no route today; do not start.

What you actually implement:

- **`configureApp(...)` + `registerAdapter(...)` at bootstrap**, from one module whose *import* is
  the bootstrap (`src/bootstrap.ts`). It must run before any SDK screen renders: the
  template's file documents the four failures that follow if it runs late, and the nastiest one
  silently loses a returning player's session rather than crashing.
- **Three different ids, and they are not the same string.** `GAME_KEY` is the GSP registry key and
  the adapter registry key: it is what your lobby filters channels by. The **move namespace** is
  the arcade's shared `g/` namespace, which many games ride at once. `storagePrefix` is your
  `localStorage` namespace on the games origin (§5). The template derives all three from
  `src/app-identity.ts` so they cannot drift.
- **One `GameAdapter` plus your board components.** The adapter carries the rules binding, the
  channel wiring, the renderer and the input; the SDK gives you the channel protocol, session keys,
  the lobby, relay wiring, dispute handling and the shell bridge for free.
- **The presentation declaration**: `presentation?: GamePresentation` on the adapter:
  `aspectRatio`, `minViewport: {width,height}`, `immersive?: 'never' | 'preferred'`,
  `fullFrameOnTouch?: boolean` and `squareBoard?: boolean`
  (`GamePresentation` in `sdk/src/lib/games/adapter.ts`). The adapter is the source;
  the `arcade:presentation` message is only the transport. **The seat range is not adapter state and
  is not in your code at all**: it is a value you supply outside it (§3 step 0).
- **Fit the frame you are given.** The shell's play page is one viewport tall and never scrolls: the
  arcade bar takes a row, the iframe takes everything below it: the whole viewport once you go
  immersive: letterboxed to your `aspectRatio` only when the board has announced its presentation
  and the box is at least `minViewport` (`xaya-arcade/src/components/play/PlayShell.tsx`). On a
  touch device a game declaring `touchControls` or `fullFrameOnTouch` gets the whole box. The
  frame is never resized to your content, so a document taller than it scrolls **inside the
  iframe**, and a player then scrolls between the board and the controls every turn. Your game owns
  the layout inside that rectangle: the board and every control an ordinary turn needs fit it in
  both axes; only an optional panel - history, help, a log - may scroll, on its own. Viewport units
  inside the frame measure the frame, which is why the template's `src/app/globals.css` pins
  `html, body` to `100dvh` with `overflow: hidden` and `overscroll-behavior: contain`, and why
  `squareBoard` sizes the board to the largest square that fits both axes: the template fits by
  construction, so keep those rules and size anything of your own from the box you measure. Check
  it on the real `/play/<slug>` page - in the shell, not the bare `/g/<slug>/` mount - at a desktop
  size (1366×768) and a phone size (390×844), in every screen the match passes through: a
  screenshot of the visible viewport shows the board and the turn's controls with nothing scrolled,
  and inside the child document `document.documentElement.scrollHeight <= clientHeight` and
  `scrollWidth <= clientWidth` (a browser automation tool reaches the frame through its frame API;
  production code never can).
- **`squareBoard`, if your board is one square surface (SDK 0.17.0).** The SDK owns the square
  board frame: the largest square that fits both axes, with the strips the status line, the
  on-screen controls and the controls hint sit in reserved on an upright phone. Declare `presentation.squareBoard: true` and
  delete your copy. Opt-in and inert otherwise: a game that sizes itself (two boards side by side, a
  fixed-ratio scene, an arena that fills the frame) is untouched, and so is every fine-pointer
  layout. **Migrating a renderer to it, in the order the mistakes are made:** delete only your own
  frame and surface rules and return the board **content** - the wrapper element goes away and the
  SDK renders the frame in its place; put `class="arcade-board-surface"` on the surface that used to
  carry your square sizing, because that is the one class the SDK's stylesheet acts on; and move
  anything that **measured** the old wrapper - a `ResizeObserver`, a `getBoundingClientRect` for
  canvas pixel sizing: onto the surface or the canvas, since an observer on a vanished node reports
  nothing rather than failing loudly. Every other class of your own stays exactly where it is; the
  SDK neither reads nor writes those. **Two shipped games declare it**, xayaman and xayatrails, both in
  `src/lib/arcade/presentation.ts`.
- **Playable by touch is a requirement, not a polish item.** The arcade is browsed and played on
  phones, so every game must declare how it is played on one, and exactly two declarations count:
  `touchControls` for a keyboard game and `presentation.fullFrameOnTouch` for a tap-native one, both
  below. They are not alternatives to pick by taste: a game that declares neither hands a phone a
  keyboard that is not there. **The adapter declaration alone does not reach the arcade from a
  bundle.** The games-host stores the answer on the manifest row as a `touch` boolean, and
  it takes that answer from the bundle itself: a file named `arcade-manifest.json` at the archive
  root of `bundle.tar.gz`, containing `{"touch": true}` (`BUNDLE_MANIFEST` and `bundleDeclaresTouch`
  in `arcade-platform/games-host/src/touch.ts`). The template ships it as
  `public/arcade-manifest.json`, which the static export copies to the bundle root, and its adapter
  test asserts the file's `touch` equals what the adapter declares: keep the two in step. The
  bundle's own statement outranks every other source (`games-host/src/registration.ts`); the `src/`
  scan (`checkoutDeclaresTouch`) applies only when a game is registered from a checkout with
  `--touch-from`, which `./stack rows` does for every row and an upload never is. A bundle that ships no manifest leaves the row
  unanswered, and unanswered is treated as no. A row that does not say yes is labelled *Desktop only
  (for now)* on the game's card and page; a player on a coarse-pointer device cannot start or join a
  match in it from the lobby - the reason sits where the button would be - and a phone that reaches
  the game page some other way meets a warning line. `GET /api/games` on your own plane shows the
  stored `touch` for your slug the moment the row is registered. Nothing is refused over it. The shipped answers split both ways. **Some
  declare `touchControls`**: a d-pad plus one action button (xayaman's adapter), a bare d-pad
  (xayatrails' adapter), and a d-pad plus three action buttons
  (`arcade-dungeonchannel/src/lib/dungeon/adapter.ts`, spec in `src/lib/dungeon/input.ts`). **Others
  declare `fullFrameOnTouch: true` and mount no pad at all**: the tap-native case, whose board
  already *is* the input surface: xayaships (`arcade-xayaships/src/lib/arcade/presentation.ts`),
  which builds its own touch-only affordances behind `useCoarsePointer()`, and Vector Sumo
  (`arcade-vector-sumo/src/lib/arcade/presentation.ts`), whose board draws its own aim pad,
  action row and commit button for every pointer type
  (`arcade-vector-sumo/src/components/VectorSumoBoard.tsx`). Vector Sumo's adapter records why it
  refused the generic pad, and it is the reason to read it: a mounted pad lands in the same bottom
  gutter its own controls occupy, on top of the Commit button that seals an irrevocable choice, and
  the one control that has to report state cannot be a key-synthesizing button
  (`arcade-vector-sumo/src/lib/games/vector-sumo-adapter.ts`).
- **On-screen touch controls, if your game is keyboard-driven**: `touchControls?:
  TouchControlsSpec` on the adapter (`sdk/src/lib/games/adapter.ts`): an optional 4-way `dpad` and
  optional action `buttons`, where every value names the `KeyboardEvent.key` it stands for. A `dpad`
  names all four directions or is absent - a two-direction game declares `buttons` instead - and a
  button's key is **held** for as long as the button is pressed (`keydown` on press, `keyup` on
  release), the same level-sampled model a held keyboard key gives your hook. Declare
  it and `ChannelGame` mounts the overlay by itself on coarse-pointer devices while input is live,
  synthesizing real window key events, so a keyboard game becomes phone-playable with **no change
  to your input hook**, its held-key model or its submit timing. The component is not exported;
  declaring the field is the entire opt-in. Absent - the default - means no on-screen controls,
  which is the right answer for a tap-native game whose board is already the input surface. That
  game still wants the phone's whole display, and asks for it with `fullFrameOnTouch` rather than by
  mounting a pad it has no use for.

  **Touch examples:** Xayatrails declares a d-pad
  (`arcade-xayatrails/src/lib/games/xayatrails-adapter.ts`); Xayaman adds an action
  button (`arcade-xayaman/src/lib/games/xayaman-adapter.ts`); Dungeon Channel adds
  attack, torch and use (`arcade-dungeonchannel/src/lib/dungeon/input.ts`). Taurion
  Racer also declares a d-pad and buttons
  (`arcade-taurion-racer/src/lib/games/racer-adapter.ts`). A declaration alone does
  not prove the game usable on a phone: test the board and control layout together.
  Tap-native games can use `fullFrameOnTouch` without the generic pad.
- **`controlsHint` is the line your win condition lives on, and since SDK 0.18.0 it can be worded
  per device.** The field is `string | { keyboard, touch }` (`sdk/src/lib/games/adapter.ts`).
  A plain string renders everywhere exactly as it always did; a pair lets the SDK pick by the same
  coarse-pointer gate that mounts the pad, on the board and in the standalone menu. Reach for the
  pair when the keyboard wording would be a lie on a phone: "WASD move, Space bomb" printed
  directly above a d-pad, and say the same things about the game in the terms that device actually
  offers. Two rules hold either way. **Keep it short**: about 46 characters fit one line on the
  320 px screen the arcade supports, and a second wrapped row eats into the board. And **write it
  for both audiences even as a single string**, because since 0.17.0 the hint renders on every
  device: it is where a game states its win condition. On touch it sits one step
  above the controls, running across the frame upright and staying in the pad's own gutter sideways.
  **[BREAKING, 0.18.0]** any code that READS the hint as a string: `.length`, `.toContain`, passing
  it where a `string` is required: no longer compiles (TS2339), and every game repo's own adapter
  test does this. Fix a reader by narrowing (`typeof hint === 'string'`) or by resolving it first:
  `resolveControlsHint(hint, coarsePointer)` is exported for exactly that
  (`sdk/src/lib/games/adapter.ts`). **Three shipped pairs to read**:
  `arcade-xayaman/src/lib/games/xayaman-adapter.ts`,
  `arcade-xayatrails/src/lib/games/xayatrails-adapter.ts`, and Dungeon Channel's, which is the
  one to study: its keyboard wording spells out a whole control scheme and its touch wording names
  no key at all, while both say the same two things about how the match is won
  (`arcade-dungeonchannel/src/lib/dungeon/input.ts`).
- **`fullFrameOnTouch`, if a phone should get your whole board**: set it (as of SDK 0.11.0) and the
  bridge skips the `arcade:presentation` post on a coarse-pointer device, so the shell leaves the
  game the entire frame instead of letterboxing it to `aspectRatio`. A fine pointer is unaffected,
  and a game that declares `touchControls` already gets the skip implicitly: its pad needs the
  game's own gutter to sit in, so it never sets both. That inverse relation is why exactly the
  **two** first-party games that mount no pad declare it: xayaships and Vector Sumo, both in
  `src/lib/arcade/presentation.ts`. On a portrait phone the letterbox costs a
  board game twice: xayaships was handed a 390x420 box out of a 390x844 screen, half the display
  dead, and shrank its own battle cells to 16.8 px: against 36.9 px measured with the full frame,
  or 32.6 px on touch where its fire bar holds a row open
  (`arcade-xayaships/src/lib/arcade/presentation.ts`). Full frame is only half the job, though:
  decide any small-screen layout change from the cell size you **measure** in the box you were
  actually given, never from a user-agent or device guess, so a narrow desktop window benefits and a
  tablet is not punished.
- **`useCoarsePointer()` if you build your own touch affordances**: the SDK exports the same
  coarse-pointer test its touch layer uses (as of SDK 0.11.0), so gate a tap-to-confirm bar or a
  fatter hit box on that instead of re-deriving it. The naive re-derivation is a real bug and not a
  style point: a `matchMedia` read in render scope gets memoized and frozen at `false` by the React
  Compiler your frontend builds with. The hook reads in an effect, so it answers `false` on the
  server and on the first client render and flips after mount.
- **If you hash in the browser, pick your SHA-256 deliberately: `crypto.subtle` needs a secure
  context.** It exists only under HTTPS or a `localhost` origin, and is `undefined` when the page is
  reached over a plain-HTTP LAN IP, which is exactly how a phone gets tested. The failure does not
  look like a missing API: every hash rejects, and the symptom is a game that stops advancing.
  **The SDK does not have this problem**: it uses `@noble/hashes` precisely so a bundle works over
  a LAN IP (`sdk/src/lib/crypto/sha256.ts` states the reason), but your own code might. The
  three shipped answers: import the SDK's async `sha256` from `@xayaarcade/sdk/core` and it works
  everywhere (`arcade-xayaships/src/lib/ships/ships-arcade-channel.ts`); ship a **synchronous**
  implementation of your own when you need one inside a synchronous path such as a `localStorage`
  validation (`arcade-vector-sumo/src/lib/vector-sumo/sha256.ts`, whose header states all three of
  its reasons); or - if you genuinely want Web Crypto - **gate at boot with a message naming the
  fix**, never let it fail per-frame (`arcade-dungeonchannel/src/game/game-shell.ts`, which refuses
  to start and tells the player to use HTTPS or an SSH tunnel to localhost). Note the consequence:
  `vsm` plays over plain-HTTP LAN and `dch` does not, by choice, in the same arcade. **And do not
  confuse the two Web Crypto surfaces:** `crypto.getRandomValues` - which is what a commitment salt
  actually needs - *is* available on plain HTTP over a LAN IP. Only `crypto.subtle` is
  secure-context-only. A game that reaches for `subtle` when it only wanted randomness has taken the
  constraint for nothing.
- **What the channel store publishes besides the board JSON, and why a renderer must read it.**
  The board state your rules produce cannot express who is still in the match, so the SDK publishes
  four facts alongside it (the adapter contract in `sdk/src/lib/games/adapter.ts` lists them):
  `matchOver` (decided, or closed on chain by forfeit, timeout or abort), `linkDown` (**this**
  client has lost touch with the match - not the opponent), `opponentDisconnected` (a peer dropped
  off the relay; it is channel-wide, so above two seats it cannot say which), and, as of SDK 0.17.0,
  **`ejectedSeats: number[]`** - the seat indices the chain has removed by dispute timeout, read
  from the GSP's own export. That last one has no other source: the board JSON has no notion of an
  ejection and the GSP never edits the participant list, so a renderer working from the roster keeps
  drawing a player who was timed out of the match. Empty means nothing known (an older GSP omits the
  annotation), and the last known list stands once the channel leaves the open set: a close does
  not un-eject anybody. Read all four for anything drawn *about* the players rather than about the
  position. **And the published state is cumulative: only the latest is ever delivered.** A client
  rejoining a live match replays its whole backlog of proofs in one synchronous run and the
  intermediate states are coalesced away, because none of them could ever have been painted, so
  read what the current state *says*, and never derive anything from watching updates go by (a move
  counter incremented per update, an animation queued per delivery silently loses the burst).
- **The renderer receives no submit handle and no turn: bridge both from the sources that have
  them.** `GameRenderProps` carries only `localPlayerIndex` (`sdk/src/lib/games/adapter.ts`); the
  live `submit` is handed to your `useInput` hook alone, and `ChannelGame` calls the hook and the
  renderer separately. A keyboard game never notices, because its input hook owns the window
  listeners. A tap-native game, whose input originates inside the renderer's own component tree,
  bridges the two itself: the hook keeps the `submit` it was given in module scope and the board
  calls a plain function that forwards to it, dropping calls made before the channel is ready
  (`arcade-xayaships/src/hooks/use-ships-input.ts` is the shipped shape). Likewise the store
  publishes no `whoseTurn`: the template's board reads a `turn` field its packed state happens to
  carry (`board-state-converter.ts`). If your packed state *derives* whose turn it is, carry the
  judge's own answers - `whoseTurn()`, `winner()`, `isFinished()` - through your `BoardRules`'
  `toJson()` so the renderer reads them from the board JSON, rather than recomputing the rules in
  TypeScript, which is the second rules implementation this whole design exists to prevent.
- **Idle-tab hygiene: it is already done, so do not re-implement it.** Since SDK 0.15.1 a tab parked
  on a lobby does essentially nothing between blocks - an arriving state identical to the last one
  reuses what was already parsed, the wager lobby and the balance readout compare field-by-field and
  say nothing when the answer is unchanged, and the 15-second balance refresh no longer flips
  `loading`. 0.15.3
  added block ticks - a client tells the relay it can take a ~100-byte tick instead of the full
  state on a block where only the header moved, so a countdown stays live while the rest of the
  screen sleeps, and 0.15.4 moved the open-match list to a relay push, since that list is the same
  for everybody. **Nothing in a game changes for any of it**, and all three degrade cleanly against
  an older relay. What a game must *not* assume: that `useGspPolling()` still hands you the chain
  tip (see the breaking change below), that a poll interval is running (a pushed tab runs no timer),
  or that a full state arrives every block.
  **[BREAKING, 0.15.1] `useGspPolling()` no longer returns `height` or `blockHash`.** Read them from
  **`useGspBlock()`** (`sdk/src/hooks/use-gsp-polling.ts`, re-exported from the main entry), **in
  the component that displays them** rather than at the top of a
  screen: that locality is the entire point, and hoisting it back up re-creates the bug it fixed.
  **[BREAKING, 0.15.2] `WagerGspInputs` lost its `height` field** (`use-arcade-wager.ts`);
  nothing ever read it, but a lobby still supplying it will not compile. And one addition, for
  anyone decoding a relay document outside the hook: **`wagerDocMatchesFor(doc, gameType)`**
  (`sdk/src/lib/wager/wager-reads.ts`, re-exported from the main entry).

  SDK 0.17.0 finished the job on the other side of the wire: consecutive parses of a pushed state
  now **share every channel and every collection whose exported JSON is byte-identical**, so a
  pushed state costs only what actually changed in it and React bails out of a redraw rather than
  rebuilding the screen. Nothing in a game changes for that either: `parseGameState(raw, cache?)`
  takes an optional carried-over cache (`newGspStateCache()`,
  `sdk/src/lib/chain/gsp-client.ts`) and, called without one as a single read does, parses
  independently exactly as before.
  **[BREAKING, 0.17.0] `useChannelManager`'s `moneyErrors` / `dismissMoneyError` are now
  `sendErrors` / `dismissSendError`**, and they carry every failed on-chain send rather than a paid
  channel's only: a dispute, a resolution or a win submission that fails now lands in the in-match
  notice column with the reason instead of going to the console. Rename the two fields; nothing else
  about them changed. **Only an app that builds its own board screen on the hook is affected**: a
  game that renders `ChannelGame`, which is every shipped game, needs no edit.
- **Relay reconnection and the multi-tab cases are already handled in the SDK.** The relay keeps one
  connection per address per channel and closes the socket a re-join supersedes: a second window of
  the same game, or an old socket left half-open by a network drop or a sleeping laptop, with its
  own close code rather than 1000 (`CLOSE_SUPERSEDED`, `xaya-relay/src/channel-router.ts`). Since
  SDK 0.16.5 the client reconnects on every close it did not initiate, whatever the code: the
  deliberate disconnect detaches its handler first, so every close that reaches the handler is one
  the client did not ask for. A bundle on an older SDK treats a server-sent 1000 as its own hang-up,
  stops listening, and never learns its own match has filled. On top of that: reconnects back off to a ten-second ceiling and dial immediately when
  the browser reports its network back (`sdk/CHANGELOG.md`, 0.18.4); a match open in a **second tab** is now named as
  such, with one *Play here* button that takes the seat back, instead of the two tabs evicting each
  other (0.18.4); a join the relay refuses as a replay - a reload landing in the same wall-clock
  second sends a byte-identical signed join - is re-signed and replayed once after the clock ticks
  over (0.18.4); and a seat whose key lives in **another browser profile** is recognised before
  anything is attempted, with a banner rather than a permanent "Connecting to channel…" (0.18.6).
  That last one is worth knowing as a fact about the protocol, not just a fix: the key that signs
  for a channel seat is generated in one browser profile's storage and derived from nothing, not
  the wallet, not the name, so a seat cannot be continued on a second device or after site data is
  cleared. Underneath all of it the relay pings every connection on a cadence its operator sets and
  terminates one that does not answer (`HEARTBEAT_MS`, `xaya-relay/src/limits.ts`), so a silently
  dead peer becomes a `peer_left` within a couple of intervals - which is what starts the game's own
  disconnect grace - instead of the match sitting there looking live with nobody behind it.
  **Nothing in a game changes for any of this**, but a bundle only gets it by re-vendoring the SDK
  and rebuilding.
- **The in-browser judge.** The same `rules.wasm` runs in V8 in the player's browser
  (`sdk/src/lib/wasm/packed-judge.ts`) so the client can validate a proof locally without a round
  trip. This is why native == wasmtime == V8 is a gate and not a nicety.
- **The SDK's CSS reaches your build only because of one line: keep it.** Tailwind v4's automatic
  source detection **ignores `node_modules`**, and the SDK's shared screens ship their classes
  inside `dist/`. So `src/app/globals.css` carries `@source "../../node_modules/@xayaarcade/sdk/dist"`,
  and if you delete, move or mistype it the build still succeeds and the lobby, the login and the HUD
  render **completely unstyled**: a failure no unit test can see, because it exists only in the
  emitted stylesheet. Run **`npm run verify:css`** (`scripts/check-sdk-css.mjs`), which greps the
  built CSS for a sentinel class used by an SDK component and by nothing in your repo. Keep the
  companion `@source not "../../scripts"` line too: without it Tailwind scans the guard's own source
  and emits the sentinel from there, so the guard passes even when the real `@source` line is gone;
  removing that line silently disarms the check.
- **Write NO wallet code.** An embedded game holds no wallet. The shell signs everything over the
  postMessage bridge (`sendMove(moveJson, signerName) → txHash`). The second argument is the channel
  participant you hold, and it is REQUIRED as of SDK 0.8.0: it binds the move so the shell refuses
  to sign under a different arcade identity. `BrokeredWriter` supplies it from the move's own
  `args[1]`, so you normally never touch it.
- **Smooth Play: the shell may put a move on chain with no wallet popup, and your game must not
  know or care.** A player can switch on a session key in the arcade: a burner derived in the
  shell's own origin from one EIP-712 signature by their wallet, funded with a little POL, and
  granted a scoped on-chain delegation, and the shell then signs eligible moves with it locally
  instead of raising a prompt (`xaya-arcade/src/lib/smooth-play/{session-key,routing,send}.ts`,
  used at `src/components/play/GameFrame.tsx`). **Nothing about the bridge changes**: you still post
  `arcade:move-request` and still get one `arcade:move-result` carrying a tx hash or an error, and
  the shell falls back to the wallet path whenever the delegated one does not apply. Three rules
  follow, and they are the whole of a game's obligation.

  **The key is never handed to the frame.** The shell keeps its session key in its
  own storage (`xaya-arcade/src/lib/smooth-play/session-key.ts`). The shipped planes'
  separate games origin prevents the frame from reading that storage. Enabling the
  same-origin override removes this boundary (§5). Games must use the bridge and
  must not request or search for shell keys.
  **Do not assume a popup, in either direction.** A move may now come back confirmed in far less
  time than a human takes, so anything gated on "the player is in a wallet prompt right now" is
  wrong; equally, Smooth Play is per player and per session and its grant lapses, so a popup can
  return at any moment mid-match. Treat a `move-result` as the only signal, exactly as before.
  **Emit the ordinary envelope and it stays eligible.** The delegated path is granted at the move's
  own nesting - the `g` namespace plus one game id - so the shell routes a move only when it parses
  as exactly that: one top-level `g`, exactly one id under it, an object payload, built with
  `JSON.stringify`. `BrokeredWriter` already produces that shape, and anything else (a sibling key
  smuggled beside `g`, a non-object payload) is not a failure: it simply takes the wallet path and
  costs the player a prompt.
- **Animate from a `requestAnimationFrame` loop reading refs or stores, never from render scope.**
  Game frontends build with `reactCompiler: true`, and an impure read in render scope gets
  argument-keyed-memoized and silently freezes. Verify against the **built bundle**, not vitest:
  the bug is invisible to jsdom. (Full row in this skill's `PITFALLS.md`.)
- **Never construct a root-absolute URL at runtime, and never write one as a literal.** See §5.

### Step 3a: how a player actually arrives, and the one signature that gets them there

**This is the default route into a game on the arcade, and a builder who does not know it will
misread their own lobby.** A player does not normally open your game and press *Create a game*. They
agree a match with someone in the arcade's **cross-game lobby**: one lobby spanning every game,
free until both sides accept, and land in your bundle with the agreement already made. Everything
below is recorded release by release in `arcade-platform/sdk/CHANGELOG.md`, which is the authority.

1. **The message.** After `arcade:caps`, the shell may send
   `{ type:'arcade:matchmake', role, seats, tier, peerName, ts }`. `role` is `'create'` or `'join'`
, which half of the agreement this player took; `tier` is `'free'` or the agreed stake in WCHI
   base units; `seats` is 2..8; `peerName` is the opponent's namespace-stripped Xaya name. The
   parser rejects a bad role, a seat count outside 2..8, and a `'0'` tier: free is spelled `free`,
   never a zero stake. It surfaces as `ArcadeBridgeValue.matchmake`: the agreement for this session,
   or `null` when the player did not come through the lobby (and always `null` standalone).
   `routeShellMessage` gains an optional `onMatchmake`; absent means drop in silence. Additive
   throughout - an older game drops the message, and a game on this SDK against a shell that never
   sends one renders exactly the ordinary lobby.
2. **The banner acts on its own - there is no button to press (since SDK 0.15.0).** It puts the
   transaction in front of the wallet as soon as the agreement can be acted on, and **the wallet prompt is the consent**:
   nothing is ever sent without one. Per role: a free creator's table opens at the agreed seat count
   with no press; a joiner's join goes out the moment the agreed peer's table appears; a paid
   creator is asked to approve WCHI first when their allowance is short, then to stake.
3. **At most one automatic prompt per agreement per step, latched in `localStorage`.** The agreement
   travels in the page's own URL, which makes that URL a replayable token for an automatic
   transaction, so neither a reload, nor reopening the link from history, nor middle-clicking it
   into a second tab may produce a second prompt, which would mean a second table or a second
   escrowed stake. A prompt the player rejects, or a send that fails, is **never** answered with
   another prompt: the banner says nothing was sent and hands over `Try again`.
4. **A played agreement never arms again.** It is CONSUMED the moment its own transaction confirms,
   keyed by when it was struck and who with, page reloads included.
5. **A spent agreement never talks a player out of a game they are still in.** *Match played: find
   your next game in the Lobby.* appears only when nothing of theirs is standing; while their table
   is open, their stake is escrowed, or their match is live, the banner says that instead, because
   leaving is the losing move in every one of those states, and at a stake it loses the stake to the
   timeout as well.
6. **Embedded, your manual create card is demoted (0.14.2).**
   Inside the shell it folds behind *Advanced: open a table on-chain now*, collapsed on every mount
   and never remembered: **except** a card the banner has armed (a paid creator told to stake
   below), which renders unfolded with no toggle. The fold is presentation only: same card, same
   handlers, and opening or closing it signs nothing. **Standalone builds are unchanged**: no shell
   lobby to route through, so the create card stays primary and no disclosure element exists in the
   tree at all. Since 0.17.0 a live agreement goes further and does not render the card at all
   unless the banner armed it (item 8); the fold is what an embedded lobby with **no** agreement in
   hand shows.
7. **The 90-second staleness line (0.14.2)** on a joiner's wait is a line of text and nothing more:
   nothing is cancelled, nothing is unarmed, and the clock restarts if the wait does. What **does**
   end a wait is the chain's own record of the exact table being watched (0.17.0): once an export at
   least as new as the table shows it filled without you, or shows the peer cancelled it, the wait
   is replaced by a line saying which of the two happened and the agreement is retired with it, so
   a later table of that peer's is not joined on your behalf. The "at least as new" guard is the
   point of the mechanism: a relay-cached state older than the height the table was seen at is
   missing that table because it did not exist yet, and reading that as a cancellation would retire
   a live agreement and, at a stake, walk the player away from money they had just escrowed
   (`sdk/src/components/ChannelLobby.tsx`, the watched-table effect).
8. **Embedded, a live agreement gets the whole screen to itself (0.17.0).** While the agreement is
   live, only the agreed match is drawn (with the cancel for a table of your own moved onto that
   card, so a player who changes their mind can always close a table they opened), and the ordinary
   lobby comes back the moment the agreement ends, cannot be honoured, or is spent with nothing of
   yours standing (`focusedOnAgreement`, `sdk/src/components/ChannelLobby.tsx`). Raw channel ids
   left the lobby with it. **Standalone is untouched**: there is no arcade lobby to have come from,
   so that is the only lobby there is. Nothing in your game selects this; it follows from the
   handoff.
9. **What you must do about all of this: nothing, but rebuild.** There is no protocol change and no
   shell release involved, but **every game bundle carries its own copy of the lobby**, so
   re-vendor the SDK and rebuild to pick it up. A bundle built on an older SDK keeps that SDK's lobby
   flow while the shell around it has moved on.
10. **One API note (0.15.0, mildly breaking):** `approve()`, `create()` and `join()` on
   `useArcadeWager` now resolve the tx hash they submitted (or `null`). Consumers annotating those
   three as `Promise<void>` need the type widened; call sites that ignore the result are unaffected.

### Step 4: test locally, with optional playground integration

**There is no chain in the template. Anything that needs a channel to be opened, adjudicated, relayed
or closed needs an arcade running.** Local rules and peer tests work without it. For a real match
before you submit, attach your build to the public playground (below). The operator runs integration
tests during review, and a playground of your own is optional.

**Offline: no chain, no relay, no funds, no network:**

```
npm test                        unit + repo suites
bash blob/tests/run-tests.sh    the C++ golden battery against the real blob (docker)
npm run e2e                     the channel scenarios (the SCENARIOS array in e2e/suite.ts)
: no chain, no relay, no funds
npm run e2e:determinism         the real blob in V8, replayed against the goldens
npm run selfplay                the scripted move driver
bash blob/check-blob.sh         structural gate on the blob (zero imports, export set,
                                no .debug_*, toolchain fingerprint, sha256 vs sidecar);
                                --rebuild also reproduces the bytes in the pinned container
npm run verify:css              the SDK's styles actually reached the built stylesheet:
                                the one failure below that no unit test can see; needs a
                                prior build (npm run build, or the --bundle export)
npm run dev                     single-client UI work ONLY
```

That is the whole offline ladder, and every rung of it is provable on your own machine. The
template's `e2e/` also carries a **live-deployment slice**: the on-chain scenario runner, its wager
support and the relay match driver, and the `e2e:smoke`, `e2e:bare`, `e2e:parsers`, `onchain` and
`e2e:relay` scripts that import them, which needs a chain, a host GSP with your blob registered, a
relay and funded names: an operator's deployment, not a builder's machine. The template's
`e2e/README.md` lists those files; a fork that runs no deployment deletes them, the scripts beside
them and the CI steps that call them, and the offline ladder stays green.

**There is no command that checks your four registration values
against your blob**: no such tool exists, and the reconciliation in step 5 is something you do by
reading and comparing, not by running.

**`npm run dev` is not `npm run dev:playground`.** Bare
`dev` sets no environment at all: the browser's wagmi transports fall through to **real Polygon**
(`getChainRpcUrls`, `sdk/src/lib/config/service-urls.ts`) and the dev wallet is off
(`sdk/src/lib/chain/dev-wallet.ts`). It renders the UI and nothing else: bridge inert,
no chain reachable, no dev wallet, no channel. Run it expecting a playground and you get a
wallet-connect prompt with no explanation.

**Optional: against a playground:**

```bash
PLAYGROUND_ORIGIN=https://test-arcade.xaya.io npm run dev:playground
```

The template's `package.json` requires `PLAYGROUND_ORIGIN` and derives the relay,
chain and GSP proxy destinations from it: `https://test-arcade.xaya.io` is the public
playground, or name your own. The script sets the relative chain RPC and enables dev
wallets for that invocation. Keep these settings out of `.env.local`: Next also loads
that file for production builds. A match needs your rules on that playground first:
attach them, or add them to your own stack (below). Only iterate the board here: the
picker's four wallets are the SDK's fixed addresses, which a playground neither funds
nor names, so a match is played on the playground's own `/play/<slug>`.

**The recognition test, because it is how you know the playground settings took:** on load you should see a
**dev-wallet picker, not a wallet-connect prompt.** A ConnectKit / MetaMask prompt means the
environment did not reach the browser; stop and fix that before debugging anything else. **What
that picker is not, on a stack plane, is a funded seat.** The roster behind it is the SDK's fixed
four addresses (`ALL_DEV_WALLETS` in `sdk/src/lib/chain/dev-wallet.ts`); the plane funds and names
the four wallets it minted at bring-up, which are the shell's (`pg_provision_wallets` in
`xaya-stack/scripts/plane-up.sh`). So the dev server is where you iterate the board against the
playground's live chain, relay and referee, and a match is played through the playground's shell at
`/play/<slug>`, where identity arrives over the bridge (below).

**Then build the bundle the way the stack builds it.** `NEXT_PUBLIC_GAME_ID` is the arcade's shared `g/` move
namespace: whatever that arcade serves as `gameId` in `<basePath>/arcade-config.json`
(`games-host/src/handler.ts`, the `/arcade-config.json` branch; cited by branch rather than by line,
because that file grows above it). **It is per plane, so read it rather than remembering it:** the
playground serves `xarc` and arcade.xaya.io serves `arcbeta`, and a `curl` of that JSON is the
answer for whichever plane you are building for. For that build:

```bash
NEXT_PUBLIC_GAME_ID=xarc bash scripts/build-export.sh --bundle
```

**That build prints warnings on a correct run: do not chase them.** The loudest is the
`frame-ancestors` one: with `FRAME_ANCESTORS` unset the export emits `frame-ancestors 'none'`, a
build nothing can embed, and `scripts/build-export.sh` says so rather than letting it pass
unremarked. For an Arcade submission that is expected and right: the platform bakes and serves the
headers itself at registration, so `FRAME_ANCESTORS` is for a build you host yourself. Setting it to
guess the arcade's origin is worse than leaving it unset.

**If you do host an export yourself, read `buildSecurityHeaders` before you deploy it.** It is the
SDK export the template's `src/middleware.ts` calls, and the one `scripts/build-export.sh` mirrors
into the static header files a fileserver reads, so its contract is your deployed CSP either way.
**As of SDK 0.16.0** the signature is `buildSecurityHeaders(frameAncestors?, { connectOrigins? })`,
and two properties decide whether a self-hosted build actually works. It **always** emits
`frame-ancestors` - `'none'` when you pass nothing, beside `X-Frame-Options: DENY` - so "no header"
is never the outcome, only a value that refuses every embedder. And its `connect-src` names
**concrete origins only**: there is no bare `wss:`/`ws:` scheme in it. A relay, GSP or chain RPC on
a different origin from the page must therefore be named: pass it in `connectOrigins`, or set
`NEXT_PUBLIC_RELAY_URL` / `NEXT_PUBLIC_GSP_URL` / `NEXT_PUBLIC_POLYGON_RPC` at build time and its
origin is taken from there. Miss that and the build loads, renders, and then cannot open its relay
socket: a failure that looks exactly like a dead relay. **A build on 0.15.5 or older emits the
older shape**: one argument, no `frame-ancestors` at all when you pass nothing, and a bare
`wss:`/`ws:` in `connect-src` that lets any cross-origin relay through, so after the SDK bump
re-read the headers your deployment actually serves rather than assuming the old build's behaviour
carried over. **As of SDK 0.20.4** `script-src` allows WebAssembly compilation only
(`'wasm-unsafe-eval'`): a production bundle that calls `eval` or `new Function` is refused, while
`next dev` keeps `'unsafe-eval'` for React's development build.

**On the public playground, attach it.** Open https://test-arcade.xaya.io/attach and enter the slug,
your game type (your code's `GAME_KEY`), the seat range and cfg suffix from `blob/MANIFEST.md` and your
repository's https URL, then upload `blob/rules.wasm`, `dist/bundle.tar.gz` and their `.sha256`
sidecars, the bundle built with the playground's namespace as above. The upload runs the submission
pre-flight (`arcade-platform/submissions/src/preflight.ts`), the bake and a real registration, and goes
live with no review; the same page lists every attached game. It skips the registrar's opening-state
check (`assertUsableOpenings` in `arcade-platform/scripts/register-rules.ts`), so a wrong seat range or
cfg suffix shows up as a channel that fills and never starts. Attached games are free-play only. To
ship a fixed build, attach again from the same browser: the page keeps the resubmit token that proves
the slug and game type are yours. The chain is wiped without warning and nothing there reserves a name
on the arcade: apart from the pre-flight it runs, the not-proven list below applies to it as well.

**Or run the pipeline on your own stack.** Nothing is uploaded: in your clone of
`xaya-stack`, add your fork as a submodule at `services/games/<dir>` and append one row to the games
table (`scripts/games-table.sh`: `slug|title|seats|gameType|<dir>|cfgSuffix|fee`; append only, because
position assigns games-host slots). That row is where the four registration values live on your
plane (§3 step 0): the seat range and the suffix in it are what your blob is registered under, so
copy both from `blob/MANIFEST.md`. Then `./stack up playground`, or, on a plane that is already up,
`./stack update playground` with no slug, which runs every stage of `up` and skips what is current;
`./stack update playground <slug>` is for a later bump of a game the plane has already registered:
builds the bundle from a `git archive` of the pinned commit with this plane's `NEXT_PUBLIC_GAME_ID`,
bakes and registers the games-host row, registers your game type on the fork's ArcadeWager, rebuilds
the shell image, and registers `blob/rules.wasm` on the fork's consensus registry through the plane's
admin wallet (`pg_wager_row` and `pg_register_blob` in `scripts/plane-up.sh`). The submodule must sit
at the commit your clone records with no local edits or the bring-up refuses it (`pin_check` in
`scripts/plane-lib.sh`): a change to your game is a commit in your fork and `./stack bump <slug>` in
your stack clone, never a hand-edited checkout.

The last column, `fee`, is who is paid the game's wagering fee: `platform` (your stack contract's own
`feeRecipient`), an 0x address, or `free` for free-only intake (`game_fee` and `game_free_only` in
`scripts/games-table.sh`). A free-only row is never registered on the contract, omits the wager
address from its games-host configuration, and registers its consensus row free-only; check
`pg_wager_row` and `register_row` before adding your game.

**One more file, because the shell frames only what its catalogue lists.** The shell bakes rows for
the first-party games alone, so write yours once as `content/games/<slug>.json` in your stack clone,
beside the games-table row: the stack's `docs/OPERATIONS.md` ("Taking a game in") carries the
template, in the shape `isValidGameRow` in `xaya-arcade/src/lib/registry/load-games.ts` accepts:
and `./stack rows`, which every `up` and `update` runs, writes it where the shell reads it
(`content_row` in `scripts/register-rows.sh`); a games-table game with neither a baked row nor that
file is refused by name. Nothing on your plane checks the listing copy in that row: §3 step 6
carries its bounds.

Use `techDemo: true` for a catalogue Tech Demo badge when appropriate
(`xaya-arcade/src/lib/registry/types.ts`, `StatusBadge.tsx`). It supplements the
status label and does not enable wagering or change the registered rules.

- **Play it at `https://<your playground>/play/<slug>`**: a game with a games-host row and a content
  row gets the same `/play/<slug>` page production serves, with your bundle framed inside the real
  shell, and a row in the lobby's picker. That page is what makes the
  embed evidence about **your** bytes: the iframe, the postMessage bridge, shell-brokered signing,
  the shell's letterboxing and its CSP are all exercised for your game here, not just beside it.
  The bare mount is still served at `<this plane's games origin>/g/<slug>/`: the path-mounted URL
  the shell's iframe itself loads, and that is the one to open when you want your game top-level
  with no shell around it. **Read that origin off the `/play/<slug>` iframe's `src` rather than
  remembering it:** it is a per-plane operator setting, it may carry your slug in the hostname, and
  read the configured shell origin; the games origin is separate on the shipped planes (§5). Because `/play/<slug>` is embedded, your own create
  card is folded behind
  *Advanced: open a table on-chain now* there (step 3a point 6), and on this plane that fold is how
  you open a table at all, because the shell's cross-game lobby never offers you one (item 4 below).
  Opening a second window from the same browser profile does **not** give you a second player, at
  either URL: the dev-wallet slot is per-origin, so both windows are the same account (next bullet).
- **Play it at every seat count you intend to declare, from N isolated browser profiles on N
  different dev-wallet slots.** "Open two tabs" does not generalise and is wrong even at N=2: the
  dev-wallet slot is a single per-origin `localStorage` key, so **two tabs of one profile are the
  same player**. N seats need N isolated storage contexts (N browser profiles, or N-1 plus one
  private window); in each one, explicitly select a *different* dev-wallet slot and **reload** - the
  selection is persisted per origin and only takes effect on the next page load
  (`arcade-platform/sdk/src/lib/chain/dev-wallet.ts` - `selectedSlot` / `selectedDevWallet` /
  `selectDevWallet`, keyed off `storageKey()`, which is **your** `storagePrefix`). Each slot owns
  its own `p/` names, so every seat is a distinct named identity. **Every visitor starts on slot 1**
 - `selectedSlot()` returns `'1'` whenever nothing is stored - so if two people are testing at
  once and neither switches, they are the same account racing each other's nonces.
- The four test wallets are the plane's own, minted at bring-up. If a transaction inexplicably
  fails, another window of yours is probably on the same slot: switch slots and reload.

**Fork resets.** `./stack down playground --wipe` destroys test chain state, referee data and
runtime registrations. `./stack up playground` reconstructs the games in the committed table.
Reload browser tabs afterward. Scheduled resets happen only when the operator installs the cron
entry from `xaya-stack/docs/INSTALL.md`.

**Fork growth.** Anvil retains mined history in memory; connector/referee data, logs and build
caches also grow. Install the activity ticker, monitor memory and disk, and reset the complete
playground when its test state is no longer needed. Do not restart the in-memory basechain alone
while retaining databases that indexed its old history. Setup and maintenance commands are in
`xaya-stack/docs/DEVELOPER-PLAYGROUND.md` and `docs/OPERATIONS.md`. For raw fork-EVM mechanics
and reorg testing, load the `building-persistent-games` skill.

#### What a playground does NOT prove

This is the single not-proven list. There is no second one.

1. **Not Polygon.** No real gas, no real WCHI, no real name prices, no mainnet congestion, no reorg
   behaviour. Above all: **a name or `gameType` that is free on your fork may be taken forever on
   mainnet.** Nothing answers that in advance: the operator's pre-flight over your submission is
   the first and only check (step 0).
2. **Not uniqueness.** Your plane's registry holds the games in your table and nothing else, so no
   name is ever tested against another builder's there, and the reserved-slug list is not applied
   at all: read `RESERVED_SLUGS` in `preflight.ts` yourself (step 0).
3. **Not the arcade's own shelf.** Your game *is* in your plane's shell: its lobby, its own
   `/play/<slug>`, your bundle in the frame, so the embed IS proven for your bytes here (§3 step
   4). What it is not is the real arcade's catalogue: nothing on your plane is listed, ranked,
   reserved or discoverable on arcade.xaya.io. **The mechanism is worth knowing, because it is the
   same one on every plane:** the shell's catalogue, its `/play/<slug>` page and the lobby's
   per-game entry all hang off a **content row**: on the arcade the operator's, on your plane the
   `content/games/<slug>.json` you wrote, and a plane with no row for your slug gives your game no `/play` page, no tile
   and no lobby entry, only the bare `/g/<slug>/` mount.
4. **Not the agreed-match handoff: for anybody, on a playground plane.** Step 3a calls it the
   default route into a game on the arcade, and it is the one thing on this list you cannot even
   watch a first-party game do here. Every action in the shell's cross-game lobby: agreeing a
   match, creating from it, joining it: is gated on a connected chat client
   (the `ready` gate in `xaya-arcade/src/components/lobby/LobbyClient.tsx`, *"an unreachable lobby
   must also be an unclickable one"*), and the playground shell is built with no homeserver
   (`site` in `xaya-stack/scripts/build-images.sh`). So no match is ever agreed here, no
   `arcade:matchmake` is ever delivered to any bundle, and the banner that acts on one never arms.
   Your game *is* an offerable row in that picker: the rule is "the content model calls it
   arcade-playable and this plane serves a bundle for its slug", and it deliberately never consults a
   wire type (`xaya-arcade/src/lib/registry/plane-games.ts`, `playableOnPlane`), but the picker
   itself never renders here, so you cannot reach it. The one lobby surface that works without chat,
   the on-chain "Waiting to play" list, is exactly the one that *needs* a wire type, and a row the
   shell reads at runtime never carries one: the loader strips it so such a row can never claim an
   existing game's channels (`xaya-arcade/src/lib/registry/load-games.ts`, `open-channels.ts`). So a
   channel you open in your game is not listed there either: you reach your game by its URL. Your
   `onMatchmake` handling is first exercised on the real arcade.
5. **Not a real wallet's latency or rejection paths.** Dev-wallet signing is instant and never
   rejected; the move broker waits forever by design. A game that renders a dead UI during a slow
   human approval looks fine here. The real ConnectKit / MetaMask / WalletConnect flows are not
   exercised either: the shell around your game is real on this plane, but the wallets behind it are
   dev slots, so a signing-UX bug that only shows with a browser extension is not caught here.
6. **Not wagering with real stakes.** A game attached to the public playground is free-play only.
   Your own plane registers every row of its table on the ArcadeWager
   it deployed on the fork and its games-host row with that address (`pg_wager_row` in
   `xaya-stack/scripts/plane-up.sh`, `register_row` in `scripts/register-rows.sh`), so your game
   can take stakes there in fork-minted WCHI unless its fee column is `free`. Whether it takes real ones on the arcade is an
   operator switch, not something this run decides. See this skill's `WAGERING.md`.
7. **Not the games-host or GSP version the arcade runs.** Your plane runs the pins your clone records
   (`git submodule status`) and the public arcade runs its own. The `arcade:*` wire is frozen and
   additive-only so this is bounded, but a platform-side behaviour change lands on your box only
   when you pull and `./stack update`.
8. **Not a security review.** The shipped planes isolate the shell from the games
   origin (§5), but a local playground run does not vet your code, assets or rules.
   Listing still requires repository review. Isolation does not prove a game safe.
9. **Not N>2 seats, unless you played them, and N>2 IS playable, so there is no excuse.** All the
   slots can complete a match: off-chain proofs are signed by a browser-generated session key, and
   on-chain moves are auto-impersonated, so a slot with no local private key is still a full player.
   A 2..4 game that only played the 2-seat path has proven the 2-seat path. Separately and always:
   playing here is **not** evidence for the seat *declaration*: that comes from the replay leg on
   your own machine, which the plane cannot see.
10. **Not latency, and not a phone.** A fork on your own box. Real-time feel over a real network, on
    mobile radio, is still unproven, and the plane emulates nothing, so whatever your adapter
    declares for touch (on-screen controls, the full-frame layout) is exercised only if you put your
    own browser in device emulation, which flips the coarse-pointer test and is enough to see the
    layout. Thumbs, and how big a target actually feels, need a real phone.
11. **What it *does* prove, precisely:** that **these exact bytes** - this blob, at these seat
    counts, with this `cfgSuffix`, this bundle built with the arcade's namespace - survive the real
    bake, register into a real GSP that runs the `arcade_alloc(0)` gate, and adjudicate a real
    channel opened by real on-chain moves and relayed signed proofs, **for the seat counts you
    actually played**, and that those same bytes boot inside the real shell's iframe at
    `/play/<slug>` and talk to it over the bridge. On your own stack they have **not** met
    pre-flight (`preflight.ts`): the stack applies none of its bounds, and the operator does, over
    your submission (§3 step 6). An attach to the public playground has met it.

**And it worked on a playground reserves NOTHING.** `gameType` is globally unique on the *real* chain
and burned forever on first real registration. A game that works perfectly on your fork can still
lose its name to someone else between your run and your submission, and there is no probe to warn
you, so the first you hear of it is a pre-flight refusal on the submission. Have a second `gameType`
in mind before you submit; re-identifying is the closed eight-file edit in §3 step 1, not a rewrite.

### Step 5: build the artifacts

Two pairs: `blob/rules.wasm` + `blob/rules.wasm.sha256` (from `blob/build-blob.sh`), and
`dist/bundle.tar.gz` + `dist/bundle.tar.gz.sha256` from:

```bash
NEXT_PUBLIC_GAME_ID=<the arcade's move namespace> bash scripts/build-export.sh --bundle
```

**`NEXT_PUBLIC_GAME_ID` is NOT your game key.** It is the arcade's shared `g/` namespace (defined in
step 4). This is the most common pitfall of the whole flow: built without it, the compiled
move namespace silently falls back to your `GAME_KEY`, the bundle passes pre-flight and gets
registered, and then **refuses to boot**, because the SDK's runtime config gate compares the
served `gameId` to the baked `moveNamespace` and hard-stops with a clean refusal screen and zero
console errors (`sdk/src/components/RuntimeConfigGate.tsx`). `scripts/build-export.sh` refuses to
build a `--bundle` without it. Bundles are otherwise
**deployment-blind**: bake only that one env, and endpoints arrive at runtime from
`<basePath>/arcade-config.json`. Two builds from an unchanged tree must produce the same sha256, on any
machine: the packer pins every tar header field - entry order, owner, mtime, and the file **mode**
(0644 files, 0755 directories, so a `git archive` and a group-writable checkout hash alike) - plus
`gzip -n` (`scripts/pack-bundle.sh`, called by `build-export.sh`), and the Next build id is a
content hash (`generateBuildId: async () => contentBuildId()` in `next.config.ts`, with
`contentBuildId` from `@xayaarcade/sdk/server`). `tests/repo/bundle-pack.test.ts` runs that packer
on two equal-byte trees with different modes and requires one hash; keep it.

**Submit the source commit you tested.** Run the strict rules rebuild check and commit the
compiled WASM with its SHA-256 sidecar. The operator rebuilds the frontend from that same source
commit with the target arcade's namespace; no production frontend bundle or bundle hash is
required in the issue. A self-hosted integration run must use the same rules as the submitted
commit, but completing such a run is optional.

**Reconcile the four registration values here too, by reading.** No command does it, so make it a
checklist: the `gameType` you are about to type equals `GAME_KEY` in `src/app-identity.ts`; the
`cfgSuffix` equals the suffix in your `blob/MANIFEST.md` byte table and is the same one your golden
traces were replayed under (`WASM.md` §A4); the seat range is a range you have actually replayed and
tested (§3 step 4, §6); and the `slug` is the proposed listing slug. Every one of these is a
value a human types once, against a blob that is already frozen.

**And play it on a phone before you hand it over**, because nothing in the ladder does. Device
emulation at a phone width flips the coarse-pointer test, which is enough to see the real layout and
the real overlay; how big a target actually feels under a thumb needs a real phone. Your adapter must
declare `touchControls` or `fullFrameOnTouch`, and your bundle must carry the `arcade-manifest.json`
that says so (§3 step 3): a bundle that states neither is labelled *Desktop only (for now)* on the
arcade and a phone cannot start a match in it, and `GET /api/games` on your own plane tells you which
of the two you are before anybody else finds out.

**And have someone who has never seen it play it.** The check is short: from what the game itself
shows, an unfamiliar player can state the objective and make a first useful move without being
told. That takes first-turn guidance on the board: what to do now, and what the click they just
made did, not only a manual or a help modal, and it is the one acceptance test the ladder cannot
run for you.

### Step 6: submit a GitHub issue

Use the Game submission form linked in §1. Include:

- Repository and full tested commit containing frontend, rules source, compiled WASM,
  its SHA-256 file, build instructions and pinned source dependencies.
- Compiled WASM path and hash. The template uses `blob/rules.wasm` and its `.sha256` sidecar.
- Game title, description, controls, supported devices and player counts.
- Proposed slug, game type (`GAME_KEY`) and `cfgSuffix` in hex or `none`.
- Build, rules, frontend and deterministic replay results, including tested player counts,
  devices and any checks you could not run.
- Whether you want WCHI wagering. Free play is required; wagering needs separate approval. A
  wagering request names the Polygon address your game's match fee is paid to; you will be asked
  to show it is yours. You can move it later from that address, and so can the arcade's operator,
  for a lost key or a delisting.

These are the fields in `arcade-submissions/.github/ISSUE_TEMPLATE/game-submission.yml`.
The public instructions are https://arcade.xaya.io/docs/submitting. Submitters need a GitHub
account and reviewer access to their source, not a deployment repository or running server.
Do not ask them to supply a production frontend bundle hash: the operator builds the frontend
for each target deployment. The compiled WASM hash must match the reproducible rules build.

The operator checks source, ABI, deterministic replay, fuel, UI behavior and integration on the
private playground before publication. Artifact and metadata bounds are defined by
`arcade-platform/submissions/src/preflight.ts` (`validateMeta`, `preflight`) and the ABI by
`arcade-platform/docs/ARCADE-ABI.md`. Use the template's build scripts so the frontend carries
its base-path placeholder and the approved move namespace; see §5. Games own no wallet and
must declare their input capabilities accurately.

Keep review discussion on the submitted issue. If changes are requested, post a new tested
commit and results there. For a listed game's update, open a new Game submission issue linking
the earlier one and describing the changes. The operator reviews and schedules the update;
rules changes must account for open channels. An issue does not publish or update a game.

### Known template gaps: plan around these, they are not bugs in your fork

- **No gamepad layer and no key remapping.** Phones are covered as far as input kind and framing go
: a keyboard game declares `touchControls` and the SDK puts a pad and buttons on the screen, a
  tap-native one declares `fullFrameOnTouch` and gets the whole display (§3 step 3), but there is
  no controller support and no way for a player to rebind keys, in the SDK or the template. Either
  is work you would do yourself.
- **The e2e harness is shaped around the template's own game.** `e2e/harness.ts` and the scenarios
  carry game-shaped assertions, and the golden-trace generator's scripted move driver is xayaman's
  move format. Porting them to your rules is its own stage, not a rename: budget for it, and see
  `WASM.md` §A4 for the trace half. The live-deployment slice under `e2e/` (§3 step 4) is not part
  of that port: delete it unless you operate a deployment.
- **There is NO self-serve update path.** Pre-flight refuses a slug or gameType that is already live
  or pending, so even when uploads open, v1 has no way for you to ship v2, and today the arcade
  takes no uploads at all. To update a shipped game you contact the operator; operator-side bundle
  swaps take effect immediately.

## 4. Invariants you must not break

- **Wire-frozen constants.** The `arcade_*` ABI, the move envelope `{"g":{...}}`, and the twelve
  `arcade:*` postMessage messages the SDK implements
  (`arcade-platform/sdk/src/lib/arcade-bridge/protocol.ts`): the eight originals (`hello`,
  `identity`, `move-request`, `move-result`, `presentation`, `chrome`, `chrome-state`, `theme`) are
  frozen and additive-only; `wager-request`, `wager-result` and `caps` were appended, and
  `matchmake` was appended in SDK 0.14.0 (§3 step 3a). New messages may only ever be appended. **One exception, and it is a real break:** SDK 0.8.0 promoted
  `move-request.signerName` from optional to REQUIRED: an unbound request is never signed. A
  bundle built against an SDK older than 0.8.0 must be rebuilt. The current shell ANSWERS such a
  request with an error `move-result` naming the problem (and the SDK's own
  `MoveBroker`/`BrokeredWriter` throw before posting, as of 0.9.0); only a pre-0.9.0 shell dropped
  it silently, where the symptom was a hang with nothing logged on either side. Registered game
  ids are frozen the same way.

  **The wager op list is appended to under the same rule, and 0.16.0 appended one.** `WAGER_OPS`
  gained `'evictSeat'` (carrying `matchIdx` and a `seat` integer) so an embedded game can broker a
  permissionless stale-seat removal through the shell exactly like every other wager op: a game in
  an iframe holds no wallet to send it with. Appended, so no existing op moved. **The consequence
  for a bundle: the shell must be on 0.16 before a game is re-vendored against it**, because a shell
  that predates the op drops the request in its parser and the game would be offering a button whose
  only outcome is a timeout. `WagerBroker` bounds that one op at 20 s (*"the arcade did not answer
  the eviction request"*) so an old shell costs a message rather than a wedged client; every other
  wager op still waits indefinitely, because it is a wallet prompt a player may take minutes over.
- **`gameId` vs `moveNamespace`.** A game's identity (`configureApp`) carries both, and on the
  arcade many games ride ONE shared namespace. Anything asking "which game is this" against a served
  config must compare the **moveNamespace**, and the bundle must be BUILT with the arcade's
  namespace (§3 step 5), or the config gate refuses to boot it.
- **SDK vendoring.** The sdk is `@xayaarcade/sdk` and arrives as `vendor/xayaarcade-sdk-<ver>.tgz`.
  **This file states no version**: the version is whatever `arcade-platform/sdk/package.json` says,
  and any repack **MUST bump it**, because a same-version repack silently installs stale content
  from the npm cache.
- **`NEXT_PUBLIC_*` is baked at build time.** A hosted bundle must not bake endpoints, dev-wallet
  flags or arcade origins; the runtime config supplies them (dev-wallet is an OPERATOR decision: on
  for a fork-testing deployment, off by default).

## 5. How your game is served: the games origin, the base path, your storage prefix

**The serving model, in four sentences.** Your game is served from the arcade's **games origin**,
mounted at **`/g/<slug>/`**: that path-mounted URL is what the shell's iframe loads, while the page
a player visits is **`/play/<slug>`** on the shell. Your bundle is **slug-agnostic**: the platform
bakes the path into it at registration, so you never see or choose it. Your UI discovers every
endpoint at runtime from **`<basePath>/arcade-config.json`** and never from a compiled-in URL. What
the games origin actually *is* - a separate origin, or the shell's own - is a per-plane operator
decision, and the next paragraph is the part that decides how much a bundle is trusted with.

**The shipped planes use separate shell and games origins.** Main Arcade loads
bundles from `arcade-games.xaya.io`; its shell is `arcade.xaya.io`. Playground uses
`test-arcade-games.xaya.io` and `test-arcade.xaya.io` respectively
(`xaya-stack/planes/{beta,playground}/compose.yml`, `GAMES_ORIGIN`). Check the actual
iframe `src` and runtime config when using another deployment.

In path mode, games-host rejects a games origin equal to the shell's unless the
operator explicitly sets `GAMES_SAME_ORIGIN_FIRST_PARTY=1`. The shell checks the
same override (`games-host/src/server.ts`,
`xaya-arcade/src/lib/registry/hosted-games.ts`). That override is disabled on the
shipped planes. Enabling it grants the framed code the shell's origin privileges.

A separate games origin protects the shell's DOM and storage. Games sharing that
origin still share an origin with each other: paths are not a browser security
boundary. Use your own `storagePrefix`, authenticate bridge messages, and keep
repository review as part of intake.

The served field set is `gspUrl`, `relayUrl`, `chainRpcUrl`, `arcadeOrigin`, `gameId` and
`devWallet` and `relayUrls` (every relay of the plane, a one-element list on a plane with one),
plus two written only when they apply: `wagerAddress` when the row has one, and `wagerBeta` when
the *plane* is a wagering beta (`games-host/src/handler.ts`, the `/arcade-config.json` branch).
The SDK's frame handles the relay list on its own: it probes each relay, connects to the nearest
and moves to the next after two socket failures in a row, so a game reads nothing from `relayUrls`
itself. A standalone build lists its relays in `NEXT_PUBLIC_RELAY_URLS` (comma separated) instead. **`arcadeOrigin` is the shell's origin**: it is the `postMessage`
target the bridge posts to and the `frame-ancestors` value your bundle is served with. Read it from
the config rather than deriving it from your own location: on a plane with a separate games origin
the two differ, and with the same-origin override they are the same string. `wagerBeta` is what
puts the beta payout disclosure above the stake button, and **only a literal `true` enables it**:
so a real launch turns it off with one JSON edit per plane rather than a rebuild of every game
bundle. `devWallet` is likewise an operator decision, not yours.

Two consequences of that serving model, and they belong in the same breath:

**The base path.** `scripts/build-export.sh --bundle` bakes `NEXT_PUBLIC_BASE_PATH=/__arcade_base__`
and **refuses a caller-supplied override** (`build-export.sh`), because a slug baked at build
time would produce a bundle that only ever serves under one path. Pre-flight rejects a bundle whose
root `index.html` does not reference that token (`preflight.ts`): if you hit that
rejection, you almost certainly ran `npm run build` instead of `./scripts/build-export.sh --bundle`.
Next rewrites its own surfaces (`next/link`, `next/image`, `/_next/*`) for you, but it does **not**
touch a plain `<img src="/sprite.png">`, `<a href="/rules">`, a CSS `url(/bg.png)` or `new
Audio('/pop.mp3')`. **Never write a root-absolute URL as a literal and never construct one at
runtime**: those are the assets that 404 under `/g/<slug>/` and nowhere else.

**Your storage prefix, and it now carries more weight than it used to.** Where the games get an
origin of their own, the browser isolates your store from the shell's: your `localStorage`: the
channel session keys the SDK generates and keeps there included - is unreachable from the shell's
origin, and the shell's own keys are not in yours. **On a first-party plane, where the games are
served from the shell's origin, there is no such separation** - your keys and the shell's sit in one
store, and a prefix collision is no longer only a game-versus-game problem. And an origin never
separated game from game anyway: a plane may serve every game from one games origin rather than a
host per slug, and there two games with the same `storagePrefix` write over each other. Assume the
shared store in every direction. `STORAGE_PREFIX` in `src/app-identity.ts` is a literal (`'xayaman'`
in the template) and stays one: **every fork replaces it, in the same edit that sets `GAME_KEY`,
and setting it *to* your `GAME_KEY` inherits that key's global uniqueness for free.** Never
`'arcade'`: that is the shell's own namespace and stays reserved. Shipping the template's prefix is
a live bug in someone else's game, not just yours.

Port and slot mechanics are **operator-only** and live in the platform repo and
`/docs/hosting-registration`. `games-host` accepts exactly two modes, `port` and `path`
(`games-host/src/server.ts`); the public plane is **path** mode, which is the model above.

## 6. Seats, payouts, and what the chain will actually take

**Two different ceilings, and it is easy to blur them.** The chain clamps a registration to
**2..4** seats (`MAX_SEATS`, `preflight.ts`, mirroring `MAX_BOARD_PLAYERS` in
`engine/gsp/wagering.hpp`): an out-of-range min/max is dropped with only a log warning, which would
register a permanently dead game. That is the **platform ceiling**. Your **own** ceiling is the seat
range your blob has actually been replayed at, and it is the one that matters: a declared seat count
nothing has ever replayed is a channel size nothing has judged. Widening your declaration means
widening your golden traces (`WASM.md` §A4), not editing a number.

**Two optional additive exports change how a finished game pays out.** Neither is in the register
gate's required list, so a blob without them registers fine and the host takes a documented
fallback (`WasmStateHandle::EjectedMask` and `WasmStateHandle::ShareWeights` in `wasm_judge.cpp`):

- **`arcade_share_weights(handle, out, cap)`**: per-seat payout weights, LE `uint16` per
  participant, written into a **1024**-byte buffer (`ARCADE-ABI.md` §5, `ShareWeights` in
  `wasm_judge.cpp`). The host rejects any length that is not exactly `2 × participants`, and a
  negative return is your blob's "no weights for this terminal" signal. **Absent, or returning
  negative:** settlement falls back to plain winner/draw. Read the next section before deciding you
  do not need it.
- **`arcade_ejected_mask(handle)`**: a bitmask of which seats a timeout ejected. **Absent, or
  returning negative:** the host falls back to requiring **every** participant's signature on any
  proof not anchored at the current reinit state. Survivors still play on: an anchored proof needs
  no signature coverage, but proofs can never be pruned again: they grow one transition per move
  forever, and a pruned proof is rejected on chain. Implement it if your game can eject a seat:
  **Xayaman, Xayatrails, Dungeon Channel and Vector Sumo do** (xayaships, 2-seat, cannot eject),
  so at more than two seats treat this as the norm rather than an optimisation.

#### Share weights at three and four seats, not an edge case

**If your game seats more than two, this is the normal path, not an exception.** Xayaman (2..3),
Xayatrails (2..4) and Dungeon Channel (2..4) all export `arcade_share_weights`; Xayaships and Vector
Sumo do not. Taurion Racer also exports both optional hooks
(`arcade-taurion-racer/rules/arcade_abi.cpp`), but its ejection mask is always zero
for a valid state: exporting the hook does not mean a game can eject players. A 3- or 4-seat game that does not export it settles **winner-take-all**. That is a
legitimate choice: it is just one you should make deliberately, because nothing warns you that you
made it.

**The fallback, precisely, because it decides money.** `SettleTerminal()`
(`arcade-platform/engine/gsp/logic.cpp`) requires *both* `terminal.ShareWeights(w)` **and**
`wager::WeightsValid(w, participants)`; if either fails it settles on `arcade_winner`: a seat
index pays that seat (`UpdateStats()`), `-2` is a draw (`SettleDraw()`), and `-1` hands every seat
an equal share of the pot (`RefundWageredChannel()`). Note what follows: the registry's
`drawPolicy` is honoured **only** on that fallback draw: a game's own valid weights always
supersede it. The validators are `DecodeShareWeights` and `WeightsValid` in
`engine/gsp/wagering.{cpp,hpp}`, and the absent-export fallback has its own test at
`engine/test/wasm_judge_test.cpp`.

**The unilateral-timeout gate, and it behaves differently above two seats.** A finished
terminal naming no executable payout is `unusable`, and the host then does two *different* things
(`engine/gsp/logic.cpp`, `ProcessExpiredDisputes`): **at 2 seats it settles to the survivor**; **at
3–4 seats it clears the dispute** instead. Never `SettleDraw`, at any seat count, because that would
route the pot through the registry's draw policy and could hand it to the operator. An ABI-legal
`-2` is deliberately overridden either way: honouring it would reach `SettleDraw` → `drawPolicy` →
the whole pot to the operator off a *unilateral* timeout, when a real draw-close needs every seat's
signature. The n>2 half is the more surprising one: nothing settles, the clock is simply cleared and
the board and the pot are left exactly as they were, because `k` seats may legitimately still be
playing and there is no single survivor to pay. Note too that above two seats an **unfinished**
post-timeout state is the ordinary survivors-continue case and is not unusable at all: only a
*finished* terminal naming no executable payout is.

**Three worked vectors, because the shape is not obvious from the spec:**

- **Survivor split with placements**: `arcade-xayaman/rules/arcade_core.cpp`. One survivor →
  `[10000]`. Two or more is only legitimate when the match was *configured* for multiple survivors,
  else it **fails closed** and returns no weights. Then either an equal split with the integer
  remainder going to the lowest-index alive seat, or a by-rank split where rank `r` of `k` gets
  `(k-r)` parts of `k(k+1)/2`, remainder to rank 0. Zero alive returns false and lets the host's
  draw-refund run.
- **Deliberate winner-take-all at four seats**: `arcade-xayatrails/rules/arcade_core.cpp`. Winner
  `10000`, everyone else `0`; a draw or an undecided terminal returns false. It exports the surface
  **only to keep the payout path uniform**, not because it splits anything. This is the "I chose
  winner-take-all on purpose" example: copy this one if that is your answer, rather than omitting
  the export and leaving it to chance.
- **Verdict-aware split**: `arcade-dungeonchannel/rules/dungeon_core.cpp`. A single winner takes
  `10000`; otherwise split evenly among seats that are standing and not ejected; if none, among the
  dead that are neither ejected **nor convicted**: a convicted cheater must not collect from the
  grave it dug; if none, among all non-ejected; remainder to the lowest eligible seat. The weights
  and the winner derive from **one place**, which is what stops a fraud verdict paying the cheater.

**Fail closed harder than the host requires.** Dungeon Channel's ABI wrapper independently verifies
its own weights sum to 10000 and returns `-1` if not (`arcade-dungeonchannel/rules/dungeon_abi.cpp`).
The host would have rejected them anyway, but returning `-1` yourself means **the fallback you
chose** runs, rather than one you did not.

**The 2-seat draw, unchanged and still the case people get wrong.** On the 2-seat dispute-expiry path
the host deliberately does *not* honour `arcade_winner`'s `-2`: a finished `-2` with no weights is
unusable and settles winner-take-all to the seat that did not time out. A 2-seat draw must therefore
be spelled `[5000, 5000]` in `arcade_share_weights`, which splits between the *players*; weights
outrank the `arcade_winner` readout on every close path (`ARCADE-ABI.md` §2, "One documented
exception").

**At more than two seats, a timeout is a reinit, not a settlement.** When a dispute expires at n>2
and your `arcade_resolve_timeout` output is not finished, the host installs those bytes as the
channel's new **reinitialisation basis** (`engine/gsp/logic.cpp`: `UpdateMetadataReinit` +
`Reinitialise`, not another state proof): the reinit id rotates, every pre-ejection signature dies,
and the required signers become the parsed reinit's participants minus your `arcade_ejected_mask`
bits. Obligations the host does **not** validate: never return a negative for the on-clock seat you
are passed (the dispute re-runs every block and stays pending forever); the post state must be
finished or expose a live non-ejected `whose_turn` (a not-finished NO_TURN state can never be
disputed again); `turn_count` must not regress; and carry the mask through `arcade_apply_move`. The
full contract is `arcade-platform/docs/ARCADE-ABI.md` §§2-3.

## 7. Operating the platform is not your job

You build a game; the operator runs the host. The full infra runbook - bringing up the host GSP
(`arcaded`) and the relay, registering rules blobs and UI bundles by hand, and running the
submissions service - lives in **arcade-platform** at `docs/RUN-FROM-SCRATCH.md`. This skill covers
building a game, not operating the platform.

### Shared reads and relay scaling

The stack runs a private `reads` service from `xaya-relay/src/read-server.ts`.
Its confirmed and pending producers share in-memory snapshots; public `/gsp`
requests and the shell's `/api/gsp-rpc` alias cannot start referee long polls or
state exports (`read-service.ts`, the plane front configurations). There is no
Redis dependency. Public GSP requests are single JSON-RPC calls, not batches.
Failed or stale upstream state returns an error; do not interpret it as an empty
registry or available wagering queue.

The relay uses WebSockets for subscriptions and signed game traffic. It reads the
shared service; clients retain the SDK's HTTP fallback. This is not SSE. Relay
joins and wallet RPCs have bounded admission, and slow sockets have a backlog
limit. Use the SDK's reconnect and resynchronisation behaviour rather than adding
an independent polling loop per game. Re-read the state after a disconnect.

The public chain gateway allows wallet methods explicitly and coalesces cacheable
reads. Pending reads and transaction submissions are uncached. Operators can set
`PUBLIC_POLYGON_RPC` separately from the connector's provider in the stack's
plane environment (`planes/beta/env.example`); sharing a key still shares its
quota. Keep the raw referee and provider credentials private.

For deployment, `./stack update <plane> relay` starts the shared reads before
switching the front and shell, then refreshes only that plane's edge routes
(`xaya-stack/scripts/update.sh`). Shared edge process changes can affect other
services; follow `xaya-stack/docs/OPERATIONS.md` when a restart is required.

Connection limits are not measured player capacity. Test state size and change
rate, active channel count, game traffic, latency, reconnects and upstream outages
on representative hardware. Full-state broadcasts still grow with the audience.
Additional relays and automatic relay selection are not implemented by this
release; both peers must use the same configured relay.

## 8. Quick answers

- *Where do players' wallets and names come from?* The shell (xaya-arcade) owns Connect and the XAYA
  name. Games receive identity over the bridge and request move signatures; they hold no wallet.
- *Why did that move go through with no wallet popup?* Smooth Play: the player armed a session key
  in the arcade and the shell signed the move with it instead of prompting. It is entirely
  shell-side: same request, same `move-result`, and the key never reaches your frame. §3 step 3
  carries the three rules a game has to respect, and all three are "keep doing what you were doing".
- *How do I get my game on the arcade?* Test it, then open the Game submission form in §1 with
  the exact source commit, WASM hash and game details. Self-hosting is optional (§3 step 6).
- *How long until my game is live?* Publication follows source review and private integration
  testing. Follow the issue for requested changes and the outcome; no deadline is guaranteed.
- *How do I update my shipped game?* Open a new Game submission issue with the tested commit,
  a link to the previous issue and a change summary. The operator reviews and deploys it.
- *Channel logs are silent: how do I debug?* Hot-path channel and relay logging is gated. Build
  with `NEXT_PUBLIC_DEBUG_CHANNEL=1`, or at runtime set the `localStorage` key
  `<storagePrefix>_debug` to `'1'` and reload (the prefix is the one you passed to `configureApp`:
  e.g. prefix `trailz` → key `trailz_debug`). `debugEnabled` / `dlog` / `dwarn` are SDK exports.
- *How does my UI find the GSP and the relay in production?* It doesn't:
  `<basePath>/arcade-config.json`, served next to your bundle, carries them (§5).
- *N players?* Rules are N-ready; you declare your seat range in your games-table row and in the
  submission (§3 step 6): never in code. The chain accepts 2..4 (`MAX_SEATS`, `preflight.ts`) and your
  blob's proven range is the real limit (§6); the lobby respects it.
- *Presentation and immersive mode?* Declare it on the adapter (§3 step 3). The shell letterboxes:
  except on a touch device when you declare `fullFrameOnTouch`, where it gives you the whole frame:
  hides chrome on request, and pushes theme tokens (`--arcade-*`). If your board is one square
  surface, `presentation.squareBoard` hands the frame to the SDK and you delete your own copy of
  that CSS. **Never rely on the shell answering**: standalone and dev must still work; graceful
  degradation is contract.
- *How do players find each other?* The arcade's own **cross-game lobby**: one lobby spanning every
  game, free until two players agree. Your game receives the agreement over `arcade:matchmake` and
  the SDK's banner acts on it; you implement no matchmaking. §3 step 3a is the whole flow, including
  why your own create card is folded behind *Advanced* when embedded.
- *Wagering?* A platform module, not game code: your rules and UI stay wager-free. The live ladder
  uses the tiers and windows from `resolveRegistryTerms` in
  `arcade-platform/submissions/src/chain.ts`; see this skill's `WAGERING.md` §1.
- *My game has secrets / simultaneous moves?* `HIDDEN-INFORMATION.md` and `COMMIT-REVEAL.md`. Read
  the first one before putting anything hidden in a board state: every seat holds that state.
- *Golden traces?* `WASM.md` §A4: the only home for the procedure.

Authority files for this document: `arcade-platform/{engine/judge/wasm_judge.cpp, engine/gsp/logic.cpp, docs/ARCADE-ABI.md, submissions/src/*.ts, games-host/src/*.ts, sdk/CHANGELOG.md, sdk/}`, `arcade-xayaman/{src/app-identity.ts, src/bootstrap.ts, scripts/build-export.sh, blob/, e2e/suite.ts, package.json, README.md}`, and for the per-game examples `arcade-xayaships/src/lib/arcade/presentation.ts` (the touch-layout measurements), `arcade-xayatrails/{blob/MANIFEST.md, rules/arcade_core.cpp}`, `arcade-dungeonchannel/{blob/MANIFEST.md, rules/dungeon_core.cpp, rules/dungeon_abi.cpp, src/game/game-shell.ts}` and `arcade-vector-sumo/{blob/MANIFEST.md, src/lib/vector-sumo/sha256.ts}`; the shell-side claims come from `xaya-arcade/{src/lib/smooth-play/, src/components/play/GameFrame.tsx, src/lib/registry/hosted-games.ts}` and the relay's liveness sweep from `xaya-relay/src/limits.ts`. Read the file, not this summary, whenever a claim decides something irreversible.
