# Commit-reveal: simultaneous moves on a strictly turn-based protocol

**Read `SKILL.md` §4 first.** It teaches turn-interleaving: P0's input is stored as `pending_input`,
P1's submission applies both together, and that is the right pattern for a physics batch, where the
second submitter gains nothing from seeing the first. This file is about the case it cannot express.

**The limit, stated plainly: P1 can read P0's stored input out of the state before choosing.** Every
participant holds the full signed state (see `HIDDEN-INFORMATION.md` §1). So turn-interleaving is
fair exactly when the choice is not the information, and broken the moment it is. A thrown attack, a
bid, anything rock-paper-scissors shaped: the second mover simply looks.

The fix is a commitment. Every seat publishes a hash of its choice; only once **every** seat has
committed may anyone reveal. `EXAMPLES.md` covers the simpler cousin: commit-reveal as a **one-shot
randomness beacon** for "who starts?" (arcade-xayaships). This file is the harder one: commit-reveal
as a **per-round move protocol at N seats**, where the hard part is what happens when someone never
opens theirs.

The reference implementation is **arcade-vector-sumo** (private during the curated phase: access on
request). Every path below is inside that repo.

## 1. The preimage, domain-separated and pinned both ways

39 bytes, and every field is load-bearing:

```
SHA-256( "VSM1" || u8 seat || u8 action || u8 direction || salt[32] )
```

`COMMIT_TAG`, `SALT_BYTES` and `COMMIT_PREIMAGE_BYTES` in `rules/crypto/commitment.hpp` fix the tag, the 32-byte salt and the total length;
`rules/crypto/commitment.cpp` builds it; `src/lib/vector-sumo/commitment.ts` is the TypeScript twin.
The `seat` byte inside the preimage is what stops a digest being lifted from one seat and replayed by
another.

## 2. Two implementations of one hash is a fork waiting to happen: pin them

Because the client must build the same digest the blob will check, this game has the hash twice. That
is exactly the drift `WASM.md` §A4 exists to catch, and the answer here is a **golden-vector file**:
`blob/tests/commitment_vectors.json` pins both sides against the same cross-language vectors, plus
the published FIPS/NIST known answers. A drift becomes a red test rather than a consensus bug found
in production.

`HIDDEN-INFORMATION.md` §3 documents the other legitimate answer: delete the TypeScript copy and
call a blob export instead. Pick one. Do not pick neither.

## 3. Salt generation must fail closed

32 bytes from the platform CSPRNG, and an explicit `InsecureRandomnessError` rather than a
`Math.random` fallback (`src/lib/vector-sumo/commitment.ts`), with an availability probe so the UI
can disable the lock-in button *with a reason* instead of throwing on the click. **A predictable salt
makes the commitment openable by anyone**, which silently removes the entire protocol while leaving
it looking like it works.

Note the primitive: `getRandomValues`, **not** `crypto.subtle`. That choice is deliberate and worth
copying: `getRandomValues` is available on plain HTTP over a LAN IP, where `crypto.subtle` is not
(`PITFALLS.md` row 58), and it is the only randomness this protocol actually needs.

## 4. The two-phase turn machine

`PHASE_COMMIT = 0` / `PHASE_REVEAL = 1` (the phase enum in `rules/arcade_core.hpp`). In `PHASE_COMMIT` the
`commits` list must be a **strict prefix of the rotation, in rotation order**; in `PHASE_REVEAL` the
commits cover the whole rotation and `reveals` is filling the same way
(the `State` struct's documentation in `rules/arcade_core.hpp`, enforced in `rules/arcade_core.cpp`). That prefix rule is what makes
the half-finished states representable and checkable rather than merely conventional.

## 5. Phase pinning is the whole security property

Both directions are rejected in `applyMove` (`rules/arcade_core.cpp`), and the comment there names the
stake: an early reveal - before every commitment is fixed - **is the exact attack this protocol
exists to stop**, and a late commit would be a second choice made after seeing an opening.

A commit must also leak nothing: its payload is the 32-byte digest and `action` / `direction` must
both be zero, or it is rejected (the `MV_COMMIT` branch of `applyMove`). The **last** commitment in the rotation is
what flips the state to `PHASE_REVEAL`: "every choice is now fixed, so and only so it is safe to
start opening them", and the reveal half restarts at the top of the same rotation.

## 6. The check the protocol rests on

Recompute the digest from what was just revealed and require equality against what that seat locked
in (the `computeCommitment` / `digestsEqual` check in `applyMove`). A wrong action, a wrong direction, a wrong salt, or a digest
lifted from another seat all fail there. The comparison is **constant-time**:
`digestsEqual` in `rules/crypto/commitment.cpp` OR-accumulates the differences rather than returning
early.

## 7. Resolution and tie-breaking

The **last** reveal resolves the whole round at once (`applyMove` calls
`vsumo::resolveRound` in `rules/game/update.cpp`), after which commits and reveals are cleared and the
phase returns to COMMIT. Resolving on the last reveal rather than incrementally is what makes the
round genuinely simultaneous: no partial application can be observed.

Tie-breaking at the round cap is `decideBoutOnRoundCap()` (`rules/game/update.cpp`): nearest to
centre, then fewer `edgeRounds`, then a drawn bout. **Have an explicit answer for the cap**; a
simultaneous-move game that can loop forever will.

## 8. When a seat commits and never reveals: the section that must not be skipped

`resolveTimeout()` (`rules/arcade_core.cpp`). Read it in full; the summary:

- **The in-flight round is ABANDONED, whichever half it was in.** Every commitment and every reveal
  is discarded and the phase returns to COMMIT. The reason is stated in the source and is the whole
  point: *a round that never resolved leaks nobody's hidden choice.* If you instead resolved the
  round with what you had, the honest players who already revealed would have their choices exposed
  by being the only ones standing.
- **No round is consumed**: the round counters are untouched.
- **`sequence` still increments.** A timeout resolution is a protocol step like any other, and the
  state it produces must order strictly after the one it replaced, or a peer holding the pre-timeout
  state could out-rank it. This is why the packed state carries `sequence` explicitly: the host
  requires `arcade_turn_count` not to regress across a timeout reinit (`PITFALLS.md` row 18).
- The timed-out seat is ejected and no longer standing. **≤ 1 live seat** ends it: that seat wins,
  or a draw if none are left.

## 9. The client must refuse to fabricate

If the salt is missing, or does not open the commitment the state holds for this seat, the channel
**does not invent a reveal**. There is none it could invent that the judge would accept, and guessing
only burns the turn. It surfaces a typed failure: `missing-secret`, `commitment-mismatch`,
`no-commitment`, `no-randomness`: to the HUD and returns null, letting the round stall into the
ordinary dispute/timeout recovery (`src/lib/vector-sumo/vector-sumo-channel.ts`).

## 10. Salts must survive a reload, and must never be reused

A page reload between committing and revealing is not an edge case: it is a tab refresh, a phone
locking, a browser reclaiming memory. Lose the salt and the seat cannot reveal at all. So it is
persisted, keyed by **`(channelId, seat, round, ejected-epoch)`**
(`src/lib/vector-sumo/round-secret-store.ts`, whose header explains each part).

The epoch term is the subtle one and the reason this section exists: **a timeout restarts a round
under the same round number**, so `(channel, seat, round)` alone is not unique across a timeout. If
this seat had already revealed before the timeout, its choice for that number is public, and reusing
the salt would republish a digest every opponent can already open. The epoch changes on ejection and
on nothing else, so a retry or a reload *within* one round keeps the same salt, which is **required**
(a fresh salt there would orphan the digest already on chain).

## 11. A rung-out seat still plays

A seat with nothing left to do must keep committing with a real salt, and may only reveal an inert
acknowledgement (the `inertAck` check in `applyMove`). Otherwise the wire leaks who is still alive: a seat
that stopped committing would be identifiable without anyone opening anything.

## 12. Where this connects

- **`SKILL.md` §4**: turn-interleaving, and the limit that sends you here.
- **`HIDDEN-INFORMATION.md`**: the same machinery used to hide *state* rather than a move.
- **`EXAMPLES.md`**: the coin-flip cousin (arcade-xayaships), and why both rows exist.
- **`ARCADE.md` §6**: what a timeout settles at each seat count, which is where §8 lands.
- **`PITFALLS.md`** rows 58, 61, 62 and 63.

Authority for this file: `arcade-vector-sumo/{rules/arcade_core.hpp, rules/arcade_core.cpp, rules/crypto/commitment.hpp, rules/crypto/commitment.cpp, rules/game/update.cpp, blob/tests/commitment_vectors.json, blob/MANIFEST.md, src/lib/vector-sumo/{commitment.ts,round-secret-store.ts,vector-sumo-channel.ts,sha256.ts}}`. The commitment format is a consensus surface: read the source before you fix yours, because changing it on a live game costs a new gameType.
