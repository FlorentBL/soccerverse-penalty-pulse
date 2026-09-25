# Testing against a forked Polygon chain (no real funds)

Xaya lives on Polygon mainnet, and a persistent game's whole loop - register a name, send a move,
watch the GSP derive state - costs real POL and real WCHI and takes real block time. A **local fork**
gives you that same loop for free, instantly, and with the real contracts: you run `anvil` forking
Polygon at a pinned block, point XayaX at the fork instead of a public RPC, and drive your own GSP
against it. Everything else in the stack is unchanged, which is the point: the fork is not a
simulator, it is mainnet's state with a private tip you control.

This is the method. GSP flags, the genesis-height rule and the deploy shape are in **GSP.md**; the
day-2 runbook is **OPS.md**. If you are testing a *channel* game's stake contract, the same harness
applies and the wagering section of the **building-channel-games** skill ships a copy-and-adapt fork
end-to-end driver for the create→join→play→close→settle path: load that skill for it.

## 1. Why a fork and not a testnet

- **The real contracts, with their real state.** The fork carries the deployed XayaAccounts, WCHI
  and the live registration policy exactly as they are on mainnet, so your approve → `register` →
  `move` path is exercised against the actual bytecode, not a fresh redeployment that behaves
  slightly differently.
- **No faucet, no funds, no permanence.** You mint gas with `anvil_setBalance` and take WCHI from a
  whale by impersonation. Nothing you register burns a name you will want on mainnet, and nothing
  you deploy has to be paid for.
- **Time is a function call.** The node runs with `--no-mining`, so blocks exist only when you ask.
  Anything gated on block height - a cooldown, an expedition, a dispute window - is one RPC away
  instead of hours away.
- **Reorgs on demand.** Snapshot and revert are the only practical way to test the part of a GSP
  that is hardest to get right and impossible to provoke on a public chain.
- **What it does not give you.** Real network latency, real gas markets, and - because the fork
  inherits mainnet's block height - nothing that only breaks on a *low-height* chain. Height
  arithmetic that underflows near height zero (a class the building-channel-games skill's pitfall
  list documents for channel referees) stays invisible on a mainnet fork.

The public building blocks are `github.com/xaya/forked-evm-testing`: basechain, nginx, helper and
healthcheck containers, publicly readable, and every file path below that starts
`forked-evm-testing/` is in that repo. The Arcade extends it with a fork-testing deployment of its own: the operator's
deployment repo, which is not published: consuming the public one as a git submodule rather than
copying it. Where this page says what that deployment does differently, the difference is written
out in full, so nothing below needs a repo you cannot open.

## 2. The shape of the stack

Five services on **one compose project with its own pinned subnet**, behind a single nginx that
exposes three JSON-RPC paths on one localhost port:

| Service | What it is |
|---|---|
| `basechain` | `anvil` forking Polygon at a pinned block: the chain |
| `nginx` | the only front door: `/chain` → anvil, `/gsp` → your GSP, `/helper` → the driver |
| `helper` | a small JSON-RPC test driver: mine, fund, impersonate, register, send a move, sync |
| `xayax` | indexes the fork and serves the GSP its block/move feed |
| `gsp` | your game, unmodified |

The public compose publishes nginx on `localhost:8100` (the `nginx` service in `forked-evm-testing/docker-compose.yml`);
choose published ports and a Docker subnet that do not overlap your other stacks or LAN.
The deployment's compose file is the authority for those values. Keep administrative fork RPCs
bound to loopback or a private network: impersonation and funding are test capabilities.

Everything talks to the chain *through nginx*, including XayaX. That indirection exists so the proxy
can normalise the `Content-Type` header and so the browser, the helper and the indexer all agree on
one origin.

## 3. Pinning the fork block

anvil fetches state at the fork block **lazily**, on first touch, so the source RPC **must be an
archive node**. Xaya's own public node prunes state and cannot be the fork source. Put the archive
endpoint in a gitignored `.env` as `BLOCKCHAIN_ENDPOINT` and never print or commit it: it embeds a
key.

```
BLOCKCHAIN_ENDPOINT=          # archive RPC, gitignored, never committed
FORK_BLOCK_NUMBER=            # a recent height, or "latest"
ACCOUNTS_CONTRACT=0x8C12253F71091b9582908C8a44F78870Ec6F304F   # XayaAccounts on Polygon
```

`FORK_BLOCK_NUMBER=latest` forks the current head; an integer reproduces a specific situation
(`FORK_BLOCK_NUMBER` in `forked-evm-testing/README.md`). The Arcade's fork-testing deployment resolves the archive's head with
`eth_blockNumber` and writes the pin from a script, subtracting a safety margin of five blocks from
that head first so the fork never asks for a block the endpoint has not settled. Copy the margin:
the head an archive reports is not always a block it will serve state for yet.

**The fork block and your GSP's genesis height must agree.** A persistent game's genesis is compiled
into `GetInitialStateInternal`, and a genesis *above* the fork tip never syncs while one far below it
makes XayaX replay history it does not need. Two ways out: pin the fork at or just above your
compiled genesis, or make the height a flag: the Arcade's host GSP takes `--polygon_start_height`
for exactly this reason (the `polygon_start_height` flag in `arcade-platform/engine/gsp/main.cpp`) and that deployment writes the same value
into both `FORK_BLOCK_NUMBER` and `POLYGON_START_HEIGHT`.

anvil also caches archive-fetched state per fork block under `~/.foundry/cache/rpc/<chain>/<block>/`
(`anvil --help`), which is separate from the state directory in §8: re-pinning to a new block means
paying the cold-fetch cost again.

## 4. Mining, and the two anvil traps

Blocks exist only when you ask: `--no-mining` on anvil's own command line.
Mine one per move via the helper's `mineblock` (`evm_mine`), and **fast-forward long waits in a single
call** rather than looping thousands of times:

```bash
# mine 700 blocks at once, then let the GSP catch up
curl -s -X POST http://127.0.0.1:<port>/chain -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"anvil_mine","params":["0x2BC"]}'
```

- **Impersonated transactions never mine themselves.** Unsigned txs sent under `--auto-impersonate`
 - which is every tx the helper and any dev-wallet mode send - are not picked up by interval mining
  or automine; they sit pending until an explicit `evm_mine`. If a tx "vanished", it is almost
  always this.
- **Never call `evm_setAutomine`.** Toggling it with impersonated transactions in flight has
  deadlocked anvil's mining lock: frozen tip, every `evm_mine` hanging forever, recoverable only by
  resetting the stack. Interval mining plus a background pending-tx miner covers everything
  automine would.

`evm_revert` restores state, tip and balances exactly, but does **not** reset EIP-1559 base-fee decay,
so blocks mined after a revert carry different `baseFeePerGas` and therefore different block
*hashes*. Game state depends only on moves plus reverted state, so assert exact **state**
restoration after a rewind, never identical forward block hashes.

## 5. Funding, impersonation and names

The helper is the whole funding story. It calls `anvil_autoImpersonateAccount(true)` at startup
(the `anvil_autoImpersonateAccount` call in `forked-evm-testing/helper/rpcserver.py`) and exposes:

| Method | Does |
|---|---|
| `mineblock()` / `mineblockat(ts)` | `evm_mine`, optionally at a chosen timestamp |
| `setbalance(addr, wei)` / `ensuregas(addr)` | mint gas; `ensuregas` tops up only below a minimum |
| `transfertoken(token, from, to, amount)` | impersonate a holder and `transfer` an ERC-20 - this is how a burner gets WCHI |
| `getname(ns, name, addr)` | register the name if it is free, otherwise transfer it from its owner by impersonation |
| `sendmove(ns, name, mv)` | impersonate the name's owner and send a move, leaving ownership alone |
| `syncgsp()` | block until the GSP is up-to-date at the latest block - **see §7 before you call this** |

**Registering a name on the fork is the real path, not a shortcut.** `getname` checks `exists(ns,
name)`, and if the name is free it tops up gas, `approve`s XayaAccounts on WCHI and calls
`register(ns, name)`, mining after each (`tryRegisterName` in `forked-evm-testing/helper/rpcserver.py`), so a
burner must hold WCHI before it can take a name, exactly as on mainnet. If the name already exists
(anyone's, including a real mainnet holder's), it is `transferFrom`'d to you by impersonating the
current owner. That is the fork superpower: you can test as a name you do not own.

Moves go out the same way your game will send them:
`XayaAccounts.move(ns, name, mv, 2**256-1, 0, address(0))`, where the max-uint nonce skips the nonce
check and the last two arguments are the optional WCHI payment
(`sendmove` in `forked-evm-testing/helper/rpcserver.py`). A burner is therefore a real mined wallet with a
real name, and `newBurner()` - fund gas, fund WCHI, `getname`, send your game's init move - is the
one helper worth writing first.

## 6. Running XayaX and your GSP against the fork

XayaX points at the fork through nginx. The `xaya/xayax` image's entrypoint supplies `--datadir`,
`--port`, `--zmq_address` and `--max_reorg_depth` itself, taking the last from the `MAX_REORG_DEPTH`
environment variable (the `eth` case of `xayax/docker/entrypoint.sh`), so the command line only carries what is
left:

```yaml
  xayax:
    image: xaya/xayax
    environment: { MAX_REORG_DEPTH: 1000 }        # deep, because this fork reorgs on purpose
    command: ["eth", "--eth_rpc_url=http://nginx/chain", "--eth_ws_url=http://nginx/chain",
              "--accounts_contract=0x8C12253F71091b9582908C8a44F78870Ec6F304F",
              "--xayax_block_range=90", "--nolisten_locally", "--alsologtostderr"]
  gsp:
    image: <yourgame>:latest
    restart: on-failure
    command: ["<entrypoint...>", "--xaya_rpc_url=http://xayax:8000", "--xaya_rpc_protocol=2",
              "--xaya_connection_check_ms=10000", "--xaya_zmq_staleness_ms=30000",
              "--alsologtostderr"]
```

`--eth_ws_url`, `--xayax_block_range` and `--max_reorg_depth` are all real XayaX flags
(the flag definitions at the top of `xayax/eth/main.cpp` and `xayax_block_range` in `xayax/src/sync.cpp`): if an older document tells you they do not
exist, the source wins. Set `MAX_REORG_DEPTH` to match how deep you intend to rewind: the public
substrate ships `1` because it never reorgs (`MAX_REORG_DEPTH` on the `xayax` service in `forked-evm-testing/docker-compose.yml`), the
Arcade's own fork-testing deployment ships `1000` because its rewind panel reverts on purpose. A revert deeper than the
configured depth crashes XayaX and needs a stack resync.

**Relax the staleness watchdog on a fork.** An idle no-mining fork looks like a dead feed, so keep
`--xaya_zmq_staleness_ms` generous relative to how often your test mines. The watchdog only runs at
all when `--xaya_connection_check_ms` is non-zero; both flags and the WAL-truncate flag belong on a
fork GSP for the same reasons they belong in production: GSP.md carries the full flag set.

Two startup facts that look like faults and are not:

- **A cold fork takes 10-15 minutes before the GSP reports `up-to-date`**, because XayaX must replay
  history up to the genesis block on a fresh datadir before the GSP's first query can be answered.
  Give the GSP `restart: on-failure` so an early abort against a not-yet-caught-up indexer resolves
  itself.
- **On an archive-backed cold fork each transaction takes roughly a minute to a minute and a half**
  the first time it touches a piece of state. It is the archive round trip, not a hang; once state
  is warm it is much faster.

**Recreating the GSP container is a fresh genesis**: it drops its SQLite datadir and re-syncs from
the game's genesis height, with no migration. Use that deliberately, and bake your golden-replay and
reorg suites into the production Dockerfile as a build gate (DETERMINISM.md) so a schema or
determinism regression cannot ship in the image you then run on the fork.

## 7. Sync without wedging the helper

The helper's own `syncgsp` busy-waits for the GSP to report `up-to-date` **at one exact block hash,
with no timeout** (`syncgsp` in `forked-evm-testing/helper/rpcserver.py`). If the GSP ever misses that
hash - trivially easy under sustained mining - the loop never exits, and because the helper is a
single-threaded JSON-RPC server every later call to it returns an nginx `<html>` 502, which surfaces
in a test as `Unexpected token '<'` from `res.json()`.

Sync from the **test** instead, bounded, and leave the helper for fast non-blocking work:

```ts
async function syncGsp(base: string, timeoutMs = 30_000) {
  const latest = (await rpc(`${base}/chain`, 'eth_getBlockByNumber', ['latest', false]))
                   ?.hash?.replace(/^0x/, '').toLowerCase();
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const st = await rpc(`${base}/gsp`, 'getnullstate', []);
    if (st?.state === 'up-to-date' && st.blockhash?.toLowerCase() === latest) return;
    if (Date.now() >= deadline) return;   // don't hang; a stale read fails its assertion cleanly
    await new Promise(r => setTimeout(r, 100));
  }
}
```

Clear an already-wedged helper with `docker compose restart helper`; the GSP is usually fine: check
its log, it will have kept processing.

## 8. ★ The disk leak that kills the chain

**anvil writes one state snapshot per mined block and never cleans up.** They land as
`<blockhash>.json` under `~/.foundry/anvil/tmp/anvil-state-*/`, and left alone the directory grows
without bound. This is not theoretical: measured on one box, a long-running basechain had reached
**293 GB in about three weeks** and a second **39 GB in three days** across 3,610 files. Both
exited within the same hour when the disk filled, which took a public site's `/chain` endpoint down
for hours.

The fix is to let anvil do its own eviction with `--max-persisted-states`, which bounds the on-disk
set. The Arcade's fork-testing deployment defaults it to 256 and passes it on every start:

```sh
anvil --fork-url "${ENDPOINT}" ${HEIGHT_ARG} --host 0.0.0.0 \
      --auto-impersonate --no-mining \
      --max-persisted-states "${MAX_PERSISTED_STATES:-256}"
```

**The public substrate's basechain entrypoint does not carry this flag**: adding it is the one
difference the Arcade's own copy makes. If you build on `forked-evm-testing` directly, add it
yourself.

Two things not to do instead:

- **Do not use `--prune-history`.** It sets `max_persisted_states` to 0 *and* prunes in-memory
  history, so nothing is persisted at all, and deep `evm_revert`
  and reorg testing stop working. If you reorg on purpose, this knob deletes the thing you are
  testing with.
- **Do not sweep the directory with a janitor sidecar.** Those snapshots are what `evm_revert` and
  deep reorgs replay from; deleting files behind anvil's back breaks rewind non-deterministically.
  Bounding is a supported flag, so use the flag.

**And treat any basechain restart as a wipe, not a hiccup.** The fork's state is memory-only: there
is no volume, so restarting the container brings the RPC back at the pinned block with everything
you built on it gone: every deployed contract, every registered name, every open channel, and a GSP
datadir that is now orphaned against a chain that no longer contains its history. `restart:
unless-stopped` is still right - a resettable endpoint beats a dead one - but the recovery is to
re-run your bring-up from scratch, not to reconnect.

The same hazard has a quieter form: **rebuild the basechain image and compose will recreate the
container**, silently discarding the fork. BuildKit's provenance attestations mint a new image ID on
every rebuild even when nothing changed, so run builds with `BUILDX_NO_DEFAULT_ATTESTATIONS=1` set.
Related: rebuilding a shared `image:tag` does *not* restart a container already running on it: it
keeps its pinned image ID until that stack is brought up again, so it is safe to rebuild a tag
other stacks share, and only `up -d <service>` swaps it.

## 9. End-to-end through your real client

The fork's highest-value use is not unit-style assertions against the GSP; it is driving your
**actual frontend code**: real move builder, real on-chain sender, real GSP client, real state
parser, with only the wallet replaced by a burner. That is what catches wire-contract drift (RPC
parameter shape, field names, move envelope) that no unit test can see.

```ts
const submitSync = async (move) => { await sender.submit(move); await helper('mineblock'); await syncGsp(base); };
// paid path: sender.submitPaid(move, exactSats) approves WCHI once, then sends the move:
// proving WCHI-paid moves for real, including the underpay-mints-nothing guard.
```

Gate the suite on an env flag **and** a reachable-and-up-to-date check
(`getnullstate.state === 'up-to-date'`), or the whole suite silently skips and still reports as
passed, which is the failure mode of the next section.

## 10. Fork gotchas proven the hard way

- **Keep the fork warm or your suite skips itself.** An idle no-mining fork drifts past
  `--xaya_zmq_staleness_ms`, `getnullstate` stops reporting `up-to-date`, and a once-per-run
  readiness check returns false: every gated test skips while the run still shows green. Mine and
  sync every few seconds during idle, mine a block immediately before the readiness check, and grep
  the log for the skip line.
- **A read right after mining can catch a pre-resolution snapshot** under load. Retry the read a
  bounded few times until the expected state appears, rather than sleeping.
- **"Transaction mined but the game never appears" poisons that name permanently.** XayaX's new-heads
  websocket subscription can fail once during startup (the chain not yet ready) and never retries; it
  then falls behind and can drop moves inside bulk catch-up blocks. Because Xaya moves carry a
  per-name nonce, one dropped move makes every later move from that same name out-of-sequence and
  rejected, while other names keep working. Recovery is a fresh indexer datadir:
  `docker compose up -d --force-recreate xayax`, then restart the GSP, and the bring-up should
  verify the "Subscribed to new heads" log line.
- **A rewind past a deploy invalidates recorded addresses.** Any contract address you wrote into
  `.env` after deploying on the fork points, from the reverted chain's point of view, at something
  that was never deployed. Blank it and redeploy.
- **Never expose the helper, the control panel or the basechain publicly, and never ship them in a
  production build.** They are an impersonate-anyone, mint-anything, time-travel control plane with
  no authentication; bind them to `127.0.0.1` unless you are deliberately on a trusted LAN. The
  blast radius is the local fork, never mainnet funds, but the fork is where your whole test
  deployment's trust lives.
