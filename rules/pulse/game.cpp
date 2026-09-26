#include "game.hpp"
#include "sha.hpp"
#include <cstring>

namespace pulse {
namespace {
constexpr std::uint8_t playerBits[] = {
#include "player_bits.inc"
};
constexpr std::uint8_t playerFcBits[] = {
#include "player_fc_bits.inc"
};
constexpr std::uint8_t playerGkBits[] = {
#include "player_gk_bits.inc"
};
constexpr std::uint8_t playerShooting[] = {
#include "player_shooting.inc"
};
constexpr std::uint8_t playerGoalkeeping[] = {
#include "player_goalkeeping.inc"
};
#include "featured_roster.inc"
bool inRoster(std::uint32_t id, const std::uint32_t (&roster)[5]) {
  for (auto choice : roster) if (id == choice) return true;
  return false;
}
std::uint32_t read32(const std::uint8_t* p) {
  return std::uint32_t(p[0]) | (std::uint32_t(p[1]) << 8) |
         (std::uint32_t(p[2]) << 16) | (std::uint32_t(p[3]) << 24);
}
void write32(std::uint8_t* p, std::uint32_t v) {
  for (int i = 0; i < 4; ++i) p[i] = std::uint8_t(v >> (8 * i));
}
bool allZero(const std::array<std::uint8_t, 32>& b) {
  for (auto x : b) if (x) return false;
  return true;
}
int scoreWinner(std::uint8_t kick, const std::uint8_t goals[2]) {
  if (kick < 10) {
    const int remaining0 = 5 - (kick + 1) / 2;
    const int remaining1 = 5 - kick / 2;
    if (goals[0] > goals[1] + remaining1) return 0;
    if (goals[1] > goals[0] + remaining0) return 1;
    return -1;
  }
  if (kick % 2) return -1;
  if (goals[0] != goals[1]) return goals[0] > goals[1] ? 0 : 1;
  return kick == 254 ? 0 : -1;
}
std::uint16_t roundBase(std::uint8_t kick) { return std::uint16_t(5 * kick); }
int expectedTurn(Phase phase, std::uint8_t kick) {
  return (phase == CHOOSE_SHOOTER || phase == SHOOT) ? kick % 2 : 1 - kick % 2;
}
bool tierUsed(const State& s, int seat, std::uint32_t id, bool keeper) {
  if (s.kick >= 10) return false;
  const auto tier = ratingTier(keeper ? goalkeeperRating(id) : shootingRating(id));
  const auto& used = keeper ? s.usedKeepers[seat] : s.usedShooters[seat];
  for (auto previous : used)
    if (previous && ratingTier(keeper ? goalkeeperRating(previous) : shootingRating(previous)) == tier) return true;
  return false;
}
bool validShooter(std::uint32_t id, int seat) {
  return inRoster(id, rosterShooters[seat]) && isCentreForward(id) && ratingTier(shootingRating(id)) >= 0;
}
bool validKeeper(std::uint32_t id, int seat) {
  return inRoster(id, rosterKeepers[seat]) && isGoalkeeper(id) && ratingTier(goalkeeperRating(id)) >= 0;
}
} // namespace

bool playerExists(std::uint32_t id) {
  return id && id < sizeof(playerShooting) && id < sizeof(playerGoalkeeping) &&
    playerShooting[id] != 255 && playerGoalkeeping[id] != 255 &&
    id / 8 < sizeof(playerBits) && (playerBits[id / 8] & (1u << (id % 8)));
}
bool isCentreForward(std::uint32_t id) {
  return playerExists(id) && id / 8 < sizeof(playerFcBits) &&
    (playerFcBits[id / 8] & (1u << (id % 8)));
}
bool isGoalkeeper(std::uint32_t id) {
  return playerExists(id) && id / 8 < sizeof(playerGkBits) &&
    (playerGkBits[id / 8] & (1u << (id % 8)));
}
std::uint8_t shootingRating(std::uint32_t id) {
  return playerExists(id) ? playerShooting[id] : 255;
}
std::uint8_t goalkeeperRating(std::uint32_t id) {
  return playerExists(id) ? playerGoalkeeping[id] : 255;
}
std::uint8_t scoringTargetCount(std::uint32_t id) {
  const auto rating = shootingRating(id);
  if (rating == 255) return 0;
  const std::uint8_t count = rating < 55 ? 2 : rating < 60 ? 3 :
    rating < 65 ? 4 : rating < 70 ? 5 : rating < 80 ? 6 :
    rating < 90 ? 7 : 8;
  return count;
}
bool isScoringTarget(std::uint32_t id, std::uint8_t target) {
  constexpr std::uint8_t steps[6] = {1, 2, 4, 5, 7, 8};
  const auto start = id % 9;
  const auto step = steps[(id / 9) % 6];
  for (std::uint8_t i = 0; i < scoringTargetCount(id); ++i)
    if ((start + i * step) % 9 == target) return true;
  return false;
}
int ratingTier(std::uint8_t rating) {
  return rating >= 90 && rating <= 100 ? 0 : rating >= 80 && rating < 90 ? 1 :
    rating >= 70 && rating < 80 ? 2 : rating >= 60 && rating < 70 ? 3 :
    rating >= 55 && rating < 60 ? 4 : -1;
}
bool canReach(std::uint32_t keeper, std::uint32_t shooter) {
  const auto rating = goalkeeperRating(keeper);
  const auto targets = scoringTargetCount(shooter);
  return rating >= 80 ? targets >= 5 : rating >= 70 ? targets >= 6 :
    rating >= 60 ? targets >= 8 : false;
}
bool adjacent(std::uint8_t first, std::uint8_t second) {
  if (first > 8 || second > 8 || first == second) return false;
  const int dx = int(first % 3) - int(second % 3);
  const int dy = int(first / 3) - int(second / 3);
  return dx >= -1 && dx <= 1 && dy >= -1 && dy <= 1;
}
bool edgeAdjacent(std::uint8_t first, std::uint8_t second) {
  if (!adjacent(first, second)) return false;
  const int dx = int(first % 3) - int(second % 3);
  const int dy = int(first / 3) - int(second / 3);
  return (dx == 0) != (dy == 0);
}
bool validReach(std::uint32_t keeper, std::uint32_t shooter, std::uint8_t first, std::uint8_t second) {
  if (first > 8) return false;
  if (!canReach(keeper, shooter)) return second == 255;
  if (second > 8 || second == first) return false;
  return goalkeeperRating(keeper) >= 90 ? adjacent(first, second) : edgeAdjacent(first, second);
}

bool initial(std::uint8_t participants, const std::uint8_t*, std::size_t cfgLength, State& out) {
  if (participants < 1 || participants > 2 || cfgLength) return false;
  out = State{};
  out.participants = participants;
  out.turn = participants == 2 ? 0 : 255;
  return true;
}

std::array<std::uint8_t, STATE_SIZE> encode(const State& s) {
  std::array<std::uint8_t, STATE_SIZE> b{};
  b[0] = 6; b[1] = s.participants; b[2] = s.phase; b[3] = s.turn;
  b[4] = s.kick; b[5] = s.goals[0]; b[6] = s.goals[1];
  b[7] = static_cast<std::uint8_t>(s.winner);
  b[8] = std::uint8_t(s.turnCount); b[9] = std::uint8_t(s.turnCount >> 8);
  std::memcpy(b.data() + 10, s.commitment.data(), 32);
  write32(b.data() + 42, s.pendingShooter); b[46] = s.pendingLane;
  b[47] = s.lastResult;
  for (int seat = 0; seat < 2; ++seat)
    for (int shot = 0; shot < 5; ++shot)
      write32(b.data() + 48 + 4 * (seat * 5 + shot), s.usedShooters[seat][shot]);
  write32(b.data() + 88, s.lastPlayer);
  b[92] = s.lastShot; b[93] = s.lastGuard;
  write32(b.data() + 94, s.pairShooters[0]);
  write32(b.data() + 98, s.pairShooters[1]);
  b[102] = s.lastReach;
  write32(b.data() + 103, s.pairKeepers[0]);
  write32(b.data() + 107, s.pairKeepers[1]);
  for (int seat = 0; seat < 2; ++seat)
    for (int shot = 0; shot < 5; ++shot)
      write32(b.data() + 111 + 4 * (seat * 5 + shot), s.usedKeepers[seat][shot]);
  write32(b.data() + 151, s.pendingKeeper);
  write32(b.data() + 155, s.lastKeeper);
  return b;
}

bool decode(const std::uint8_t* b, std::size_t n, std::uint8_t participants, State& s) {
  if (!b || n != STATE_SIZE || b[0] != 6 || b[1] != participants) return false;
  s.participants = b[1]; s.phase = static_cast<Phase>(b[2]); s.turn = b[3];
  s.kick = b[4]; s.goals[0] = b[5]; s.goals[1] = b[6];
  s.winner = static_cast<std::int8_t>(b[7]);
  s.turnCount = std::uint16_t(b[8]) | (std::uint16_t(b[9]) << 8);
  std::memcpy(s.commitment.data(), b + 10, 32);
  s.pendingShooter = read32(b + 42); s.pendingLane = b[46];
  s.lastResult = static_cast<Result>(b[47]);
  for (int seat = 0; seat < 2; ++seat)
    for (int shot = 0; shot < 5; ++shot)
      s.usedShooters[seat][shot] = read32(b + 48 + 4 * (seat * 5 + shot));
  s.lastPlayer = read32(b + 88); s.lastShot = b[92]; s.lastGuard = b[93];
  s.pairShooters[0] = read32(b + 94); s.pairShooters[1] = read32(b + 98);
  s.lastReach = b[102];
  s.pairKeepers[0] = read32(b + 103); s.pairKeepers[1] = read32(b + 107);
  for (int seat = 0; seat < 2; ++seat)
    for (int shot = 0; shot < 5; ++shot)
      s.usedKeepers[seat][shot] = read32(b + 111 + 4 * (seat * 5 + shot));
  s.pendingKeeper = read32(b + 151);
  s.lastKeeper = read32(b + 155);
  return true;
}

bool valid(const State& s) {
  if (s.participants < 1 || s.participants > 2 ||
      (s.phase > REVEAL && s.phase != FINISHED) || s.kick > 254 ||
      s.turnCount > 1270 || s.goals[0] > (s.kick + 1) / 2 ||
      s.goals[1] > s.kick / 2 || s.lastResult > SAVED ||
      s.pendingShooter || s.pendingKeeper) return false;
  if (s.participants == 1)
    return s.phase == CHOOSE_SHOOTER && s.turn == 255 && !s.kick && !s.turnCount &&
      s.winner == -1 && allZero(s.commitment) && s.pendingLane == 255 &&
      !s.pairShooters[0] && !s.pairShooters[1] && !s.pairKeepers[0] && !s.pairKeepers[1];
  const auto base = roundBase(s.kick);
  const int outcome = scoreWinner(s.kick, s.goals);
  Phase active = s.phase;
  if (s.phase == FINISHED) {
    if (s.turn != 255 || s.winner < 0 || s.winner > 1) return false;
    if (outcome != -1 && s.winner == outcome && s.turnCount == base) {
      active = FINISHED;
    } else {
      if (outcome != -1 || s.turnCount <= base || s.turnCount > base + 5) return false;
      active = static_cast<Phase>(s.turnCount - base - 1);
      if (s.winner != 1 - expectedTurn(active, s.kick)) return false;
    }
  } else if (outcome != -1 || s.winner != -1 || s.kick == 254 ||
             s.turn != expectedTurn(s.phase, s.kick) ||
             s.turnCount != base + s.phase) return false;
  const int shooterSeat = s.kick % 2, defenderSeat = 1 - shooterSeat;
  const bool shooterChosen = active >= CHOOSE_KEEPER && active <= REVEAL;
  const bool keeperChosen = active >= COMMIT && active <= REVEAL;
  if (shooterChosen != bool(s.pairShooters[shooterSeat]) ||
      keeperChosen != bool(s.pairKeepers[defenderSeat]) ||
      s.pairShooters[defenderSeat] || s.pairKeepers[shooterSeat] ||
      (shooterChosen && !validShooter(s.pairShooters[shooterSeat], shooterSeat)) ||
      (keeperChosen && !validKeeper(s.pairKeepers[defenderSeat], defenderSeat))) return false;
  for (int seat = 0; seat < 2; ++seat) {
    const int completedShoot = (s.kick + 1 - seat) / 2;
    const int completedKeep = (s.kick + seat) / 2;
    const int assignedShoot = s.kick < 10 ? completedShoot + (shooterChosen && seat == shooterSeat) : 5;
    const int assignedKeep = s.kick < 10 ? completedKeep + (keeperChosen && seat == defenderSeat) : 5;
    for (int i = 0; i < 5; ++i) {
      const auto shooter = s.usedShooters[seat][i], keeper = s.usedKeepers[seat][i];
      if ((i < assignedShoot) != bool(shooter) || (i < assignedKeep) != bool(keeper) ||
          (shooter && !validShooter(shooter, seat)) || (keeper && !validKeeper(keeper, seat))) return false;
      for (int j = 0; j < i; ++j) {
        if (shooter && ratingTier(shootingRating(shooter)) == ratingTier(shootingRating(s.usedShooters[seat][j]))) return false;
        if (keeper && ratingTier(goalkeeperRating(keeper)) == ratingTier(goalkeeperRating(s.usedKeepers[seat][j]))) return false;
      }
    }
    if (s.kick < 10 && shooterChosen && seat == shooterSeat &&
        s.usedShooters[seat][completedShoot] != s.pairShooters[seat]) return false;
    if (s.kick < 10 && keeperChosen && seat == defenderSeat &&
        s.usedKeepers[seat][completedKeep] != s.pairKeepers[seat]) return false;
  }
  if ((active == SHOOT || active == REVEAL) == allZero(s.commitment) ||
      (active == REVEAL ? s.pendingLane > 8 || !isScoringTarget(s.pairShooters[shooterSeat], s.pendingLane) : s.pendingLane != 255)) return false;
  if (s.kick == 0) {
    if (s.lastResult != NONE || s.lastPlayer || s.lastKeeper || s.lastShot != 255 ||
        s.lastGuard != 255 || s.lastReach != 255) return false;
  } else if (s.lastResult == NONE || !validShooter(s.lastPlayer, (s.kick - 1) % 2) || !validKeeper(s.lastKeeper, 1 - (s.kick - 1) % 2) ||
             s.lastShot > 8 || !isScoringTarget(s.lastPlayer, s.lastShot) ||
             !validReach(s.lastKeeper, s.lastPlayer, s.lastGuard, s.lastReach)) return false;
  if (s.kick > 0) {
    const auto result = s.lastShot == s.lastGuard || s.lastShot == s.lastReach ? SAVED : GOAL;
    if (s.lastResult != result) return false;
  }
  return true;
}

int whoseTurn(const State& s) { return s.participants == 2 && s.phase != FINISHED ? s.turn : -1; }

bool apply(State& s, const std::uint8_t* m, std::size_t n) {
  if (!m || !valid(s) || s.participants != 2 || s.phase == FINISHED) return false;
  State next = s;
  const int shooterSeat = s.kick % 2, defenderSeat = 1 - shooterSeat;
  if (s.phase == CHOOSE_SHOOTER) {
    if (n != 5 || m[0] != 4) return false;
    const auto shooter = read32(m + 1);
    if (!validShooter(shooter, shooterSeat) || tierUsed(s, shooterSeat, shooter, false)) return false;
    next.pairShooters[shooterSeat] = shooter;
    if (s.kick < 10) next.usedShooters[shooterSeat][s.kick / 2] = shooter;
    next.phase = CHOOSE_KEEPER; next.turn = defenderSeat;
  } else if (s.phase == CHOOSE_KEEPER) {
    if (n != 5 || m[0] != 5) return false;
    const auto keeper = read32(m + 1);
    if (!validKeeper(keeper, defenderSeat) || tierUsed(s, defenderSeat, keeper, true)) return false;
    next.pairKeepers[defenderSeat] = keeper;
    if (s.kick < 10) next.usedKeepers[defenderSeat][s.kick / 2] = keeper;
    next.phase = COMMIT;
  } else if (s.phase == COMMIT) {
    if (n != 33 || m[0] != 1) return false;
    std::memcpy(next.commitment.data(), m + 1, 32);
    if (allZero(next.commitment)) return false;
    next.phase = SHOOT; next.turn = shooterSeat;
  } else if (s.phase == SHOOT) {
    if (n != 2 || m[0] != 2 || m[1] > 8 ||
        !isScoringTarget(s.pairShooters[shooterSeat], m[1])) return false;
    next.pendingLane = m[1];
    next.phase = REVEAL; next.turn = defenderSeat;
  } else {
    if (n != 35 || m[0] != 3 || m[1] > 8) return false;
    const auto keeper = s.pairKeepers[defenderSeat];
    const auto striker = s.pairShooters[shooterSeat];
    if (!validReach(keeper, striker, m[1], m[2])) return false;
    std::uint8_t payload[36] = {0x47, s.kick, m[1], m[2]};
    std::memcpy(payload + 4, m + 3, 32);
    std::uint8_t digest[32];
    pulse_sha256(payload, sizeof(payload), digest);
    if (std::memcmp(digest, s.commitment.data(), 32) != 0) return false;
    next.lastPlayer = striker; next.lastKeeper = keeper; next.lastShot = s.pendingLane;
    next.lastGuard = m[1]; next.lastReach = m[2];
    next.lastResult = m[1] == s.pendingLane || m[2] == s.pendingLane ? SAVED : GOAL;
    if (next.lastResult == GOAL) ++next.goals[shooterSeat];
    next.commitment.fill(0); next.pendingLane = 255;
    next.pairShooters[shooterSeat] = 0; next.pairKeepers[defenderSeat] = 0;
    ++next.kick;
    const int winner = scoreWinner(next.kick, next.goals);
    if (winner != -1) {
      next.phase = FINISHED; next.turn = 255; next.winner = winner;
    } else {
      next.phase = CHOOSE_SHOOTER; next.turn = next.kick % 2;
    }
  }
  ++next.turnCount;
  if (!valid(next)) return false;
  s = next;
  return true;
}

bool timeout(State& s, std::uint8_t seat) {
  if (!valid(s) || s.participants != 2 || s.phase == FINISHED || seat != s.turn) return false;
  s.phase = FINISHED; s.turn = 255; s.winner = 1 - seat;
  ++s.turnCount;
  return valid(s);
}
} // namespace pulse
