# The game state processor

A **GSP** is your game. It is one daemon - libxayagame linked against your C++ rules - that reads moves out of blocks and deterministically derives the
game state from them. It is fed by **XayaX**, the bridge that makes Polygon look like a Xaya Core node to libxayagame: XayaX watches the XayaAccounts
contract, turns each `move()` call into a per-game move notification, and publishes block attaches and detaches over ZeroMQ. Your GSP subscribes, applies
your rules block by block, and answers clients over its own JSON-RPC port.

Nothing else is authoritative. There is no server, no database you write to out of band, no admin endpoint. The chain holds the moves; your rules turn the
moves into state; every honest node that replays the same blocks reaches the same state. That is the whole design, and every rule in this file exists to
protect it.

## 0. Scope, and where the neighbours are

This file is the **single-GSP on-chain path**: one game, one daemon, linked with `-lxayagame -lxayautil`, every move its own transaction. It carries the
build recipe end to end plus the verified templates behind each step: the genesis patch, the Dockerfile, the compose file, the real startup log, the RPC
surface, and the two client operations (send a move, register a name) that everything else is built on.

| You want | Read |
|---|---|
| The rules that make replay reproducible, and how to prove your game obeys them | **DETERMINISM.md** |
| Day-2 running: WAL growth, silent sync wedges, resync, sharing a host | **OPS.md** |
| Driving the whole loop against a forked chain, for free, with no mainnet spend | **FORK-TESTING.md** |
| The Polygon constants table, and what "persistent" means | **SKILL.md** |
| A symptom you are mid-way through debugging | **PITFALLS.md** |

**If two to four named players play each other directly** - moves signed off-chain and exchanged peer-to-peer, with only open / join / close / dispute
touching the chain - that is a **game channel**, not this. It is a different architecture, and it needs a different GSP: a referee that adjudicates signed
state proofs rather than a processor that applies raw moves, with extra libraries on the link line. Load the **building-channel-games** skill for that
whole path; the foundation on this page still applies underneath it.

**Authority.** libxayagame and XayaX are public repositories (`github.com/xaya/libxayagame`, `github.com/xaya/xayax`), and the worked example these
templates come from is `mover/` in libxayagame itself: live code that builds and runs, which is what every step below is checked against. Where this
file states a number, it names the source file that fixes it. Where it does not name one, treat the value as environment-dependent and measure it
yourself. (The Xaya tutorials wiki at github.com/xaya/xaya_tutorials/wiki walks the same example through a Polygon build step by step; for flags and semantics this file, checked against the source, is the reference.)

## 1. The build recipe

### 1.1 Nine steps

1. **Pick a game id** (`mv` for mover). There is no on-chain registry of game ids: collision avoidance is convention only, and the id is baked into every
   move ever sent for your game, so pick it once and never change it. Moves arrive wrapped: a player sends `{"g":{"mv":{...your move...}}}` on chain, and
   your GSP receives only the inner object plus the sender's name (with no `p/` prefix).
2. **Scaffold from `mover`**: the example in `github.com/xaya/libxayagame` under `mover/`. Clone it, copy `mover/` into your build context, and adapt.
   You get `logic.cpp/hpp` (the GameLogic callbacks), `moves.cpp/hpp` (move parsing and validation), `main.cpp` (the `DefaultMain` wiring and the daemon's
   own gflags), and `proto/*.proto` (protobuf state and undo). `pending.cpp` is optional and off by default: XayaX advertises a pending-move endpoint only
   when it is started with `--watch_for_pending_moves=<contract addresses>` (the `EnablePending` call in `xayax/eth/main.cpp`), which the compose in §4 does not do. Skip it
   unless you have a specific reason to watch the mempool.
3. **Add your chain case** in `GetInitialStateInternal`: `case Chain::POLYGON: height = <recent block ≤ current tip>; hashHex = ""; break;`. An empty
   `hashHex` means "accept any block at this height" and libxayagame fetches and pins the hash itself. Check the live tip first (`getblockchaininfo` on
   XayaX, or a block explorer): a genesis height above the tip never syncs. **This height is your game's genesis; moves before it are invisible forever,
   and changing it after launch changes the game.** Full patch in §2.
4. **Handle the version check.** libxayagame's `GameDaemonConfiguration` defaults `MinXayaVersion` to `1010200`
   (`GameDaemonConfiguration::MinXayaVersion` in `libxayagame/xayagame/defaultmain.hpp`) because that is the Xaya Core release from which the extended `verifymessage` command - used by GameLogic - is available. XayaX deliberately reports its own interface version `1000000` instead (`EthChain::GetVersion` in `xayax/eth/ethchain.cpp`), which fails the
   `CHECK_GE` in `VerifyXayaVersion` (`libxayagame/xayagame/defaultmain.cpp`) and aborts on startup. Lowering the minimum is safe here because XayaX
   *does* implement `verifymessage` (`Controller::RpcServer::verifymessage` in `xayax/src/controller.cpp`). Either set `config.MinXayaVersion = 1000000;` in your `main.cpp` - the clean way - or
   sed-patch the installed header before compiling, which is what the verified Dockerfile in §3 does.
5. **Build on the `xaya/libxayagame` base image.** Every Xaya library and its dependencies are preinstalled, so a compile is minutes. Do **not** rebuild
   the whole libxayagame CMake tree (slow, and it wants jsonrpccpp / googletest / eth-utils from source). Do **not** try to run the image's own prebuilt
   `moverd`: it is linked against a `libmover.so` that is not installed in the image, so `ldd` reports `libmover.so => not found` and it cannot start.
   `protoc` and `cpld` (the shared-library-closure collector) are both on the image's PATH.
6. **Run XayaX + GSP under one compose file.** The XayaX `eth` connector declares its own flags at the top of `xayax/eth/main.cpp` - `--eth_rpc_url`,
   `--eth_ws_url`, `--eth_ws_stale_timeout`, `--accounts_contract`, `--datadir`, `--port`, `--listen_locally`, `--zmq_address`, `--max_reorg_depth`,
   `--watch_for_pending_moves`, `--sanity_checks`, `--blockcache_memory`, `--blockcache_mysql` - plus a few tuning ones (`ethchain_fast_logs_depth`, `eth_rpc_timeout_ms`, `eth_rpc_headers`) in `xayax/eth/ethchain.cpp`. There is **no**
   `--genesis_height`: it does not exist anywhere in XayaX. Treat the binary's own `--help` as the list, not any document. Full compose in §4.
7. **Set the GSP flags.** `--xaya_rpc_url=http://<xayax-service>:8000 --xaya_rpc_protocol=2 --game_rpc_port=8600 --game_rpc_listen_locally=false
   --storage_type=sqlite --datadir=/xayagame --enable_pruning=1000 --pending_moves=false --xaya_connection_check_ms=10000 --xaya_zmq_staleness_ms=30000
   --xaya_sqlite_wal_truncate_ms=60000`. The first eight are defined by your own `main.cpp` (see the flag definitions in `libxayagame/mover/main.cpp`): they exist only
   because the example declares them, so if you write `main.cpp` from scratch you must declare them yourself. The last three come from libxayagame itself
   and are the ops-critical ones; §1.2 explains what each buys you and OPS.md is the runbook for what happens when you omit them.
8. **Send moves** with `XayaAccounts.move('p', name, moveJson, MAX_UINT256, 0, address(0))`. `MAX_UINT256` as the nonce skips the nonce check; `amount`
   and `receiver` are for an optional WCHI payment riding along with the move. Verified script in §7.
9. **Verify.** Poll `getnullstate` until `"state":"up-to-date"`, send one live move (sub-cent gas), and confirm it in `getcurrentstate`. §1.3 is the
   checklist and §5 has the log lines you should see on the way.

### 1.2 What you actually implement

libxayagame gives you a daemon; you give it four functions. Everything in `GameLogic` (`libxayagame/xayagame/gamelogic.hpp`) reduces to:

```cpp
// Genesis: where your game starts, and what its state is there.
virtual GameStateData GetInitialStateInternal (unsigned& height, std::string& hashHex) = 0;

// Forward: old state + one block's data -> new state, AND the undo data to reverse this block.
virtual GameStateData ProcessForwardInternal (const GameStateData& oldState,
                                              const Json::Value& blockData,
                                              UndoData& undoData) = 0;

// Backward: new state + the same block data + that undo data -> exactly the old state again.
virtual GameStateData ProcessBackwardsInternal (const GameStateData& newState,
                                                const Json::Value& blockData,
                                                const UndoData& undoData) = 0;

// Presentation: your internal encoding -> the JSON clients read. Called only when someone asks.
virtual Json::Value GameStateToJson (const GameStateData& state);
```

**`blockData`** is the block's JSON. `blockData["block"]` carries the header: `hash`, `parent`, `height`, and `rngseed`, which libxayagame hashes together
with your game id into the per-block RNG you reach via `GetContext().GetRandom()` (`BlockRngSeed` in `libxayagame/xayagame/gamelogic.cpp`). That derived seed is the
*only* randomness a GSP may use, because it is a pure function of the block and therefore identical on every node. `blockData["moves"]` is an array; each
entry has `"name"` (the sender's Xaya name, no `p/` prefix) and `"move"` (whatever your game id held inside the envelope). Mover's forward pass loops over
them, skips anything that fails validation with `LOG (WARNING) << "Ignoring invalid move:\n" << obj;`, and only then advances the world
(`MoverLogic::ProcessForwardInternal` in `libxayagame/mover/logic.cpp`). Copy that shape: **anyone can send any JSON at your game id, so an invalid move is a no-op, never an abort**: an
abort that fires on one node fires on all of them, which is a consensus halt anyone can buy for the price of one transaction.

**Undo data is what makes reorgs cheap.** Polygon occasionally replaces the last block or two. Rather than resyncing, libxayagame detaches the orphaned
blocks by calling `ProcessBackwardsInternal` with the `UndoData` your forward pass produced, then attaches the new branch. Two consequences you must plan
for: your forward pass has to record *enough* to invert itself (mover stores per-player "was new", "previous direction", "previous steps left"), and if a
detach reaches back further than your retained undo data, libxayagame logs `Failed to retrieve undo data for block <hash>. Need to resync from scratch.`,
clears storage and resyncs from genesis, or `CHECK`-fails instead if you set `--xaya_crash_without_undo` (`Game::UpdateStateForDetach` in `libxayagame/xayagame/game.cpp`). That
retention depth is what `--enable_pruning=<N>` sets: keep undo data for the last N blocks and discard the rest. If you pass `--enable_pruning=0` you keep
none; omit the flag (its default is `-1`) and you keep everything and grow forever.

**State encoding: use protobuf.** Your `GameStateData` is an opaque string as far as libxayagame is concerned, so the encoding is your choice, and the
choice matters, because two independently synced GSPs have to produce byte-identical bytes. Mover serializes a protobuf message for both state and undo
(`libxayagame/mover/proto/mover.proto`), which is the pattern to copy. JSON is a trap: key ordering and number formatting are not guaranteed to be stable
across libraries or versions. The same reasoning rules out hash-map iteration order, floats and anything read from the clock or the network. DETERMINISM.md
states the law in full and gives you the two acceptance tests that prove your game obeys it.

**Storage.** `--storage_type` takes exactly `memory`, `lmdb` or `sqlite` (the `StorageType` dispatch in `libxayagame/xayagame/defaultmain.cpp`). `memory` persists nothing and
resyncs from genesis on every start: fine for tests, never for a deployment. `lmdb` and `sqlite` both live under `<datadir>/<gameid>/<chain>/`
(`GetGameDirectory` in `libxayagame/xayagame/defaultmain.cpp`), the SQLite one as a single `storage.sqlite` file. Choose `sqlite` unless you have a reason not to: it is
what the ops flags in §1.1 are tuned for, and it unlocks the second option below.

There are two shortcuts past hand-writing `ProcessBackwardsInternal`:

- **`CachingGame`** (`libxayagame/xayagame/gamelogic.hpp`): implement `UpdateState` only, and the framework stores the whole previous state as the
  undo data. Correct and trivial for a game whose state stays small; the state is duplicated per retained block, so pair it with pruning.
- **`SQLiteGame`** (`libxayagame/xayagame/sqlitegame.hpp`): keep your state in SQL tables inside libxayagame's own database and implement one
  update function; rollbacks come from the SQLite **session extension**, which records a changeset per block as the undo data automatically. This is the
  right base for anything with a real schema. One documented sharp edge: the session extension interacts badly with `UNIQUE` constraints, and some edge
  cases will fail to undo correctly: the header itself warns about it, so keep uniqueness in your own validation rather than leaning on the constraint.

**ZMQ is how blocks reach you.** XayaX publishes on the address it is told to *advertise* via `--zmq_address`; the GSP asks for that address over RPC with
`getzmqnotifications` (`Game::DetectZmqEndpoint` in `libxayagame/xayagame/game.cpp`) and subscribes to `game-block-attach json <gameid>` and `game-block-detach json <gameid>`
(`ZmqSubscriber::Listen` and `ZmqSubscriber::Start` in `libxayagame/xayagame/zmqsubscriber.cpp`), plus `game-pending-move json <gameid>` when pending tracking is on
(same `Start`). Because the address is *advertised* rather than dialled, `tcp://localhost:28555` is wrong inside Docker:
localhost from the GSP container is the GSP. Use the compose service name.

That subscription can rot silently, and the database behind it grows silently, which is why the three ops flags are not optional:

- **`--xaya_zmq_staleness_ms`** defaults to `120'000` (its definition in `libxayagame/xayagame/game.cpp`) and is the silence after which the connection is presumed dead.
  At half that threshold the GSP first tries a cheap `game_sendupdates` ping; past the full threshold it drops and reconnects
  (`Game::ProbeAndFixConnection` in `libxayagame/xayagame/game.cpp`).
- **`--xaya_connection_check_ms`** defaults to `0`, i.e. off (its definition in `libxayagame/xayagame/game.cpp`). It is the interval of the watchdog thread that
  `Game::Start` spawns only when the value is non-zero (`Game::ConnectionCheckerThread` in the same file), and that thread is the *only* caller of
  `ProbeAndFixConnection`, the function containing every line of staleness logic above. **So the staleness threshold is completely inert without it.** A
  GSP running with the default keeps reporting `up-to-date` at a frozen height after any XayaX hiccup, forever, until someone restarts it.
- **`--xaya_sqlite_wal_truncate_ms`** also defaults to `0`, off (its definition in `libxayagame/xayagame/sqlitestorage.cpp`), and enables the framework's periodic
  snapshot-guarded `wal_checkpoint(TRUNCATE)`. Without it the SQLite write-ahead log grows without bound. OPS.md carries the runbook.

### 1.3 Verify

- The startup log shows, in order: `Connected to RPC daemon with chain polygon` → `Connected to Xaya Core version 1000000` → `Detected ZMQ blocks
  endpoint` → `Got genesis height from game: <N>` → `Game did not specify genesis hash, retrieved <hash>` → attach-step batches → caught up. Every one of
  those strings is in libxayagame (`Game::ConnectRpcClient`, `Game::DetectZmqEndpoint`, `Game::SyncFromCurrentState` and `Game::ReinitialiseState` in `xayagame/game.cpp`; `VerifyXayaVersion` in `xayagame/defaultmain.cpp`); §5 shows a real run.
- `getnullstate` returns `{"chain":"polygon","gameid":"<id>","state":"up-to-date",...}`.
- Live round-trip: send one real move, watch your own forward-pass log line, and confirm the change through `getcurrentstate`.
- **The acceptance test that actually matters: two independently synced GSPs return byte-identical `gamestate`.** If they do not, you have a determinism
  bug, not an ops problem: go to DETERMINISM.md.

## 2. The chain patch (`mover/logic.cpp`, `GetInitialStateInternal`)

```cpp
    case Chain::POLYGON:
      /* The game state starts at a recent Polygon block.  Moves sent
         before this height are ignored.  The hash is left empty so that
         any block at this height is accepted (we trust the connected
         XayaX instance rather than pinning an exact block hash).  */
      height = 88365000;   /* pick a recent block <= current tip */
      hashHex = "";
      break;
```

`Chain::POLYGON` is one value of the `xaya::Chain` enum in the installed `xayagame/gamelogic.hpp`: the full set is `UNKNOWN`, the Xaya Core chains `MAIN`,
`TEST`, `REGTEST`, the Polygon chains `POLYGON`, `MUMBAI`, and `GANACHE` for EVM regtests (`enum class Chain` in `libxayagame/xayagame/gamelogic.hpp`). Supporting a new
chain is one extra `case` here and nothing else. The height above is illustrative: pick your own, below the live tip with margin. With the hash left empty the GSP logs `Game did not specify genesis hash, retrieved <hash>` and pins it
itself, which is what you want on a chain whose exact block hash at a given height you have no reason to hardcode.

## 3. GSP Dockerfile

Verified; builds in minutes on the `xaya/libxayagame` base.

```dockerfile
FROM xaya/libxayagame AS build

RUN apt update && apt -y install build-essential pkg-config

# Version check: XayaX reports 1000000, stock minimum is 1010200.
# Alternative to this sed: set config.MinXayaVersion = 1000000; in main.cpp.
RUN sed -i 's/unsigned MinXayaVersion = 1010200/unsigned MinXayaVersion = 1000000/' \
    /usr/local/include/xayagame/defaultmain.hpp

WORKDIR /usr/src/mygame
COPY mover/ mover/

RUN protoc -Imover --cpp_out=mover mover/proto/mover.proto

# main.cpp includes config.h (normally generated by the build system).
RUN echo '#define PACKAGE_VERSION "polygon"' > config.h

RUN set -e && \
    CXXFLAGS="-std=c++14 -I. -Imover \
      $(pkg-config --cflags jsoncpp libglog protobuf sqlite3)" && \
    g++ $CXXFLAGS -c mover/proto/mover.pb.cc -o mover.pb.o && \
    g++ $CXXFLAGS -c mover/moves.cpp -o moves.o && \
    g++ $CXXFLAGS -c mover/logic.cpp -o logic.o && \
    g++ $CXXFLAGS -c mover/pending.cpp -o pending.o && \
    g++ $CXXFLAGS -c mover/main.cpp -o main.o && \
    g++ -o moverd main.o logic.o moves.o pending.o mover.pb.o \
      -L/usr/local/lib -lxayagame -lxayautil \
      $(pkg-config --libs jsoncpp libglog gflags protobuf sqlite3 \
        libcurl libzmq libmicrohttpd openssl zlib lmdb \
        libjsonrpccpp-client libjsonrpccpp-server libjsonrpccpp-common)

# cpld (provided by the base image) collects the shared-library closure.
WORKDIR /jail
RUN mkdir -p bin lib64 && cp /usr/src/mygame/moverd bin/ && cpld bin/moverd lib64

FROM debian:13-slim
COPY --from=build /jail /usr/local/
ENV LD_LIBRARY_PATH="/usr/local/lib64"
VOLUME ["/xayagame", "/log"]
ENV GLOG_log_dir="/log"
RUN mkdir -p /log /xayagame
EXPOSE 8600
ENTRYPOINT ["/usr/local/bin/moverd"]
```

Notes. The link line is `-lxayagame -lxayautil` and nothing more: the game-channel libraries are extras a channel referee needs and a persistent GSP does
not. The two-stage build with `cpld` is what keeps the runtime image small: it copies the binary plus exactly its shared-library closure into `/jail`,
which becomes `/usr/local` in a slim Debian. And the base image's own `moverd` is not usable, as §1.1 step 5 explains: build your own.

A build gate belongs in this Dockerfile, not in CI alone: run your unit, golden-replay and reorg suites as a `RUN` step so a determinism or schema
regression cannot produce a shippable image. DETERMINISM.md describes the two suites.

## 4. `docker-compose.yml`

Verified, including the subnet pin.

```yaml
name: mover

services:
  xayax:
    image: xaya/xayax
    profiles: [xayax]
    restart: unless-stopped
    networks: [mover-net]
    ports:
      - "127.0.0.1:8101:8000"
    volumes:
      - xayax-data:/xayax
    command:
      - "eth"
      - "--eth_rpc_url=https://polygon-node.xaya.io"
      - "--accounts_contract=0x8C12253F71091b9582908C8a44F78870Ec6F304F"
      - "--port=8000"
      - "--listen_locally=false"
      - "--zmq_address=tcp://xayax:28555"
      - "--logtostderr"

  moverd:
    build: { context: .., dockerfile: docker/Dockerfile }
    restart: unless-stopped
    networks: [mover-net]
    ports:
      - "127.0.0.1:8602:8600"
    volumes:
      - moverd-data:/xayagame
      - moverd-logs:/log
    environment:
      - GLOG_alsologtostderr=1
    command:
      - "--xaya_rpc_url=http://xayax:8000"
      - "--xaya_rpc_protocol=2"
      - "--game_rpc_port=8600"
      - "--game_rpc_listen_locally=false"
      - "--storage_type=sqlite"
      - "--datadir=/xayagame"
      - "--enable_pruning=1000"
      - "--pending_moves=false"

networks:
  mover-net:
    ipam:
      config:
        # Pin explicitly!  Docker may auto-assign 192.168.0.0/20 when its
        # default pools are exhausted, shadowing the host's LAN routes.
        - subnet: 172.16.0.0/24

volumes:
  xayax-data: {}
  moverd-data: {}
  moverd-logs: {}
```

Launch with `docker compose --profile xayax up -d --build`. Add the three ops flags from §1.1 step 7 to the `moverd` command before you leave this running
unattended: the template above is the minimal verified set, not the production set.

**The subnet pin is not decoration.** Docker will auto-assign `192.168.0.0/20` to a new network once its default pools are exhausted, which shadows a
host's LAN routes and can cut off your own remote access to the machine. Pin every compose network and check `ip route` for collisions before `up`.

**On XayaX's flags.** The published `xaya/xayax` image runs an entrypoint that already supplies `--datadir=/xayax --port=8000
--zmq_address=tcp://${HOST}:28555 --max_reorg_depth="${MAX_REORG_DEPTH}"` and then appends your own arguments after them (`xayax/docker/entrypoint.sh`),
so the flags in the compose file above are re-stating and overriding those defaults: gflags takes the last occurrence. `HOST` defaults to the container's
own detected IP, which is why an explicit `--zmq_address` naming the compose service is the safer form. Two corrections to folklore, from
the flag definitions in `xayax/eth/main.cpp`: **`--eth_ws_url` and `--max_reorg_depth` both exist** (the latter defaulting to `1'000`) and are legitimate to pass; only
`--genesis_height` is invented: there is no such flag. XayaX knobs are version-dependent, so check `docker run --rm xaya/xayax eth --help` against the
image you actually deploy rather than trusting any document, including this one.

## 5. Expected GSP startup log

Real lines from a first sync:

```text
Connected to RPC daemon with chain polygon
Connected to Xaya Core version 1000000
Detected ZMQ blocks endpoint: tcp://xayax:28555
Got genesis height from game: 88365000
Game did not specify genesis hash, retrieved 701ca380fb3ec9bf7e0abd3d4f89895dae229e1138c2fd471245b486568dba10
Retrieving 0 detach and 128 attach steps with reqtoken = request_461, ...
```

The attach-step batches are libxayagame pulling history through XayaX's `game_sendupdates` and tracking each batch by a `reqtoken`
(`Game::SyncFromCurrentState` in `libxayagame/xayagame/game.cpp`); catching up a few thousand blocks takes minutes, not hours. A fresh XayaX on a new volume starts near the
chain tip, serves RPC shortly after, and backfills older blocks on demand, so a GSP genesis height *below* the bridge's own start height works fine.

The instance state passes through `pregenesis` → `catching-up` → `up-to-date`; the full enum also has `unknown`, `out-of-sync`, `at-target` and
`disconnected` (`Game::StateToString` in `libxayagame/xayagame/game.cpp`). `disconnected` is set when the ZMQ subscriber stops listening
(`Game::HasStopped`, same file), and **nothing climbs back out of it without the connection-check flag from §1.2**: that flag's watchdog is the
only code that reconnects. Worse, a subscriber that has gone quiet without stopping never reaches `disconnected` at all: it keeps answering `up-to-date` at
a height that stopped moving. Alert on the height, not only on the state string.

## 6. The GSP JSON-RPC

The daemon listens on `--game_rpc_port` inside the container; the compose above maps it to `127.0.0.1:8602` on the host.

```bash
curl -s -X POST -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"getnullstate","params":[]}' \
  http://127.0.0.1:8602
```

Real output:

```json
{"id":1,"jsonrpc":"2.0","result":{"blockhash":"6a4c5171...","chain":"polygon","gameid":"mv","height":88370225,"state":"up-to-date"}}
```

The complete method list is `stop`, `getcurrentstate`, `getnullstate`, `getpendingstate`, `waitforchange`, `waitforpendingchange`
(`libxayagame/xayagame/rpc-stubs/game.json`):

| Method | What it gives you |
|---|---|
| `getnullstate` | The envelope only: gameid, chain, state, height, blockhash. The cheap sync check; poll this, not `getcurrentstate`. |
| `getcurrentstate` | The same envelope plus `gamestate`, i.e. whatever your `GameStateToJson` returns. |
| `getpendingstate` | **Errors** with `pending moves are not tracked` (`Game::GetPendingJsonState` in `libxayagame/xayagame/game.cpp`) whenever the connected node advertises no pending ZMQ endpoint: the default for XayaX, which exposes one only under `--watch_for_pending_moves` (`Controller::RpcServer::getzmqnotifications` in `xayax/src/controller.cpp`). In that state the GSP logs `Not subscribing to pending moves` (`ZmqSubscriber::Start` in `libxayagame/xayagame/zmqsubscriber.cpp`) and `--pending_moves=true` changes nothing. |
| `waitforchange [knownBlockHash]` | Long-poll for the next state change. |
| `waitforpendingchange [knownVersion]` | The pending-feed equivalent; same caveat. |
| `stop` | Shuts the daemon down. |

**`waitforchange` semantics catch everyone out.** Passing a **valid but stale** block hash returns immediately, because the current hash already differs
from the one you claim to know. Passing an **empty or unparseable** hash does the opposite: it waits for a genuine change, or for the internal timeout:
`5'000` ms by default, `--xaya_waitforchange_timeout_ms` (its definition in `libxayagame/xayagame/game.cpp`). The timeout exists so blocked threads cannot pile up
indefinitely; a return is therefore not proof that anything changed, and you must compare the returned hash against the one you held.

Concurrency: the RPC server is libjson-rpc-cpp's `HttpServer`, constructed with only a port (the `jsonrpc::HttpServer` construction in `libxayagame/xayagame/defaultmain.cpp`), which means its
default worker-thread count of `50` applies (the `threads` default of the `HttpServer` constructor in `jsonrpccpp/server/connectors/httpserver.h`, in the base image). `WaitForChange` releases the game mutex
while it waits on its condition variable (`Game::WaitForChange` in `libxayagame/xayagame/game.cpp`), so an outstanding long-poll does **not** block a concurrent
`getcurrentstate`. What it does do is occupy one worker thread for its whole duration, so a client that opens long-polls without bound will starve the
pool. Budget one in-flight `waitforchange` per client session.

If you want a cheaper client contract than "hand me the whole state", `Game::GetCustomStateData` (`libxayagame/xayagame/game.hpp`) lets you expose
custom getter methods that return the same envelope with only the slice a caller asked for, extracted under the same lock.

## 7. Sending a move

The move envelope is `{"g":{"mv":{"d":"k","n":2}}}`: outer `g`, then the game id, then your game's own move object. The game id lives **in the JSON body**,
never in the contract call's arguments; the first argument is the namespace, and for player moves it is always `'p'`.

```js
walletClient.writeContract({
  address: '0x8C12253F71091b9582908C8a44F78870Ec6F304F',
  abi: moveAbi,   // move(string ns, string name, string mv, uint256 nonce, uint256 amount, address receiver)
  functionName: 'move',
  args: ['p', name, moveJson, 2n ** 256n - 1n, 0n,
         '0x0000000000000000000000000000000000000000'],
});
```

Four things the contract enforces, from `register` and `move` in `XayaAccounts.sol` and `checkMove` in `XayaPolicy.sol` (vendored publicly in
`xayax/eth/solidity/lib/polygon-contract/contracts/`):

- **The sending wallet must own or be approved for the name's NFT** (`_isApprovedOrOwner`), so a move is signed by the name's owner, not by anyone who
  knows the name.
- **The nonce is optional.** `type(uint256).max` skips the check entirely; any other value must match the account's next nonce exactly, which is what you
  want if you are ordering a series of moves from one wallet and cannot tolerate a reorder.
- **The move string must be printable ASCII.** `checkMove` requires every byte to fall in `0x20..0x7E` and reverts with `invalid move data` otherwise:
  so a move carrying a player-supplied nickname with an emoji or an accented character fails **on chain**, before your GSP ever sees it. Escape non-ASCII
  in your JSON encoder.
- **A move can carry a fee.** `checkMove` returns the fee the policy charges, currently zero, and the contract pulls it in WCHI when it is non-zero. Read
  it rather than assuming; a policy is a contract the registry can repoint.

`amount` and `receiver` attach an optional WCHI payment to the move: set both to zero for a plain move, since the contract rejects a non-zero amount with
a zero receiver. A move's gas on Polygon is small enough that per-move transactions are the whole premise of this architecture; SKILL.md's constants table
carries the figures.

After the transaction confirms, your GSP's forward pass runs on that block. Mover logs `Processed 1 moves forward, new state has 1 players`
(the per-block step at the end of `MoverLogic::ProcessForwardInternal` in `libxayagame/mover/logic.cpp`) and `getcurrentstate` then shows `{"players":{"xsv5bob":{"x":0,"y":2}}}`. Note the mover-specific semantic that
surprises everyone once: **a player's first move already executes one step inside its own block**, so `{"d":"k","n":2}` lands at `(0,2)` immediately rather
than after a block of delay. Whatever the equivalent is in your rules, write it down: the block a move arrives in is the block it takes effect in.

## 8. Registering a name

A Xaya name is the identity that sends moves. It is an ERC-721 minted by XayaAccounts, and one name plays every Xaya game.

```text
fee = policy.checkRegistration('p', name)   // read it live; the policy sets it
WCHI.approve(XayaAccounts, fee)             // if allowance < fee
XayaAccounts.register('p', name)            // mints the ERC-721 to the caller
```

`register` calls `policy.checkRegistration(ns, name)` and then pulls that fee via `wchiToken.transferFrom(msg.sender, policy.feeReceiver(), fee)` before
minting (`register` in `XayaAccounts.sol`), which is why the approval goes to **XayaAccounts**, the caller of `transferFrom`, and not to the policy or the fee
receiver. Read the fee live rather than hardcoding it: `checkRegistration` returns the policy's current `registrationFee`, which the policy owner can
change behind a timelock via `scheduleFeeChange` / `enactFeeChange` (`XayaPolicy.sol`), and the registry can repoint its policy altogether, so
re-derive the policy address via `XayaAccounts.policy()` before approving anything to it. SKILL.md's constants table carries the addresses and the fee as
they stand.

The same function is also where the name rules live: the namespace must be non-empty lowercase `a`–`z`, `ns` + `name` together must be under 256 bytes, and
the name must be valid UTF-8 with every codepoint at or above `0x20` (`checkRegistration` in `XayaPolicy.sol`). Validate against that before you spend gas discovering it.

XayaAccounts also exposes `exists(ns,name)` - check it first, a taken name reverts - plus `policy()`, `wchiToken()`, `tokenIdForName`, `tokenIdToName`, and
the standard ERC-721 enumerable surface. **Names are permanent.** There is no rename and no expiry; the NFT is yours until you transfer it, and every move
your game ever processes is attributed to it. Pick deliberately.
