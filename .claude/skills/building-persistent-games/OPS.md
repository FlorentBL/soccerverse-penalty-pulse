# Day-2 operations for a GSP

Running a GSP is not like running a web service. It is a replica of a consensus state machine: it
is only useful while it is *tracking the chain*, it has exactly one source of truth on disk, and
almost every failure it has is silent: no 500s, no alerts, just a daemon happily serving a state
that stopped moving an hour ago.

This file is the runbook for that. It is organised by the failure you actually have, not by
subsystem, and every section has the same four parts: **Symptom** (what you see), **Confirm** (how
you prove it is this and not something else), **Fix** (what you do now), **Prevent** (what you
change so it does not happen again).

It assumes the minimum deployment: a XayaX bridge indexing Polygon, and your libxayagame daemon
talking to it over JSON-RPC + ZMQ. Building that stack is GSP.md's job; this file starts the
moment it is up. If your game is a **channel** game you host yourself, the deploy grows a relay
and a frontend, and that four-service shape has channel-specific wiring of its own (one audience
string shared by relay and client, one game id in three places): that belongs to the
building-channel-games skill's standalone-hosting module; load the building-channel-games skill
for it. Everything below applies to any GSP either way.

## Symptom index

| What you are seeing | Section |
|---|---|
| A fresh GSP syncs forever / "does nothing" | §2 |
| `getnullstate` says `up-to-date` but the height never moves | §3 |
| `storage.sqlite-wal` is enormous next to a tiny `storage.sqlite` | §4 |
| The box is running out of disk | §5 |
| You need to reset, wipe or move a GSP's state | §6 |
| You deployed a change and nothing happened | §7 |
| You are deploying next to other live services | §8 |
| RPC feels blocked, or `getpendingstate` errors | §9 |

---

## 1. What healthy looks like, and the two numbers you compare

Everything in this file is diagnosed from two RPC calls. Learn these before you need them.

```bash
# 1. the GSP's own view of itself (cheap: no game state serialised)
curl -s -X POST -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"getnullstate","params":[]}' \
  http://127.0.0.1:<gsp-rpc-port>
# {"id":1,"jsonrpc":"2.0","result":{"blockhash":"…","chain":"polygon",
#   "gameid":"…","height":90847096,"state":"up-to-date"}}

# 2. what the bridge believes the chain head is
curl -s -X POST -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"getblockchaininfo","params":[]}' \
  http://127.0.0.1:<xayax-rpc-port>
# {"id":1,"jsonrpc":"2.0","result":{"bestblockhash":"…","blocks":90847098,"chain":"polygon"}}
```

(Both are from one live XayaX + GSP pair; hashes and game id elided. The bridge sits a couple of
blocks ahead of the GSP, which is the normal shape: the GSP processes what the bridge has already
indexed, so its height trails by the processing lag and never leads.)

`state` is one of `unknown`, `pregenesis`, `out-of-sync`, `catching-up`, `at-target`,
`up-to-date`, `disconnected`: the full set is `Game::StateToString` in libxayagame's
`xayagame/game.cpp`. The one you want is `up-to-date`.

**The health check is not `state`, it is the pair.** `up-to-date` means "the GSP has processed
everything it has been told about": it is a statement about the GSP's inbox, not about the chain.
A GSP whose block feed died reports `up-to-date` forever at a frozen height (§3). So a real health
check does two things: it compares the GSP's `height` against the bridge's `blocks`, and it
asserts the GSP's `height` **increased** since the last poll. Alert on either.

Where things live on disk, because every later section needs it: libxayagame puts the database at
`<datadir>/<game id>/<chain>/storage.sqlite` (`GetGameDirectory` and `CreateStorage` in
`xayagame/defaultmain.cpp`), so a daemon started with `--datadir=/xayagame` for a game id `mv` on
Polygon keeps its whole world in `/xayagame/mv/polygon/storage.sqlite` plus that file's `-wal` and
`-shm` siblings. Logs go wherever `GLOG_log_dir` points, one file set per process start, with
`<binary>.INFO` / `.WARNING` / `.ERROR` symlinks pointing at the current ones.

---

## 2. A fresh GSP never catches up (the genesis height)

**Symptom.** First bring-up. The GSP starts, logs a genesis height, and then sits in `pregenesis`
or `catching-up` for hours. The height crawls upward from a number millions of blocks below the
Polygon head, or does not appear at all. Nothing is broken; it is doing exactly what you asked.

**Confirm.** `getnullstate` shows `state` of `pregenesis`/`catching-up` and a `height` far below
the bridge's `blocks`. The GSP log carries `Got genesis height from game: <N>`: that N is the
problem.

**Fix.** The genesis height is your game's, not the framework's: `GetInitialStateInternal` in your
`logic.cpp` returns it per chain, so on a fresh datadir the GSP starts syncing from whatever that
function says (`GetInitialState` is called from `Game::ReinitialiseState`, `xayagame/game.cpp`).
There are two ways to move it:

- **Recompile.** Change the height in `logic.cpp` and rebuild. That is the only option if your
  `main.cpp` does not expose an override.
- **A flag your own `main.cpp` declares.** This is the pattern worth copying: the Arcade host GSP
  declares `DEFINE_uint32 (polygon_start_height, 0, …)` and passes it into the logic object, whose
  Polygon branch uses it when non-zero and the compiled-in height otherwise
  (`arcade-platform/engine/gsp/main.cpp` and `engine/gsp/logic.cpp` - that repo is
  private during the curated phase: access on request).
  **It is not a libxayagame flag**: if you did not write it, your daemon does not have it, and
  `--polygon_start_height` on the command line will be rejected as unknown.

Set it just below the current chain head: the Arcade host's own deploy notes say ≈ (current head
− 100) (`arcade-platform/docs/RUN-FROM-SCRATCH.md`): on a **fresh** datadir. Leaving
the hash empty for the override path is deliberate: XayaX accepts any block at that height and the
GSP pins the hash itself, logging `Game did not specify genesis hash, retrieved <hash>`.

**Prevent.** Understand the ordering rule, because it explains every "my start height was
ignored" report: `Game::ReinitialiseState` checks storage **first**: if a current state exists it
logs `We have a current game state, syncing from there` and never consults the genesis height at
all (`xayagame/game.cpp`). A saved datadir always wins. So the start height matters exactly once,
on the first run against an empty datadir, and re-pointing an existing deployment at a new height
does nothing until you wipe state (§6).

Two consequences worth writing into your own deploy notes:

- Your `.env` (or equivalent) should make the height a **required** variable on first run rather
  than a defaulted one: a silently defaulted start height is how you end up syncing from the
  compiled-in genesis without noticing.
- A GSP whose genesis is *below* the bridge's own start height is fine: a fresh XayaX starts near
  the tip and backfills older blocks on demand.

---

## 3. The GSP is stuck: the silent ZMQ wedge

This is the worst failure in the system, because it looks exactly like health.

**Symptom.** Play stops. Moves land on chain but never reach the game state. The GSP reports
`state: "up-to-date"` at a height that stopped advancing minutes or hours ago. No error, no crash,
no restart loop. Typically it starts right after XayaX restarted, upgraded, crashed, or changed
container IP.

**Confirm.** Poll `getnullstate` twice, a minute apart, while the chain is clearly moving (the
bridge's `blocks` is climbing). If the GSP's `height` is identical both times, it is wedged.
Then check whether the watchdog is even running: grep the GSP log for `ZMQ connection seems stale,
requesting a block` or `ZMQ connection is stale, disconnecting...`. **If those lines never appear
in a wedged daemon, the watchdog is off**, which is the actual defect.

**Fix, right now.** Restart the GSP container. It reconnects its ZMQ subscriber, sees the gap and
catches up. Nothing is lost; block processing is idempotent from stored state.

**Prevent, and this is the part people get wrong.** You need **both** flags, because one is inert
without the other:

- `--xaya_zmq_staleness_ms`: how long a silence is allowed before the connection is treated as
  dead. Its default is 120000 in `xayagame/game.cpp`.
- `--xaya_connection_check_ms`: how often to probe. Its default is **0** in the same file, and
  `Game::Start` only spawns the `ConnectionCheckerThread` when that value is greater than zero.

`Game::ProbeAndFixConnection` is the only code that reads the staleness value, that pings a quiet
feed, and that lifts the daemon out of `DISCONNECTED`. It runs only on that thread. So with the
default `--xaya_connection_check_ms=0`, **the staleness setting does nothing at all** and the
daemon wedges permanently on any ZMQ hiccup until a human restarts it. Both flags, always.

The probe is two-stage, which is why the two values are related: at **half** the staleness window
it asks the bridge to resend the last block (`ZMQ connection seems stale, requesting a block`),
and only past the full window does it drop and reconnect (`ZMQ connection is stale,
disconnecting...`). Pick a staleness comfortably above normal block spacing and a check interval
well below it - the Arcade host stack runs `--xaya_connection_check_ms=10000` with
`--xaya_zmq_staleness_ms=30000` against Polygon's block cadence
(`arcade-platform/docker/docker-compose.yml` - that repo is
private during the curated phase: access on request).

**Prevent harder: bake the default into the binary.** A flag that a deployment can forget is a
flag a deployment will forget. Set a safe default in your `main.cpp` *before* parsing, so an
explicit command-line value (including `0` to disable) still wins:

```cpp
gflags::SetCommandLineOptionWithMode ("xaya_connection_check_ms", "10000",
                                      gflags::SET_FLAGS_DEFAULT);
gflags::ParseCommandLineFlags (&argc, &argv, true);
```

That is the shape used in `arcade-platform/engine/gsp/main.cpp`, and it exists because a deployment
that omitted the flag wedged silently in production.

**Related, same family.** The ZMQ address is not negotiated: XayaX echoes its own `--zmq_address`
back verbatim from `getzmqnotifications` (`xayax/src/controller.cpp`) and the GSP dials exactly
that string, logging `Detected ZMQ blocks endpoint: <addr>`. So the value must resolve **from the
GSP's container**, not from XayaX's point of view: `localhost` names the GSP itself and is the
classic wedge. The published `xaya/xayax` image already handles this: its entrypoint passes
`--zmq_address="tcp://${HOST}:28555"` with `HOST` defaulting to the container's own IP
(`docker run --rm --entrypoint cat xaya/xayax /usr/local/bin/entrypoint.sh`), so the safe options
are to leave it alone or to set it to the compose service name. Also expect
`Missed ZMQ notifications, reinitialising state` in the log after a reconnect: that is the
framework recovering correctly, not an error.

---

## 4. `storage.sqlite-wal` grows without bound

**Symptom.** The database file is small and its write-ahead log is orders of magnitude larger, and
the gap widens for as long as the daemon runs. Restarting makes it vanish: a clean close
checkpoints and removes the WAL, which is exactly what makes the problem easy to dismiss and
guaranteed to come back.

**Confirm.** List the three files and compare the sizes:

```bash
docker compose exec gsp ls -l /xayagame/<game id>/<chain>/
# storage.sqlite      290816     <- a healthy daemon, truncate armed: the WAL stays
# storage.sqlite-shm   32768        the same order of magnitude as the database
# storage.sqlite-wal  543872        and drops back after each checkpoint
```

**Do not** start by hunting stray readers or setting `PRAGMA journal_size_limit`. This is not a
leaked-reader problem.

**Fix.** Pass `--xaya_sqlite_wal_truncate_ms=<interval>` and restart. Its default is **0**: off:
in `xayagame/sqlitestorage.cpp`. Success looks like `Checkpointed and truncated WAL file
successfully` in the log; the Arcade host GSP runs a 60000 ms interval baked in as a default
(`arcade-platform/engine/gsp/main.cpp`).

**Why it is off by default and why nothing else covers it.** libxayagame turns SQLite's own
autocheckpoint off: `sqlite3_wal_autocheckpoint (db, 0)` in `xayagame/sqlitestorage.cpp`:
because it fires at arbitrary commit points, takes the exclusive checkpoint lock with no
coordination with the framework's snapshot machinery, and raced `sqlite3_snapshot_open` into
`SQLITE_BUSY`. The intended replacement is the framework's own snapshot-guarded periodic
truncate: on commit, if the interval has elapsed, it clears outstanding snapshots and calls
`sqlite3_wal_checkpoint_v2 (…, SQLITE_CHECKPOINT_TRUNCATE, …)`. With both mechanisms off, nothing
ever shrinks the WAL for as long as the process runs.

Two properties of that replacement matter operationally:

- **It fails soft.** If an external process is reading the database file directly, the checkpoint
  returns `SQLITE_BUSY` and logs `Failed to checkpoint WAL file, another process might be reading
  the database`: a warning, never fatal. If you see that repeatedly, find the reader.
- **It only runs on commit.** The check lives in `CommitTransaction`, so a daemon that is not
  processing blocks does not checkpoint. That is harmless (an idle daemon is not growing the WAL
  either), but it does mean you will not see the log line on a quiet chain.

**Prevent.** Set the flag on every deployment, and prefer baking a non-zero default into your
`main.cpp` with the `SET_FLAGS_DEFAULT` pattern from §3 so a deployment cannot omit it. Add the
WAL file to whatever disk monitoring you have: it is the single fastest-growing file the daemon
owns.

---

## 5. Disk: what actually fills it

**Symptom.** The box runs out of space and things start dying in an order that has nothing to do
with the cause. Note the shape of this failure on a chain-following stack: a bridge or a test node
that dies with a full disk does not degrade, it **loses its position**, and anything holding state
only in memory loses that state outright.

**Confirm.** `docker system df` first: it splits images, containers (writable layers *and* logs),
volumes and build cache, so it tells you which of the five causes below you have before you go
hunting.

The five, in the order they bite:

1. **The WAL**: §4. Unbounded until you set the truncate interval.
2. **glog files in the log volume.** libxayagame logs through glog, which writes a **new file set
   per process start** and never deletes an old one; the `<binary>.INFO` symlink only points at
   the current one. A restart loop quietly multiplies these. Rotate or prune the log volume on a
   schedule; do not assume the symlink is the only file there.
3. **Docker's container logs.** With the default `json-file` driver and no options set, a daemon
   run with `--logtostderr` (or `GLOG_alsologtostderr=1`) writes an unbounded log per container.
   Fix it once, per service:

   ```yaml
   logging:
     driver: json-file
     options: { max-size: "50m", max-file: "5" }
   ```

4. **Orphaned anonymous volumes.** If your image declares `VOLUME ["/xayagame", "/log"]` (the
   normal thing to do) and your compose file does **not** map a named volume over it, every
   container you create takes a brand-new anonymous volume, so the old state is stranded on disk
   *and* the new container starts from genesis (§6). `docker system df -v` lists them; the fix is
   to map named volumes, not to prune harder.
5. **A forked test chain on the same box.** If you also run a local forked-Polygon node for
   testing (FORK-TESTING.md), know that `anvil` persists a state snapshot **per mined block**,
   forever, and that this has filled a disk and killed two live test chains within an hour: the
   measured growth was hundreds of gigabytes in weeks (FORK-TESTING.md §8 carries the figures).
   Bound it with `--max-persisted-states` ("Max number of states to persist on disk",
   `anvil --help`). Do **not** reach for the sibling knob `--prune-history`: it forces the
   persisted-state count to zero and prunes in-memory history too, which breaks the deep-reorg
   support any dispute/timeout test needs. Anvil's fork state is memory-only, so a node that dies
   on a full disk has not hiccuped: it has been wiped.

**Prevent.** Cap what can grow (WAL interval, log rotation, persisted states), name every volume
that holds state, and alert on free space rather than on any individual file: the failure is
always "something you were not watching grew".

---

## 6. Resync, and datadir surgery

You will need this for a schema change, a corrupted state, a deliberate genesis move, or a move
to another host. The datadir is the whole world: there is no migration path, and no format-upgrade
step.

**The one rule: stop the daemon first.** Deleting `storage.sqlite` under a running daemon does
nothing useful: the process keeps its open file descriptor on the unlinked inode and carries on
serving and writing the state you thought you deleted. It *looks* like the delete failed silently.
It did not; you deleted a name, not a database.

**Procedure: deliberate reset:**

```bash
# 1. stop. always first.
docker compose stop gsp

# 2. delete all three files, from a throwaway container on the SAME volume
#    (find it with: docker inspect -f '{{json .Mounts}}' <gsp container>)
docker run --rm -v <gsp-data-volume>:/xayagame alpine \
  sh -c 'rm -f /xayagame/<game id>/<chain>/storage.sqlite*'

# 3. start again, with the start height set, §2
docker compose up -d gsp
```

Then watch it: `Creating data directory` or `Using existing data directory`, then
`Got genesis height from game: <N>`, then `catching-up`, then `up-to-date`.

**Procedure: move a GSP to another host:** stop the daemon, copy the whole
`<datadir>/<game id>/<chain>/` directory (all three files, quiesced), start it there. A cleanly
stopped daemon has already checkpointed and removed its WAL, which is why "stop first" also gets
you a consistent copy for free.

**The trap that resets state without you asking: anonymous volumes.** "Recreating the container
wiped my chain state" is real, and the mechanism is §5's item 4: an image-declared `VOLUME` with
no named volume mapped over it gets a fresh anonymous volume on every `docker create`. Map named
volumes and recreation is safe; `docker compose up -d --force-recreate` then keeps state, and only
`docker compose down -v` destroys it.

**The other unasked-for reset: a reorg deeper than your pruning depth.** `--enable_pruning=N`
keeps N blocks of undo data. If a detach goes past that, the daemon logs `Failed to retrieve undo
data for block <hash>. Need to resync from scratch.`, clears storage and re-syncs from genesis
(`xayagame/game.cpp`). That is the designed behaviour, and it is why the pruning depth must exceed
any reorg you consider plausible on your chain. The alternative is opt-in:
`--xaya_crash_without_undo` (default false, `xayagame/game.cpp`) makes the daemon CHECK-fail
instead of silently resyncing: louder, and preferable if a surprise resync would be worse than
an outage. On a forked test chain that reorgs on purpose, expect to hit this.

**Before you wipe, know what only seeds on a fresh datadir.** Some game init paths run exactly
once, on an empty database, and silently skip on a reused one. Wiping is how you re-run them:
and reusing is how you get a deployment that looks up but is missing bootstrap state. Write down
which of your own init paths are fresh-datadir-only.

---

## 7. Restart and upgrade

**Symptom.** You changed code, deployed, and the behaviour is identical. Or you rebuilt an image
and the running container is still on the old one.

**Confirm.** `docker compose images` / `docker inspect --format '{{.Image}}' <container>` against
the image id your build just produced. If they differ, the container never picked up your build.

**The three ways this happens:**

- **`docker compose up -d` does not rebuild.** It reuses whatever image already sits under the tag.
  After touching sources, always `docker compose up -d --build`; it is a no-op when nothing
  changed. This is the number one cause of "my C++ edit had no effect".
- **The layer cache can reuse a stale compile step.** When a rebuild still produces old
  behaviour, `docker compose build --no-cache` for that service before you go debugging the code.
- **Rebuilding an `image:tag` does not restart anything.** A running container keeps its pinned
  image **id** until that stack is `up`'d again. That is a feature on a shared host: you can
  rebuild a shared tag safely while other stacks run on it, but it means the rebuild alone is
  never the deploy.

**Upgrade order and what to re-check afterwards.** Restarting the bridge is precisely the event
that produces the silent wedge in §3, so: verify the watchdog flags are set **before** you touch
XayaX, and after any bridge restart confirm the GSP's height is advancing again rather than
trusting `up-to-date`. If your frontend bakes build-time environment variables into its bundle,
changing one is a rebuild, not a restart.

**A safe upgrade of the GSP itself:**

1. Tag a rollback image from what is currently running, before you replace the tag.
2. Build the new image (`--build`, `--no-cache` if in doubt) and let the build run your test
   gates: golden-replay and reorg suites baked into the image build are the deploy gate that
   stops a determinism or schema regression from ever reaching a container; see DETERMINISM.md.
3. Decide whether the change is state-compatible. Consensus-relevant logic changes and schema
   changes are **not**: they need a wipe and resync (§6), and two nodes running different versions
   of your rules will diverge.
4. `docker compose up -d --build gsp`, then watch the log through `up-to-date` and check the
   height is climbing.
5. Keep the data volume across redeploys. It is the only thing that is expensive to recreate.

---

## 8. Deploying next to other live services

**Symptom.** You bring up a new stack and something unrelated on the box - sometimes your own SSH
session - loses network.

**Fix and prevent: pin the compose network subnet, always.** Docker auto-assigns a range when its
default pools are exhausted, and it has picked ranges that shadow the host's LAN routes and locked
operators out of the machine. Check `ip route` and `docker network ls` / `docker network inspect`
for collisions first, then pin:

```yaml
networks:
  mygame-net:
    ipam:
      config:
        - subnet: 172.16.0.0/24     # verified free on THIS host
```

The rest of the shared-host checklist:

- **Reuse the existing network** rather than creating a parallel one for a second game on the same
  box. One XayaX per host can feed every GSP on it: attach each game's GSP to the bridge's
  network instead of running a bridge per game.
- **Bind the GSP's RPC to loopback** and expose only what the public needs. The game RPC has no
  authentication of any kind and its method set includes `stop` (`xayagame/gamerpcserver.hpp`):
  anyone who can reach the port can halt your daemon. Use a `127.0.0.1:` port mapping, and/or your
  daemon's listen-locally flag if it declares one (it feeds `GameRpcListenLocally` in
  libxayagame's `GameDaemonConfiguration`; like the start height in §2, the flag itself is
  declared by your `main.cpp`, not by the framework). If a browser needs the RPC, put a reverse
  proxy in front that allowlists the read methods.
- **Keep the data volume, tag a rollback image** (§7): both are what make a bad deploy a
  five-minute problem on a box you cannot take down.

---

## 9. Debugging through the RPC (and two myths to drop)

**`waitforchange` semantics surprise people.** With a **valid but stale** block hash it returns
immediately. With an **empty or unparseable** hash it *waits*: for the next change, or for the
`--xaya_waitforchange_timeout_ms` timeout, which defaults to 5000 in `xayagame/game.cpp`. So a
"hung" `waitforchange("")` on a quiet chain is the documented behaviour, not a stuck daemon.

**Myth 1: "the GSP RPC server is single-threaded, so a long-poll blocks everything."** Not in the
shipped configuration. libxayagame builds the connector as a plain
`jsonrpc::HttpServer (config.GameRpcPort)` (`xayagame/defaultmain.cpp`), and that constructor's
thread-count parameter defaults to 50 in libjson-rpc-cpp's
`jsonrpccpp/server/connectors/httpserver.h`. `Game::WaitForChange` also waits on a condition
variable that **releases** the game mutex (`xayagame/game.cpp`), so a parked long-poll does not
hold the state lock. Concurrent reads during a pending `waitforchange` are served in milliseconds.
The real, bounded risk is different and worth knowing: each parked long-poll occupies one pool
thread for up to the timeout window, so a few dozen clients each holding one open can exhaust the
pool. Cap long-polls per client, not threads.

**Myth 2: "XayaX has no pending feed."** It has one, and it is off unless you ask: XayaX tracks
pending moves only when started with `--watch_for_pending_moves=<contract addresses>`
(`xayax/eth/main.cpp`), and it needs a subscription-capable node endpoint to have anything to
listen to. When it is off, XayaX advertises no pending ZMQ endpoint
(`Controller::RpcServer::getzmqnotifications`, `xayax/src/controller.cpp`), the GSP logs
`Not subscribing to pending moves`, and `getpendingstate` fails with the framework's
`pending moves are not tracked` error (`xayagame/game.cpp`) no matter what you set
`--pending_moves` to. Treat a pending feed as opt-in infrastructure you deliberately deploy, not
as a broken method. If you are not deploying it, do not build UI that depends on it.

**Reading the log is faster than reading the state.** The lines that carry the most diagnosis, all
from `xayagame/`:

| Log line | What it means |
|---|---|
| `Got genesis height from game: <N>` | the height this datadir will sync from (§2) |
| `We have a current game state, syncing from there` | the datadir won; your start height was not consulted (§2) |
| `Retrieving <n> detach and <n> attach steps` | normal catch-up progress |
| `Missed ZMQ notifications, reinitialising state` | recovered from a gap: normal after a reconnect (§3) |
| `ZMQ connection seems stale, requesting a block` | the watchdog is alive and pinging (§3) |
| `ZMQ connection is stale, disconnecting...` | the watchdog gave up and is reconnecting (§3) |
| `Attempting periodic WAL checkpointing...` / `Checkpointed and truncated WAL file successfully` | the WAL truncate is armed and working (§4) |
| `Failed to checkpoint WAL file, another process might be reading the database` | soft failure: find the external reader (§4) |
| `Failed to retrieve undo data for block <hash>. Need to resync from scratch.` | reorg past the pruning depth; state is being cleared (§6) |

Coding-level rules - invalid moves, move envelopes, RPC protocol versions - stay in PITFALLS.md;
this file is only the operational half.
