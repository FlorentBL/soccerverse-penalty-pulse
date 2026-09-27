# WCHI wagering (V5 payment-queue)

Add stake-to-play WCHI wagering to a Xaya **channel** game. Two players each stake B WCHI; the
winner is paid from a per-tier FIFO payout queue. **Settlement rides the existing channel
close/dispute path: no new proof/consensus surface.**

**Standalone vs Arcade.** Almost everything in this file is the **standalone** path: a game that
runs its own GSP hand-rolls its own wagering: its own contract, GSP settlement, lobby and deploy,
exactly as described from §2 on. A game hosted in the shared **Arcade** does none of it: there
wagering is a platform module the game opts into through the operator's registration data, and the
game's rules and UI stay wager-free. §1 is that whole story. Reach for §2 onward only when you own
the GSP.

**Two flavours of free play:** (a) a plain channel game with **no contract at all**: bare on-chain
`c`/`j` moves (the channel lifecycle in SKILL.md §2); or (b) a **free tier** (`bet=0`) inside the
wager contract's unified lobby, which still dispatches the start-match admin move but skips all
WCHI/queue logic. Use (a) if you never want the contract in the loop; use (b) for one lobby spanning
free + paid. Either way, **only paid tiers touch the payment queue.**

## 1. Wagering in the Arcade: the whole answer

A **platform module**, not game code. Your rules and UI stay wager-free: no contract, settlement or
lobby logic of your own; the SDK's lobby already carries the stake-tier UI behind `wagerConfigured()`
(`wagerConfigured` in `sdk/src/lib/wager/wager-config.ts`). Enabling it is three OPERATOR actions, and the chain fails
closed if any one is missing:

1. `registerGame(gameType, freeOnly, minPlayers, maxPlayers, feeTo)` on the deployed `ArcadeWager`
   contract (`registerGame` in `arcade-wager/src/ArcadeWager.sol`), where `feeTo` is who is paid the
   game's fee: its builder for a game taken in, the platform for its own. The recipient can move it
   with `setGameFeeRecipient`, and so can the contract's owner;
2. the GSP registration move's wagering block;
3. `--wager-address 0x…` on the bundle registration, which points the row's `--game-type` at the
   contract (`parseTypeFlags` in `games-host/src/register.ts`), and re-registering a wagered game
   *without* re-passing it turns its wagering off as a side effect. That is not a special case:
   registration is a **full-row replace**, and only `port` and `history` survive it: every other
   field, wagering included, is written wholesale on every call
   (the registration writer in `games-host/src/registration.ts` states exactly this, and why there is no partial-update
   path).

**What the Arcade's live ladder and windows actually are.** A builder does not choose these: they
are one registry row per game, written by the operator from a single source, but you need them to
reason about your own game at all: whether a 10 WCHI tier is reachable, and how long a dispute runs
before the referee decides it. The tier list is **free / 1 WCHI / 10 WCHI**
(`bets: ['0', '100000000', '1000000000']`), the rake is **5% burn + 5% fee** (`burnBps: 500`,
`feeBps: 500`, so the winner takes 90%), and the draw policy is **refund**: all at
`resolveRegistryTerms` in `arcade-platform/submissions/src/chain.ts`. The three block windows are deliberately
human-scale rather than test-scale: **300** blocks of dispute, **150** of grace, **900** of channel
timeout: roughly ten minutes, five minutes and thirty minutes at Polygon's block time
(`HUMAN_SCALE_WINDOWS` in `submissions/src/chain.ts`, spread into the registration move by `createRealChain`).
Your blob must be able to answer `arcade_resolve_timeout` sensibly at *that* cadence; the much
shorter windows a fork-testing deployment runs are not what a real player experiences.

**The contract is ArcadeWager v2, v3 or v4, and from SDK 0.16.0 the client speaks nothing older than v2.** This is a
plane property rather than anything you write, but it decides whether a bundle works at all, so know
which side of it you are on. The v2 contract put the **payout amount** into the replay key, made a
join name the queue group it consents to settle, and let anyone remove a seat whose player name has
moved away. The SDK mirrors all three, and `checkWagerContract` accepts **versions 2, 3 and 4**, each
by exact value (v3, accepted from SDK 0.20.5, keeps v2's interface and only refuses more; v4, from
0.20.6, keeps v3's lobby interface and pays each game's fee to that game's own recipient): a v1
deployment fails the gate outright, because its four-field key would answer "unpaid" for every row
the package asks about. So: **games must be rebuilt against the redeployed contract, and a build
carrying the old client against the new address (or the reverse) reads the payment queue wrongly and
must not be pointed at either.** The seat removal surfaces to a player as *"Remove stale seat"* in
the SDK's wager panel and is permissionless, so it needs no seat of your own, and, because an
embedded game holds no wallet, it is brokered through the shell as the appended `evictSeat` wager
op, which is why the shell must be on 0.16 before games are re-vendored against it (ARCADE.md §4).
Your rules and your UI still contain none of this.

**One platform behaviour worth recognising, because it is what a paid join can fail on with nothing
wrong in your game.** The Arcade's payout queue is pooled and holds several groups (§3), so the
group a fill lands on can move between the moment a player reads the queue and the moment their join
is mined: another lobby, in any game, can consume the front in between. The contract therefore
takes the joiner's consent explicitly rather than inferring it: `joinMatch` carries the `matchId` of
the queue group the player agreed to pay, the fill requires that same group to still be the one it
lands on, and a join or a fill that no longer agrees **reverts** instead of paying a group nobody
agreed to: `queue front moved` when the landing group is not the consented one, `consent mismatch`
when a later seat in an N-seat lobby names a different group from the one that lobby is already
bound to. `getMatchConsent(matchIdx)` reads back what a lobby is bound to and is zero until a paid
seat has consented. The SDK checks pooled capacity before approval or channel creation
(`wagerCapacityMessage` in `sdk/src/lib/wager/capacity.ts`, `ChannelLobby.tsx` and
`WagerPanel.tsx`). Full or unverified queues disable paid actions and show the
waiting reason; agreed matches retry when capacity becomes available. Free play
or another stake remains an option. Availability can change before inclusion, so
the contract consent checks are still required and a racing transaction can revert.

The template's README §8 has the full chain; the operator flags are documented in `games-host`'s
README. Do not hand-roll it. (Standalone, non-Arcade games hand-roll wagering instead: that is the
rest of this file.)

## 2. Why a payment queue (not escrow)

Xaya's data flow is one-way: blockchain → GSP, **never** GSP → chain. The GSP can't tell a contract
who won. So instead of escrow + oracle:

1. Both players deposit B WCHI (paid tiers only).
2. The contract pays `2B·(1−rake)` to the **front** of a per-tier queue of earlier winners.
3. The GSP appends this match's winner to the **back** of the queue on close.
4. A win is paid once every payout queued ahead of it at that stake and seat count is paid, which
   can take several **later** matches. Rake = burn% + fee% (the Xayaman deploy script sets both
   to 500 bps → winner 90%: `BURN_BPS` / `FEE_BPS` in `contracts/script/DeployXayamanWagerV5.s.sol`).

No oracle. The contract runs the lobby + payments; outcomes flow through Xaya. (Daniel Kraft's "PvP
with Payment Queue".)

## 3. The forwarding chain's failure mode ★

Nothing accumulates in the contract: it disburses the whole pot at start, so the damage from a
wedged match is never trapped money, it is a **lost queue group**. Standalone, each tier is seeded
exactly once (§9), every start pops a group and every close pushes one, so **depth sits at 0 for the
whole life of an in-flight match**. If that match never closes, depth never returns, and all three
layers then refuse: the GSP's front-match check, the contract's "snapshot must be non-empty"
require, and the frontend's front computation, so the tier is dead, silently: the button is still
enabled, the payout preview still correct, and the create just reverts. **Standalone, there is no
operator re-seed.** This is not theoretical: it was reproduced on a fork, before the Arcade pooled
its queue: two players abandoning one paid match killed that stake tier for good.

**The Arcade no longer works that way: do not carry the numbers above across.** Its queue is
**pooled**: a combo is `(tier, num_players)` with **no game level at all**, one FIFO shared by every
registered game, so 10 WCHI is 10 WCHI across the whole arcade. A combo is seeded **three groups
deep** (`kSeedDepth` in `wagering.cpp`), once ever, when the first `reg` admin move whose bet list
and seat range reach that combo is processed; a second game registering at an already-seeded combo
seeds nothing. So the first **three** paid matches at a cold combo pay their pot to the operator as a
one-time bootstrap fee, and up to **three** paid matches can be in flight at that combo
simultaneously: depth does not sit at 0 while one is playing. A live combo is deepened **only** by
the `seed` admin move (`{"cmd":{"seed":{t,n,addr,burn,fee}}}`, authored as the contract-owned `g/`
game name), never by another `reg`, so on the Arcade an operator re-seed *does* exist. And an
abandoned paid match **returns its group**: the abandon reaper puts one group back per reaped
channel, payable to that match's own players, and a front-matched paid start that cannot open a
channel does so immediately. An abandoned in-flight paid match therefore no longer kills the tier:
it costs one unit of concurrency until the channel is reaped, then heals.

Five ways depth is lost, all of which your implementation must answer:

1. **an abandoned in-flight paid channel** - the reproduced one (**Arcade:** healed - the reap
   returns the group, so this costs one unit of concurrency, not the tier);
2. **pop without a channel**: never pop the front before every check that can still refuse to build
   the channel has passed; a pop followed by a failure loses the group with nobody at fault;
3. **registry/contract divergence** - if payments are acknowledged before the start's own rejection
   paths, an ordinary operator change (disabling wagering, narrowing seats) burns a group per
   attempted start, and re-enabling does not re-seed (**Arcade:** healed - a front-matched paid start
   that cannot produce a channel puts its group straight back);
4. **prepaid poisoning** - the prepaid marker (§7) must be keyed by everything that scopes a queue:
   the reference standalone schema keys `invalid_payments` on `(address, match_id)` only
   (`engine/gsp/schema.sql`), and the Arcade's fix for exactly this attack keys it on the full combo,
   `(tier, num_players, address, match_id, amount)` - no game column, because the Arcade's queue is
   pooled across games. With a too-narrow key, a marker fabricated in one tier makes an honest close
   in another push nothing;
5. **a contract replay key narrower than the GSP's prepaid key**: the same mistake on the other
   side of the bridge, and the one that wedges a combo permanently. The contract's own paid-marker
   must be keyed on everything the GSP keys prepaid on, **the amount included**. The reference
   standalone base keys `paymentMade[bet][matchId][payee]`
   (the `paymentMade` mapping in `contracts/src/XayaPaymentQueueV5.sol`) and survives it only because its snapshot is a
   single entry whose payout the contract computes itself, so there is exactly one amount per
   `(bet, matchId, payee)`. The moment a caller states per-entry amounts - which is what a
   multi-group, N-seat snapshot means - an amount-free key lets a payment at a **made-up** amount
   mark the true queue front paid forever on the contract while the GSP, keyed on the amount, still
   owes it. Nothing pops it: no later honest start can pay that entry, because the contract refuses
   any snapshot containing an already-paid one, and every honest paid start at that combo afterwards
   forfeits its stakes with no channel and no refund. The Arcade's contract keys the marker on
   `(betAmount, numPlayers, matchId, payee, amount)` for exactly this reason. **Make the two keys the
   same width in both directions**: route 4 is this same rule pointed at the GSP.

**Two remedies, both proven, and both worth wiring into your UI.** Either player can settle an
abandoned channel with a Close (Forfeit) from the lobby: depth comes back carrying that channel's
own id and pot. And **anyone at all** can force it: a dispute needs no signature and no participant
status when the proof equals the channel's on-chain reinit state, and the GSP publishes that proof in
its state export, so an operator or a bystander can settle a channel whose players never return.
Surface stale channels in the lobby with a close button, and treat channel expiry as what keeps the
queue alive rather than as lobby hygiene.

## 4. Contract architecture

Two files under `contracts/src/`:

| File | Role |
|---|---|
| `XayaPaymentQueueV5.sol` | game-agnostic **base**: lobby (`createMatch`/`joinMatch`/`abortMatch`/`expireMatch`), per-tier queues, WCHI splits, `paymentMade` tracking, admin-move dispatch |
| `<Game>WagerV5.sol` | thin **subclass**: overrides ONLY `_buildStartMatchMove()` (the game's admin-move JSON) |

Constructor params are **immutable forever**: a typo in `feeRecipient`/`burnAddress` is permanent,
triple-check before broadcasting. What you actually deploy is the subclass's 8-arg constructor:

```
<Game>WagerV5(xayaAccounts, allowedBets[], burnBps, feeBps,
              feeRecipient, burnAddress, gameId, matchExpiryBlocks)
```

which forwards to the base's 10-arg constructor: **careful with positions 7–9**: they are
`(nameNamespace, adminName, gameNamespace)` (the constructor of `contracts/src/XayaPaymentQueueV5.sol`), i.e.
the name the contract owns/sends-as and the move namespace are *separate* args. The Xayaman subclass
passes `("g", gameId, gameId)` so all three collapse to the game id: if you call the base directly
with adminName ≠ gameNamespace swapped, you deploy an immutable contract that can never deliver a
move.

**These next values are the STANDALONE reference's, not the Arcade's.** The Arcade's own ladder is
free / 1 / 10 WCHI with its own windows (§1): do not carry the numbers below across; they are here
because this section is about deploying your own contract.

Xayaman launch values, all from `contracts/script/DeployXayamanWagerV5.s.sol`: tiers
`[0, 10 * 1e8, 100 * 1e8, 1000 * 1e8]` (Free/10/100/1000 WCHI in raw 8-decimal units),
`burnBps=500` + `feeBps=500` → winner 90%, and the subclass's `nameNs="g"`. `matchExpiryBlocks` is how
long an open (un-joined) match stays joinable. The creator can `abortMatch` **anytime** to cancel and
reclaim their staked WCHI; once expired, **anyone** can call `expireMatch` to deactivate it and refund
the creator (both are no-op refunds for the free tier).

**Two rules the file layout does not show you, and both decide money.**

- **Bind the joiner's consent to the queue entry that gets paid, and re-check it when the match
  fills.** The base contract takes an `expectedPayment` beside the join and requires its `payee` and
  `matchId` to equal the stored entry's - those two fields and nothing else, the amount included in
  the nothing (`joinMatch` in `contracts/src/XayaPaymentQueueV5.sol`) - having separately required the
  stored queue to hold exactly one entry (the `invalid queue snapshot` check in the same function). The amount is out of the consent because the
  contract computes the payout itself, so a player who read one front cannot be made to pay a
  different one. That is complete **only** while both of those conditions hold: a single-entry
  snapshot, and a join that *is* the fill. Generalise the queue: more than one
  group in a snapshot, or N seats filling across several transactions, and the group the payment
  lands on can move after a joiner has consented and before the match fills; then the consent has to
  be checked again at the fill, not only at the join, or a joiner pays a group they never agreed to,
  the GSP refuses to build a channel for a start that does not match its own front, and the stake is
  gone with no channel and no refund. The Arcade's contract does the second half: consent names a
  `matchId`, the fill requires the landing group to still carry it, and a drifted lobby reverts
  rather than paying (§1).
- **Key the paid marker on the payout amount as well**: §3 route 5.

## 5. Authorization: the contract OWNS `g/<gameid>`  ★

This is the key V5 fact. An earlier design authorised admin moves through a `p/` admin name; V5
does not: authorization is NFT ownership of `g/<gameid>`:

- The subclass passes `nameNs = "g"`, so the contract owns the **game name** `g/<gameid>`
  (`contracts/src/<Game>WagerV5.sol`).
- `initialize()` requires `ownerOf(adminTokenId) == address(this)`
  (`initialize` in `contracts/src/XayaPaymentQueueV5.sol`): register `g/<gameid>`, `safeTransferFrom` the NFT
  to the contract (its `onERC721Received` accepts only that exact token), then `initialize()` (which
  approves WCHI to XayaAccounts for payouts).
- The start-match admin command is sent **by `g/<gameid>` itself**, as `{"cmd":{"s":{…}}}`.
  libxayagame surfaces a game-name's **own** moves in a **separate `blockData["admin"]` array**:
  never in the player `moves` array. The GSP trusts it purely because `g/<gameid>` is contract-owned
  (`engine/gsp/logic.cpp`, the admin-command loop). **No magic admin name; authorization = NFT
  ownership.**

Contrast with the legacy `p/`-admin-name model: there is no admin `p/` name, no name-equality check,
and admin moves do **not** ride the player-move envelope.

## 6. Admin start-match move (the only admin command)

Built by `_buildStartMatchMove` (`contracts/src/<Game>WagerV5.sol`). Fields:

| key | meaning |
|---|---|
| `p0`/`p1` | Xaya player names |
| `a0`/`a1` | session signing addresses (off-chain channel moves) |
| `w0`/`w1` | wallet addresses (WCHI payouts; = `msg.sender` of create/join) |
| `bet` | raw WCHI tier (`"0"` for free) |
| `pay` | **paid only**: `{addr,mid,amt}`: which queue entry this join pays |

`a0`/`a1` must be **canonical EIP-55 checksummed** addresses. The referee stores
each verbatim and later compares a recovered signer against it character for
character, so a seat registered in any other spelling (all-lowercase is what a
browser wallet hands out) can never prove a move. The contract refuses a
non-canonical signing address at create/join, and from its rules-activation
height the GSP rejects a start whose seat is non-canonical. This is the opposite
of the `pay.addr`/`w0`/`w1` payee fields, which are compared lowercased: derive
`a0`/`a1` with a checksumming helper, never `toLowerCase()` (PITFALLS rows 47, 66).

Free tier (`bet=0`): omit `pay`, **3** closing braces:

```json
{"cmd":{"s":{"p0":"alice","p1":"bob","a0":"0x…","a1":"0x…","w0":"0x…","w1":"0x…","bet":"0"}}}
```

Paid tier (`bet>0`): include `pay`, **4** closing braces:

```json
{"cmd":{"s":{…,"bet":"1000000000","pay":{"addr":"0x…","mid":"<64hex>","amt":"<payout>"}}}}
```

`_buildStartMatchMove` is the **only** method your subclass overrides: plain string concat
(`contracts/src/<Game>WagerV5.sol`):

```solidity
function _buildStartMatchMove(
  string memory p0, string memory p1, string memory a0, string memory a1,
  address w0, address w1, address payAddr,
  bytes32 payMid, uint256 bet, uint256 winnerPayout
) internal pure override returns (string memory) {
  string memory prefix = string.concat(
    '{"cmd":{"s":{"p0":"', p0, '","p1":"', p1, '","a0":"', a0, '","a1":"', a1,
    '","w0":"', _addressToHex(w0), '","w1":"', _addressToHex(w1),
    '","bet":"', _uint256ToStr(bet));
  if (bet == 0) return string.concat(prefix, '"}}}');              // free: 3 braces
  return string.concat(prefix,                                     // paid: 4 braces
    '","pay":{"addr":"', _addressToHex(payAddr), '","mid":"', _bytes32ToHex(payMid),
    '","amt":"', _uint256ToStr(winnerPayout), '"}}}}');
}
```

**Sequence (no relayer):** a player calls the base contract's `joinMatch()`; within that same tx the
contract sends this move from `g/<id>` via
`xayaAccounts.move(nameNamespace, adminName, mv, type(uint256).max, winnerPayout, payAddr)`
(the payout move in `joinMatch`, `contracts/src/XayaPaymentQueueV5.sol`): the `amount` + `payAddr` args transfer the WCHI payout
to the queue front atomically. XayaX: the bridge that turns Polygon `move` transactions into the
block/move feed a libxayagame GSP consumes; load the building-persistent-games skill for the full
section: delivers the move to the GSP's `blockData["admin"]`, and `HandleStartMatch` builds the
channel. Nothing watches events off-chain.

## 7. GSP side (`engine/gsp/`)

`schema.sql`: three **paid-only** tables:

| table | purpose |
|---|---|
| `payment_queue` (position PK, address, match_id, tier) | per-tier FIFO (`WHERE tier=? ORDER BY position ASC`) |
| `invalid_payments` (address, match_id) | out-of-order ("prepaid") payments, so a payee isn't paid twice, but see §3 route 4 before you copy this key |
| `wagered_channels` (channel_id, match_id, creator_wallet, joiner_wallet, tier) | binds a channel to its match for close-time settlement |

`HandleStartMatch` (`logic.cpp`): runs on **every node**, so bounds-check everything BEFORE creating
a channel:

1. Validate `p0/p1/a0/a1/w0/w1` are strings; lowercase the wallet addresses; reject `p0 == p1`.
   (Note when porting: a *missing* `bet` field falls back to tier 10: a legacy-move compatibility quirk,
   `logic.cpp` `int64_t tier = 10;`, while an unparseable one rejects.)
2. **Paid tier:** require `pay{addr,mid}`; `mid` must be 64-hex; validate against the tier's FIFO
   **front**. Pop already-prepaid fronts; if the payment matches the front → pop it, proceed; if it
   matches a non-front entry → record prepaid, no channel; else record prepaid + reject.
3. **Free tier:** straight to channel creation.
4. `BuildWageredChannel`: reproduces a normal create+join metadata in one step (participant 0,
   reinit, participant 1, `Config` in `custom`, initial board state). Seed is **deterministic** =
   first 32 bits of the channelId hex (`logic.cpp`, `BuildWageredChannel`), so every node builds the
   same board.
5. Insert the `wagered_channels` binding.

Settlement on close (`UpdateStats` → `SettleWageredClose`, `logic.cpp`):

- Winner index `0` → creator wallet, `1` → joiner wallet.
- **Paid tier:** enqueue the payee at the queue **back**, keyed by `channelId.ToHex()`: **never** the
  paid matchId (reusing it collides with the contract's `paymentMade` guard and permanently bricks
  that payee). If the payee was already prepaid, clear the prepaid marker instead. Delete the binding
  row.
- **Free tier / free-play channel:** stats only, no queue.

## 8. Draw policy: forfeit to house

A wagered draw (simultaneous KO → board `finished` with `winner < 0`) can't be split or refunded by a
FIFO queue, so Xayaman's policy is to **forfeit the pot to the house**.
`HandleDisputeResolution` detects `finished && winner<0` → `SettleWageredDraw` → enqueues the
**operator** (the `--bootstrap_queue_address` wallet) as the tier's payee (`engine/gsp/logic.cpp`).
Both players lose; the queue stays balanced. No-op for free play. (If your game can't produce
simultaneous KOs, this path is dead, but implement it anyway; it's consensus-reachable if a draw is.)

## 9. Queue bootstrap (fresh datadir only)

The very first paid match on a tier has no earlier winner to pay, so seed the queue front with the
operator wallet on a **fresh DB** (`InitialiseState`, `logic.cpp`), via the two GSP flags defined in
`engine/gsp/main.cpp`:

```
--bootstrap_queue_address=0x<operator/house wallet>
--bootstrap_queue_tiers=1000000000,10000000000,100000000000   # raw 8-dp WCHI: 10,100,1000 (drop the free 0 tier)
```

The operator becomes the initial front (so the first paid match pays the house: a bootstrap fee) and
the draw payee. Each bootstrap entry's matchId is a **non-zero 64-hex** (`position+1`); an all-zero
snapshot would be rejected by the contract's first `createMatch`. Bootstrap fires **only** on genuine
fresh-DB init: reusing a datadir silently skips it, and there is no second chance (§3).

**Arcade contrast.** The Arcade has no bootstrap flags at all: seeding rides the `reg` admin move:
it fires the first time a `reg` whose bet list and seat range reach a `(tier, seats)` combo is
processed, not on fresh-datadir init, so it is not tied to a fresh DB and reusing a datadir does not
lose it. It seeds **three** groups per combo rather than one, so the first **three** paid matches at
each `(tier, seats)` pay their pot to the operator. A combo is recorded as seeded permanently, so a
later `reg` at the same combo adds nothing; only the `seed` admin move deepens a live combo (§3).

## 10. The three game-id knobs (must all match)

```
contract gameNamespace()  ==  GSP --game_id  ==  frontend NEXT_PUBLIC_GAME_ID
```

The reference standalone GSP defaults `--game_id` to `xbm` (the `game_id` flag in `engine/gsp/main.cpp`). A mismatch
**silently** breaks admin-move delivery. Registering a `g/` name to the contract is **permanent**:
for betas/rehearsals use a **throwaway** game id and keep your canonical `g/<name>` free for launch.

## 11. Frontend glue (`src/lib/chain/`, `src/hooks/`)

| file | role |
|---|---|
| `skill-wager.ts` | contract ABI + address from `NEXT_PUBLIC_<GAME>_WAGER_ADDRESS` (Xayaman: `NEXT_PUBLIC_XAYAMAN_WAGER_ADDRESS`); `WAGER_CONFIGURED` gate |
| `wager-logic.ts` | `selectQueueFront` (FIFO by position), `queueToContractFormat` (→ `[]` for free tier, else the single front entry) |
| `use-skill-wager.ts` | React hook: tier select, `createMatch`/`joinMatch`/`abort` + WCHI approve |
| `use-balances.ts` | POL (18-dp) + WCHI (8-dp) balances |

The env-var **name is yours**: the `scripts/` templates use the generic `NEXT_PUBLIC_WAGER_ADDRESS`;
the Xayaman reference uses `NEXT_PUBLIC_XAYAMAN_WAGER_ADDRESS` (`src/lib/chain/skill-wager.ts`).
Whatever you pick, the frontend **build arg** and `skill-wager.ts` must read the **same** name: it's
baked at build time (STANDALONE.md's deploy section), so a mismatch silently drops the wager UI to
free-only with no error.

Before the first WCHI `approve`, gate on the on-chain invariants `skillWagerVersion()==5` **and**
`requiresPlayerNameOwnership()==true` (not just a non-zero address). With no address configured, the
lobby shows free-only.

## 12. Deploy runbook (summary)

**Never run unattended**: every WCHI/NFT/live-GSP step is a reviewed human action.

1. `contracts/`: `forge test`; `forge build`; `slither .`. Confirm the immutable params.
2. Deploy `<Game>WagerV5` on Polygon (deployer needs only POL for gas). A Foundry deploy script
   (`contracts/script/Deploy<Game>WagerV5.s.sol`) passes the constructor args; broadcast with
   `forge script script/Deploy<Game>WagerV5.s.sol --rpc-url <polygon> --private-key <key | --ledger>
   --broadcast --slow`. Record the deployed address for the frontend, and export the ABI
   (`forge inspect <Game>WagerV5 abi`) into `skill-wager.ts`.
3. Register `g/<id>` → `safeTransferFrom` the NFT to the contract → `initialize()`. Verify
   `initialized()==true`, `ownerOf==contract`, `skillWagerVersion()==5`.
4. Build a **new** GSP image tag (never overwrite the live one). Run on a **fresh datadir** with the
   bootstrap flags. Wait for `up-to-date`, confirm the queue seeded (`getcurrentstate` →
   `paymentqueues`, one non-empty front per paid tier). (**Arcade:** no bootstrap flags: seeding
   rides the `reg` move (§9); `paymentqueues` has lost its game level and is now two map levels,
   tier → numPlayers; and a seeded combo carries **three** groups per `(tier, seats)`, not one.)
5. Point the frontend at `NEXT_PUBLIC_<GAME>_WAGER_ADDRESS` and **rebuild** (it's a build-time bake:
   STANDALONE.md).
6. Smoke, small, in order: read-only gates → a **free** match → **one** paid match end-to-end →
   optional forced draw. Then close every test channel you opened, or you have bricked that tier (§3).
   (**Arcade:** a seeded combo carries three groups, so three paid matches can run concurrently at one
   `(tier, seats)`, and an abandoned one heals when the reaper returns its group, so closing your
   test channels is hygiene there rather than the only thing standing between you and a dead tier.)

## 13. Testing without real funds

- **Fork (no funds):** a Polygon fork (`anvil --fork-url …`) has the real XayaAccounts + WCHI, so
  deploy the contract on the fork with a **fresh** game id (mainnet permanently owns your canonical
  name) and drive create→join→play→close→settle for free. Template: `scripts/fork-e2e.template.sh`.
- **Real-funds dry run (mainnet, throwaway players):** a no-cheat mode transfers real WCHI/POL to
  fresh player wallets and **sweeps back** at the end. In both cases **assert settlement from the
  contract's `MatchJoined` event (`queuePayee`/`winnerPayout`), not wallet balance deltas**: deltas
  are confounded when the operator wallet also funds the players.
- **Add a depth gate:** after every abandonment/expiry/reject scenario, assert that a fresh paid
  create at that tier still succeeds, with a negative control (§3).

## 14. Cross-references

- **SKILL.md**: the channel lifecycle and the dispute/timeout close this settlement hangs off; the
  invariant that a timeout must close a never-finished match.
- **STANDALONE.md**: the GSP referee that owns `HandleStartMatch`/`UpdateStats`, the consensus-safety
  rules the settlement path relies on, and the build-time `NEXT_PUBLIC_*` bake.
- **PITFALLS.md** → *Wagering (standalone V5)*: the full trap list for the self-hosted path (matchId
  collision, brace count, address case, game-id knobs, permanence).
- **scripts/**: `scripts/docker-compose.template.yml` + `scripts/env.template` wire the wager knobs;
  `scripts/fork-e2e.template.sh` drives the no-funds fork test.
