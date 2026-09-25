# Hidden information on a channel whose every state is public

**The problem this file exists for.** A channel is often sold on privacy: moves stay off-chain
until resolution, and that is true about the *chain*. It is not true about the *opponent*. Every
participant holds the full signed state, and every transition is re-executed by every peer and by
the referee. **There is no such thing as state one seat cannot read.** Put a hidden hand, a secret
position or an unrevealed card into the board state and the opponent reads it out of the proof chain
at their leisure. Nothing warns you: the game plays perfectly, and the cheating is invisible because
it is not cheating: you published the secret yourself.

Everything below follows from one rule. **Secrets live client-side and never cross the wire; what
crosses the wire is a commitment to a secret, and later a proof about it.**

The reference implementation is **arcade-dungeonchannel** (private during the curated phase: access
on request). Every file path below is inside that repo unless it names another.

## 1. What is on the wire, and what is not

Dungeon Channel is a fog-of-war dungeon crawl at 2..4 seats. A champion has a position. **That
position is never on the wire.** What the shared state carries per champion is a `commitment`
digest, a `locator` plus a disclosure `level`, rolling `chainHead` / `locHead` values, and an
`admittedTile` only once that tile has actually been published (`src/lib/dungeon/codec.ts`). The
secret itself - a 32-byte master seed plus a plaintext path log - lives in `localStorage` and in no
signed state anywhere (`src/lib/dungeon/secret.ts`).

Read those two files side by side before you design anything. The discipline is visible as an
absence: there is no field you could decode into a position, because none was ever encoded.

Key every per-seat secret by the channel **and** the seat, never by the channel alone. One browser
can hold both seats of a match - two names behind one wallet, or a tester switching sides - and a
channel-only key hands the second seat the first seat's secret: it commits to, answers from and
reveals a private state it never chose. The SDK's channel store carries `seatName`, the name the
seat was opened under, from the moment the channel manager is created until the channel is left;
it does not move when the shell's live identity (`xayaName`) changes mid-match, so read per-seat
storage under it, not under the live name. Dungeon Channel scopes its seed and path log by channel
and seat name (`src/lib/dungeon/secret.ts`), Xayaships keeps its fleet the same way
(`src/lib/ships/ships-secret-store.ts`), and Vector Sumo keys its round secrets by channel and seat
index (`src/lib/vector-sumo/round-secret-store.ts`).

## 2. Domain-separated commitments

Every preimage carries a short tag so that one hash construction can never be replayed as another:
a salt is not a commitment, a path head is not a locator head, and the tag is what makes that
structural rather than conventional. Four of Dungeon Channel's, recorded in `secret.ts`'s header:

```
salt_r    = SHA256("DCHS" || seed || LE32(r))[0..16)
C_r       = SHA256("DCH1" || seat || LE16(r) || x || y || action || salt_r)
Head_r    = SHA256("DCHC" || Head_{r-1} || C_r)
LocHead_r = SHA256("DCHL" || LocHead_{r-1} || LE16(locator) || level || claim)
```

The salt is the first 16 bytes of its digest, and `claim` is a single byte that is always zero on the
wire today but stays in the preimage because dropping it would move every locator chain ever built. The
authority for these is `rules/dungeon_core.cpp` and its golden vectors, never a block of prose.

**Tag every preimage from the first line of code.** Adding domain separation later means changing
every digest, which on a live game means a new gameType.

## 3. The anti-fork discipline: the transferable lesson

This is the part worth copying even if your game has no secrets at all.

Dungeon Channel **deleted from TypeScript every consensus preimage a normal move needs**. The
commit, salt, disclose and reveal derivations used to live in `secret.ts`, mirrored against
WebCrypto; they are gone, and the file documents their absence and why. Every signed move is built
by calling a blob export instead - `dch_build_commit`, `dch_derive_salt`, `dch_build_disclose` and
`dch_build_reveal` (all exported from `rules/dungeon_abi.cpp`) - driven from
`src/lib/dungeon/judge.ts`. One spelling of the wire format, in the blob, so no TypeScript mirror
of it can drift into a consensus bug.

The one deliberate exception is `src/lib/dungeon/folds.ts`: five public hash folds - the envelope
digest, the envelope link, the Q-frontier root, the step chain and the Q-bound fold - that the
blob runs internally but does not export, so the client that files an envelope dispute has to
compute them itself, and their outputs do go into that signed filing. They are kept honest the
other way round: each fold is pinned by golden vectors generated from the C++ authority
(`rules/dungeon_core.cpp`, via `tests/gen_vectors.cpp`) and checked in the codec tests, and every
filing is dry-run through the judge before it is signed, so a misfold produces a filing the judge
refuses, and a refused filing is never signed or sent. That is all the dry-run guarantees: the cheat
it would have prosecuted goes unprosecuted, and settlement runs on the table as it stands.

Note the sharpest part of the reasoning, which generalises past crypto: the rolling-head helpers were
deleted **even though they built nothing that gets signed**, because they were exercised only by a
golden-vector test. *Unused mirrored consensus code is the worst kind*: nothing forces it to stay
correct, so it rots quietly and is then trusted by whoever finds it next.

If you do keep a TypeScript twin, pin it the way `folds.ts` is: see `COMMIT-REVEAL.md` §2 for the
golden-vector approach, which is the other legitimate answer.

## 4. Graduated disclosure instead of all-or-nothing

A commitment you can only open completely forces a binary choice between total secrecy and total
exposure. Dungeon Channel runs a phase machine - `PHASE_COMMIT` / `DISCLOSE` / `AUDIT` / `FINISHED`
and the endgame phases (the `PHASE_*` constants in `src/lib/dungeon/codec.ts`) - over a **disclosure ladder**: at the fog
rung (`LEVEL_MIN`, which is 2) a champion publishes nothing at all, and at the contact rung
(`LEVEL_MAX`, 6) it publishes an exact tile with a walk proof (`LEVEL_MIN` / `LEVEL_MAX` in `codec.ts`).

The design lesson: decide *how much* a seat must reveal as a function of how close the interaction
is, rather than revealing everything the first time two players touch.

## 5. Fog of war is a referee predicate, not a client one

If the client decides what you can see, the client can lie. Directed sight in Dungeon Channel is
`beam ∧ pathDistance ∧ fovLOS`, evaluated in `src/lib/dungeon/judge.ts` against blob exports:
`dch_fov_los` and `dch_sight` (both exported from `rules/dungeon_abi.cpp`), with the single definition of
contact living in `classifyFrom` in `rules/dungeon_core.cpp`.

**Corollary for the renderer: hand it a *view*, never the state.** `publicTileOf()` in
`src/lib/dungeon/view.ts` builds the per-seat projection, and `src/lib/dungeon/arcade-match.ts` is
what wires it up. A renderer given the whole state will eventually leak it: through a debug overlay,
a sourcemap, or a React devtools panel.

## 6. The advanced rung: a private set-intersection test

Worth knowing exists, not worth building first. Dungeon Channel can answer "do our sets intersect?"
without either side learning the other's set, using Curve25519 / Elligator2 blinding
(`rules/dungeon_curve.{hpp,cpp}`, the `dch_pet_*` exports in `rules/dungeon_abi.cpp`), run off the main
thread by `src/lib/dungeon/pet-worker.ts` and `pet-client.ts` because the curve work costs real
milliseconds per round. Sealed envelopes on top of it let a victim seal one box per peer so that an
observer opens only what it is entitled to.

The transferable point is the threading, not the curve: **consensus-relevant cryptography that costs
more than a frame belongs off the main thread**, or your game stutters exactly when it matters.

## 7. Making non-reveal the worst move: the part builders get wrong

**A commitment scheme is only sound if refusing to open is punished.** This is a rules decision, and
nothing in the platform makes it for you. If stonewalling is safe, stonewalling is optimal, and your
game is decided by whoever is most willing to stall.

Dungeon Channel's payoff table, as an example of the shape rather than a template to copy:

- the endgame reveal opens the whole seed, so a full audit is always possible in principle;
- conviction stamps a `convictedMask` (`rules/dungeon_core.cpp`), and a **convicted seat cannot
  collect**: the share-weights split excludes it even from the dead-seats refund (ARCADE.md §6);
- a **false challenge convicts the challenger**, so accusation is not free either;
- and no seed means the audit cannot be satisfied, which routes to `arcade_resolve_timeout` and
  forfeit.

**Write your own version of that list down before you implement the protocol.** For every seat, for
every way they can go silent or lie: what does it cost them, and who pays if they are right? A
scheme where the answer is "nothing" for any row is not finished.

## 8. Records of accepted moves live on the trial, not in `applyMove`

A hidden-information game usually has to remember something about every move it sees go past: the
published sets, envelopes and commitments an observer needs later, the per-round values a settlement
filing is built from, and the natural place to write them is `applyMove`, right after the judge
accepts the bytes. That is a trap: the SDK verifies a peer's proof by applying its moves BEFORE it checks
the signatures and coverage, so a well-formed, judge-legal, unsigned proof reaches `applyMove` and is
rejected only afterwards. Anything written during that trial was written by a peer who had no right to
send those moves.

`ParsedBoardState.applyMove(move, trial?)` hands your rules one scratch object per proof walk; stage
what you learn on it, and implement `BoardRules.commitTrial(trial)` to write it into your records: the
SDK calls that once per proof it adopts from a peer or from your own move, after the adoption, and never
for a proof it rejected or dropped. Two rules the contract states: a walk starts at the proof's own
initial state, so consecutive commits overlap and may revise a turn already committed: key staged
records by turn and replace, never append, and a proof adopted straight from chain is walked the same way
once adopted, with nothing checked, because the host already verified its moves. Keep those records per
channel, too: one store shared by every match a tab plays lets one channel's evidence answer another's
questions.

## 9. Where this connects

- **`COMMIT-REVEAL.md`**: the same commitment machinery used for *simultaneous moves* rather than
  hidden state, at N seats, with the timeout path spelled out.
- **`SKILL.md` §4b**: the one-sentence version of the rule at the top of this file.
- **`ARCADE.md` §6**: share weights, including the verdict-aware split that keeps a fraud verdict
  from paying the cheater.
- **`PITFALLS.md`** rows 61 and 63: the mirror-drift trap and the non-reveal payoff trap.

Authority for this file: `arcade-dungeonchannel/{src/lib/dungeon/{secret.ts,codec.ts,judge.ts,view.ts,arcade-match.ts,pet-client.ts,pet-worker.ts}, rules/{dungeon_abi.cpp,dungeon_core.cpp,dungeon_curve.hpp,dungeon_curve.cpp}, blob/MANIFEST.md}`. Read the files, not this summary, before you commit to a commitment format: it is a consensus surface and changing it later costs a new gameType.
