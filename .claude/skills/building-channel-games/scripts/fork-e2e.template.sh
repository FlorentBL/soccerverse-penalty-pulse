#!/usr/bin/env bash
# TEMPLATE - copy into your game repo and adapt. No secrets/paths baked in.
#
# Forked-EVM E2E skeleton for a Xaya game channel - NO real POL/WCHI spent,
# NO docker network created by this script (reuses one your stack already
# runs), NO private keys committed anywhere in this file.
#
# Pattern: stand up a throwaway Polygon fork (anvil) + a fork-pointed XayaX +
# your GSP, then drive create -> join -> play -> close through your ACTUAL
# frontend/client code (only the wallet is a burner). This is the only way to
# exercise WCHI-paid moves, multi-block resolution, and reorgs without real
# funds, and it catches wire-contract drift (RPC param shapes, field names)
# that unit tests alone can't.
#
# The archive RPC key (if your fork source needs one, e.g. Alchemy/QuickNode)
# belongs in a gitignored .env - NEVER hardcode it here, never commit it.
#
# Usage (adapt to taste):
#   scripts/fork/fork-e2e.sh up      # start fork + xayax + gsp, wait synced
#   scripts/fork/fork-e2e.sh run     # up + drive the e2e scenario(s)
#   scripts/fork/fork-e2e.sh status  # show fork/container/GSP health
#   scripts/fork/fork-e2e.sh down    # tear down (containers + the anvil WE started)
set -euo pipefail

# ── fixed wiring - fill these in for your stack ─────────────────────────────
NET="<compose-network-name>"          # an EXISTING docker network; never `docker network create` here
GW="<bridge-gateway-ip>"              # gateway IP of $NET - verify with `docker network inspect <NET>`
ANVIL_PORT=8545
GSP_HOSTPORT="<free-host-port>"       # host:container 8600, pick a port not already bound
ACC=0x8C12253F71091b9582908C8a44F78870Ec6F304F   # XayaAccounts, Polygon mainnet (present on any Polygon fork)
WALLET="<funded-test-wallet-address>"            # address only - key is loaded separately, see TN_KEY below

# Fork source. Prefer --no-mining if your scenarios don't need real time to
# pass (mine on demand); use --block-time <seconds> instead if you need
# disputes/timeouts to expire naturally without injecting extra blocks.
FORK_RPC="${FORK_RPC:?set FORK_RPC in a gitignored .env - archive/RPC endpoint, may embed a provider API key}"
BLOCK_TIME="${BLOCK_TIME:-2}"

XAYAX_IMG=xaya/xayax
GSP_IMG="${GSP_IMG:-GAMENAME-gsp:latest}"
# Game ID / move namespace. Use a FRESH THROWAWAY id for fork testing so it
# can never collide with your canonical live game (registering a `g/` name
# to a contract is permanent). The GSP always runs on a fresh anonymous
# datadir in this harness, so genesis height is derived at container start.
GAME_ID="${GAME_ID:-gamenametest}"

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
RUNDIR="$HERE/.run"
PIDFILE="$RUNDIR/anvil.pid"
LOGFILE="$RUNDIR/anvil.log"
ANVIL="${ANVIL:-anvil}"     # override to a full path if not on PATH, e.g. $HOME/.foundry/bin/anvil
CAST="${CAST:-cast}"
FORGE="${FORGE:-forge}"
RPC="http://$GW:$ANVIL_PORT"
GSP_URL="http://127.0.0.1:$GSP_HOSTPORT"
# The funded test wallet's key material (SECRET - never print, never commit).
# Point this at a gitignored path or an env var populated at runtime.
TN_KEY="${TN_KEY:?set TN_KEY to a gitignored keyfile path}"

mkdir -p "$RUNDIR"
say() { printf '\033[36m[fork-e2e]\033[0m %s\n' "$*"; }
die() { printf '\033[31m[fork-e2e] %s\033[0m\n' "$*" >&2; exit 1; }

# ── network sanity: must already exist; we never create it ─────────────────
require_net() {
  docker network inspect "$NET" >/dev/null 2>&1 \
    || die "network $NET not found - refusing to create one (start your main stack first)"
  local gw; gw="$(docker network inspect "$NET" -f '{{range .IPAM.Config}}{{.Gateway}}{{end}}')"
  [ "$gw" = "$GW" ] || die "network $NET gateway is $gw, expected $GW - check your wiring"
}

# ── anvil lifecycle (host process; only ever stops the one WE started) ─────
anvil_up() {
  if "$CAST" chain-id --rpc-url "$RPC" >/dev/null 2>&1; then
    say "anvil already up at $RPC"
    return
  fi
  say "starting anvil fork of $FORK_RPC at $RPC (block-time ${BLOCK_TIME}s) ..."
  # --no-mining instead of --block-time if your scenarios mine on demand.
  HOST="$GW" PORT="$ANVIL_PORT" nohup "$ANVIL" \
    --host "$GW" --port "$ANVIL_PORT" \
    --fork-url "$FORK_RPC" --block-time "$BLOCK_TIME" \
    >"$LOGFILE" 2>&1 &
  echo $! >"$PIDFILE"
  for _ in $(seq 1 40); do
    "$CAST" chain-id --rpc-url "$RPC" >/dev/null 2>&1 && break
    sleep 0.5
  done
  "$CAST" chain-id --rpc-url "$RPC" >/dev/null 2>&1 \
    || { tail -20 "$LOGFILE" >&2; die "anvil did not come up - see $LOGFILE"; }
  say "anvil up (fork base block $("$CAST" block-number --rpc-url "$RPC"))"
}

anvil_down() {
  [ -f "$PIDFILE" ] || { say "no anvil pidfile - nothing to stop"; return; }
  local pid; pid="$(cat "$PIDFILE")"
  # Only kill it if it is genuinely OUR anvil (exact comm match) - never pkill,
  # so other anvils/games on a shared host are untouched.
  if [ -n "$pid" ] && [ "$(cat "/proc/$pid/comm" 2>/dev/null)" = "anvil" ]; then
    say "stopping anvil pid $pid"; kill "$pid" 2>/dev/null || true
  else
    say "pidfile pid '$pid' is not a live anvil - nothing to stop"
  fi
  rm -f "$PIDFILE"
}

fund_wallet() {
  # Fork-only top-up so gas is never a question. anvil_setBalance is a fork
  # cheat; this "POL" is not real and has no value off the fork.
  "$CAST" rpc anvil_setBalance "$WALLET" 0x3635c9adc5dea00000 --rpc-url "$RPC" >/dev/null \
    && say "funded $WALLET with fork-POL (gas only; not real)"
}

# ── containers (on the EXISTING network; anonymous volumes => fresh state) ──
containers_down() {
  docker rm -f fork-gsp fork-xayax >/dev/null 2>&1 && say "removed fork containers" || true
}

containers_up() {
  containers_down   # always start from a clean, fresh-datadir pair
  say "starting fork-xayax (eth_rpc -> $RPC) on $NET ..."
  # MAX_REORG_DEPTH small (e.g. 10): a fork is linear/deterministic (anvil
  # never reorgs), so a deep buffer just forces xayax to replay that many
  # historical blocks through the upstream on startup - wasteful, can crash it.
  docker run -d --name fork-xayax --network "$NET" --restart no \
    -e MAX_REORG_DEPTH=10 \
    "$XAYAX_IMG" eth \
    --eth_rpc_url="$RPC" \
    --accounts_contract="$ACC" \
    --listen_locally=false \
    --logtostderr >/dev/null

  # Optional: wagering bootstrap. Only meaningful on a FRESH datadir
  # (guaranteed here). See WAGERING.md - seeds the payment-queue front so the
  # first paid createMatch per tier has a payout target to attach.
  local boot=()
  if [ "${WAGER_MODE:-0}" = "1" ]; then
    boot=(--bootstrap_queue_address="${WAGER_OPERATOR:?}" --bootstrap_queue_tiers="${WAGER_TIERS_PAID:?}")
    say "  bootstrapping payment queue (operator=$WAGER_OPERATOR tiers=$WAGER_TIERS_PAID)"
  fi

  local start_h; start_h="$("$CAST" block-number --rpc-url "$RPC")"
  say "starting fork-gsp (image $GSP_IMG, xaya_rpc -> fork-xayax:8000, start height $start_h) on $NET ..."
  docker run -d --name fork-gsp --network "$NET" --restart no \
    -e GLOG_logtostderr=1 \
    -p "127.0.0.1:$GSP_HOSTPORT:8600" \
    "$GSP_IMG" \
    --xaya_rpc_url=http://fork-xayax:8000 \
    --xaya_rpc_protocol=2 \
    --game_rpc_port=8600 \
    --game_rpc_listen_locally=false \
    --datadir=/xayagame \
    --game_id="$GAME_ID" \
    --enable_pruning=1000 \
    --polygon_start_height="$start_h" \
    --xaya_zmq_staleness_ms=30000 \
    ${boot[@]+"${boot[@]}"} >/dev/null
}

gsp_state() {
  # `|| true`: the RPC port is briefly unbound right after container start, so
  # curl can exit non-zero - must NOT abort the caller under `set -e`.
  curl -s --max-time 4 "$GSP_URL" -H 'Content-Type: application/json' \
    -d '{"jsonrpc":"2.0","id":1,"method":"getnullstate","params":[]}' 2>/dev/null || true
}

# Sync-with-a-bounded-deadline pattern: poll from the TEST side, never make a
# helper/container busy-wait with no timeout for an exact block/state - that
# has been observed to wedge a helper process permanently under load.
wait_synced() {
  say "waiting for fork-gsp to reach up-to-date ..."
  for i in $(seq 1 90); do
    local r st h; r="$(gsp_state)"
    st="$(printf '%s' "$r" | sed -n 's/.*"state":"\([^"]*\)".*/\1/p')"
    h="$(printf '%s' "$r"  | sed -n 's/.*"height":\([0-9]*\).*/\1/p')"
    if [ "$st" = "up-to-date" ]; then say "GSP up-to-date at height ${h:-?}"; return 0; fi
    if ! docker ps --format '{{.Names}}' | grep -q '^fork-gsp$'; then
      docker logs --tail 30 fork-gsp 2>&1 | sed 's/^/    gsp| /' >&2
      die "fork-gsp exited while syncing"
    fi
    [ $((i % 10)) -eq 0 ] && say "  ... still syncing (state=${st:-none} height=${h:-?})"
    sleep 2
  done
  docker logs --tail 30 fork-gsp 2>&1 | sed 's/^/    gsp| /' >&2
  die "GSP did not reach up-to-date in time (bounded deadline hit - see log above)"
}

# ── (optional) wager contract deploy on the fork ────────────────────────────
# Deploy with a FRESH throwaway game id every run - never point a fork test
# at your canonical live `g/<name>` (contract ownership of a game name is
# permanent). Adapt the forge/deploy-script invocation to your contract.
deploy_wager() {
  [ -f "$ROOT/contracts/out/<YourWagerContract>.sol/<YourWagerContract>.json" ] || {
    say "forge artifact missing - building contracts ..."
    ( cd "$ROOT/contracts" && "$FORGE" build ) || die "forge build failed"
  }
  [ -f "$TN_KEY" ] || die "test wallet key not found at $TN_KEY (set TN_KEY)"
  say "deploying wager contract on the fork (fork-WCHI/POL only; NO real funds) ..."
  # e.g.: npx tsx scripts/onchain-e2e.ts --deploy-wager --rpc "$RPC" --key "$TN_KEY" --game-id "$GAME_ID"
}

cmd_up() {
  require_net
  anvil_up
  fund_wallet
  [ "${WAGER_MODE:-0}" = "1" ] && deploy_wager
  containers_up
  wait_synced
  say "fork stack ready: RPC=$RPC GSP=$GSP_URL"
}

cmd_run() {
  cmd_up
  say "driving e2e scenario against the fork through the REAL client code - no real POL ..."
  # Point your actual move-builder / on-chain sender / GSP client at $RPC and
  # $GSP_URL here (e.g. `npx tsx scripts/onchain-e2e.ts --scenario=all`).
  # This is what catches wire-contract drift that unit tests can't.
}

cmd_status() {
  require_net
  if "$CAST" chain-id --rpc-url "$RPC" >/dev/null 2>&1; then
    say "anvil: up (chain $("$CAST" chain-id --rpc-url "$RPC"), block $("$CAST" block-number --rpc-url "$RPC"))"
  else say "anvil: DOWN ($RPC)"; fi
  docker ps --format '{{.Names}}\t{{.Status}}' | grep -E 'fork-xayax|fork-gsp' || say "containers: none"
  say "GSP: $(gsp_state)"
}

cmd_down() {
  containers_down
  anvil_down
  say "down."
}

case "${1:-run}" in
  up)     cmd_up ;;
  run)    cmd_run ;;
  status) cmd_status ;;
  down)   cmd_down ;;
  *)      die "unknown command '$1' (use: up|run|status|down)" ;;
esac
