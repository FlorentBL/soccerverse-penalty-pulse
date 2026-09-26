#include "game.hpp"
#include "sha.hpp"
#include <cstring>

namespace pulse {
namespace {
constexpr std::uint8_t playerBits[] = {
#include "player_bits.inc"
};
constexpr std::uint8_t playerShooting[] = {
#include "player_shooting.inc"
};
constexpr std::uint8_t playerGoalkeeping[] = {
#include "player_goalkeeping.inc"
};
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
  if (kick < 6) {
    const int remaining0 = 3 - (kick + 1) / 2;
    const int remaining1 = 3 - kick / 2;
    if (goals[0] > goals[1] + remaining1) return 0;
    if (goals[1] > goals[0] + remaining0) return 1;
    return -1;
  }
  if (kick % 2) return -1;
  if (goals[0] != goals[1]) return goals[0] > goals[1] ? 0 : 1;
  return kick == 254 ? 0 : -1;
}
std::uint16_t roundBase(std::uint8_t kick) {
  return std::uint16_t(9 * (kick / 2) + (kick % 2 ? 6 : 0));
}
std::uint8_t phaseOffset(Phase phase, std::uint8_t kick) {
  return kick % 2 ? std::uint8_t(phase - COMMIT) : std::uint8_t(phase);
}
bool tierUsed(const State& s, int seat, std::uint32_t id, bool keeper) {
  if (s.kick >= 6) return false;
  const auto tier = ratingTier(keeper ? goalkeeperRating(id) : shootingRating(id));
  const auto& used = keeper ? s.usedKeepers[seat] : s.usedShooters[seat];
  for (auto previous : used)
    if (previous && ratingTier(keeper ? goalkeeperRating(previous) : shootingRating(previous)) == tier) return true;
  return false;
}
bool validDuo(std::uint32_t shooter, std::uint32_t keeper) {
  return shooter != keeper && playerExists(shooter) && playerExists(keeper) &&
    ratingTier(shootingRating(shooter)) >= 0 && ratingTier(goalkeeperRating(keeper)) >= 0;
}
std::uint8_t expectedTurn(Phase phase, std::uint8_t kick) {
  if (phase == PICK_COMMIT || phase == PICK_REVEAL) return 0;
  if (phase == PICK) return 1;
  if (phase == SHOOT) return kick % 2;
  return 1 - kick % 2;
}
} // namespace

bool playerExists(std::uint32_t id) {
  return id && id < sizeof(playerShooting) && id < sizeof(playerGoalkeeping) &&
    playerShooting[id] != 255 && playerGoalkeeping[id] != 255 &&
    id / 8 < sizeof(playerBits) && (playerBits[id / 8] & (1u << (id % 8)));
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
  return rating >= 90 && rating <= 100 ? 0 : rating >= 75 && rating < 90 ? 1 :
    rating >= 55 && rating < 75 ? 2 : -1;
}
bool canReach(std::uint32_t keeper, std::uint32_t shooter) {
  return goalkeeperRating(keeper) >= 75 && scoringTargetCount(shooter) >= 4;
}
bool adjacent(std::uint8_t first, std::uint8_t second) {
  if (first > 8 || second > 8 || first == second) return false;
  const int dx = int(first % 3) - int(second % 3);
  const int dy = int(first / 3) - int(second / 3);
  return dx >= -1 && dx <= 1 && dy >= -1 && dy <= 1;
}
bool validReach(std::uint32_t keeper, std::uint32_t shooter, std::uint8_t first, std::uint8_t second) {
  if (first > 8) return false;
  if (!canReach(keeper, shooter)) return second == 255;
  if (second > 8 || second == first) return false;
  return goalkeeperRating(keeper) >= 90 || adjacent(first, second);
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
  b[0] = 3; b[1] = s.participants; b[2] = s.phase; b[3] = s.turn;
  b[4] = s.kick; b[5] = s.goals[0]; b[6] = s.goals[1];
  b[7] = static_cast<std::uint8_t>(s.winner);
  b[8] = std::uint8_t(s.turnCount); b[9] = std::uint8_t(s.turnCount >> 8);
  std::memcpy(b.data() + 10, s.commitment.data(), 32);
  write32(b.data() + 42, s.pendingShooter); b[46] = s.pendingLane;
  b[47] = s.lastResult;
  for (int seat = 0; seat < 2; ++seat)
    for (int shot = 0; shot < 3; ++shot)
      write32(b.data() + 48 + 4 * (seat * 3 + shot), s.usedShooters[seat][shot]);
  write32(b.data() + 72, s.lastPlayer);
  b[76] = s.lastShot; b[77] = s.lastGuard;
  write32(b.data() + 78, s.pairShooters[0]);
  write32(b.data() + 82, s.pairShooters[1]);
  b[86] = s.lastReach;
  write32(b.data() + 87, s.pairKeepers[0]);
  write32(b.data() + 91, s.pairKeepers[1]);
  for (int seat = 0; seat < 2; ++seat)
    for (int shot = 0; shot < 3; ++shot)
      write32(b.data() + 95 + 4 * (seat * 3 + shot), s.usedKeepers[seat][shot]);
  write32(b.data() + 119, s.pendingKeeper);
  write32(b.data() + 123, s.lastKeeper);
  return b;
}

bool decode(const std::uint8_t* b, std::size_t n, std::uint8_t participants, State& s) {
  if (!b || n != STATE_SIZE || b[0] != 3 || b[1] != participants) return false;
  s.participants = b[1]; s.phase = static_cast<Phase>(b[2]); s.turn = b[3];
  s.kick = b[4]; s.goals[0] = b[5]; s.goals[1] = b[6];
  s.winner = static_cast<std::int8_t>(b[7]);
  s.turnCount = std::uint16_t(b[8]) | (std::uint16_t(b[9]) << 8);
  std::memcpy(s.commitment.data(), b + 10, 32);
  s.pendingShooter = read32(b + 42); s.pendingLane = b[46];
  s.lastResult = static_cast<Result>(b[47]);
  for (int seat = 0; seat < 2; ++seat)
    for (int shot = 0; shot < 3; ++shot)
      s.usedShooters[seat][shot] = read32(b + 48 + 4 * (seat * 3 + shot));
  s.lastPlayer = read32(b + 72); s.lastShot = b[76]; s.lastGuard = b[77];
  s.pairShooters[0] = read32(b + 78); s.pairShooters[1] = read32(b + 82);
  s.lastReach = b[86];
  s.pairKeepers[0] = read32(b + 87); s.pairKeepers[1] = read32(b + 91);
  for (int seat = 0; seat < 2; ++seat)
    for (int shot = 0; shot < 3; ++shot)
      s.usedKeepers[seat][shot] = read32(b + 95 + 4 * (seat * 3 + shot));
  s.pendingKeeper = read32(b + 119);
  s.lastKeeper = read32(b + 123);
  return true;
}

bool valid(const State& s) {
  if (s.participants < 1 || s.participants > 2 || s.phase > FINISHED ||
      s.kick > 254 || s.turnCount > 1143 ||
      s.goals[0] > (s.kick + 1) / 2 || s.goals[1] > s.kick / 2 ||
      s.lastResult > MISSED) return false;
  if (s.participants == 1) {
    return s.phase == PICK_COMMIT && s.turn == 255 && !s.kick && !s.turnCount &&
      s.winner == -1 && allZero(s.commitment) && !s.pendingShooter && !s.pendingKeeper &&
      !s.pairShooters[0] && !s.pairShooters[1] && !s.pairKeepers[0] && !s.pairKeepers[1];
  }
  const auto base = roundBase(s.kick);
  Phase active = s.phase;
  const int outcome = scoreWinner(s.kick, s.goals);
  if (s.phase == FINISHED) {
    if (s.turn != 255 || s.winner < 0 || s.winner > 1) return false;
    if (outcome != -1 && s.winner == outcome && s.turnCount == base) {
      active = FINISHED;
    } else {
      if (outcome != -1 || s.turnCount <= base) return false;
      const int offset = s.turnCount - base - 1;
      if (offset < 0 || offset > (s.kick % 2 ? 2 : 5)) return false;
      active = static_cast<Phase>(offset + (s.kick % 2 ? COMMIT : PICK_COMMIT));
    }
  } else {
    if (outcome != -1 || s.winner != -1 ||
        (s.kick % 2 && s.phase < COMMIT) ||
        s.turn != expectedTurn(s.phase, s.kick) ||
        s.turnCount != base + phaseOffset(s.phase, s.kick)) return false;
  }
  const bool selected = s.kick % 2 || (active >= COMMIT && active <= REVEAL);
  for (int seat = 0; seat < 2; ++seat) {
    for (int shot = 0; shot < 3; ++shot) {
      const auto shooter = s.usedShooters[seat][shot];
      const auto keeper = s.usedKeepers[seat][shot];
      const bool assigned = shot < s.kick / 2 || (selected && shot == s.kick / 2);
      if ((assigned && !validDuo(shooter, keeper)) || (!assigned && (shooter || keeper))) return false;
      for (int earlier = 0; earlier < shot; ++earlier)
        if (shooter && (ratingTier(shootingRating(shooter)) == ratingTier(shootingRating(s.usedShooters[seat][earlier])) ||
                        ratingTier(goalkeeperRating(keeper)) == ratingTier(goalkeeperRating(s.usedKeepers[seat][earlier])))) return false;
    }
  }
  if (selected) {
    for (int seat = 0; seat < 2; ++seat)
      if (!validDuo(s.pairShooters[seat], s.pairKeepers[seat]) ||
          (s.kick < 6 && (s.pairShooters[seat] != s.usedShooters[seat][s.kick / 2] ||
                          s.pairKeepers[seat] != s.usedKeepers[seat][s.kick / 2]))) return false;
  } else if (s.pairShooters[0] || s.pairShooters[1] || s.pairKeepers[0] || s.pairKeepers[1]) return false;
  if (active == PICK_COMMIT || active == COMMIT || active == FINISHED) {
    if (!allZero(s.commitment) || s.pendingShooter || s.pendingKeeper || s.pendingLane != 255) return false;
  } else if (active == PICK || active == PICK_REVEAL) {
    if (allZero(s.commitment) || s.pendingLane != 255 ||
        (active == PICK ? s.pendingShooter != 0 || s.pendingKeeper != 0 :
         !validDuo(s.pendingShooter, s.pendingKeeper) ||
         tierUsed(s, 1, s.pendingShooter, false) || tierUsed(s, 1, s.pendingKeeper, true))) return false;
  } else {
    if ((active == SHOOT || active == REVEAL ? allZero(s.commitment) : !allZero(s.commitment)) ||
        s.pendingShooter || s.pendingKeeper || (active == REVEAL ? s.pendingLane > 8 : s.pendingLane != 255)) return false;
  }
  if (s.kick == 0) {
    if (s.lastResult != NONE || s.lastPlayer || s.lastKeeper || s.lastShot != 255 ||
        s.lastGuard != 255 || s.lastReach != 255) return false;
  } else if (s.lastResult == NONE || !validDuo(s.lastPlayer, s.lastKeeper) ||
             s.lastShot > 8 || !validReach(s.lastKeeper, s.lastPlayer, s.lastGuard, s.lastReach)) return false;
  if (s.kick > 0) {
    const auto result = s.lastShot == s.lastGuard || s.lastShot == s.lastReach ? SAVED :
      isScoringTarget(s.lastPlayer, s.lastShot) ? GOAL : MISSED;
    if (s.lastResult != result) return false;
  }
  return true;
}

int whoseTurn(const State& s) { return s.participants == 2 && s.phase != FINISHED ? s.turn : -1; }

bool apply(State& s, const std::uint8_t* m, std::size_t n) {
  if (!m || !valid(s) || s.participants != 2 || s.phase == FINISHED) return false;
  State next = s;
  if (s.phase == PICK_COMMIT) {
    if (n != 33 || m[0] != 5) return false;
    std::memcpy(next.commitment.data(), m + 1, 32);
    if (allZero(next.commitment)) return false;
    next.phase = PICK; next.turn = 1;
  } else if (s.phase == PICK) {
    if (n != 9 || m[0] != 4) return false;
    const auto shooter = read32(m + 1), keeper = read32(m + 5);
    if (!validDuo(shooter, keeper) || tierUsed(s, 1, shooter, false) || tierUsed(s, 1, keeper, true)) return false;
    next.pendingShooter = shooter; next.pendingKeeper = keeper;
    next.phase = PICK_REVEAL; next.turn = 0;
  } else if (s.phase == PICK_REVEAL) {
    if (n != 41 || m[0] != 6) return false;
    const auto shooter = read32(m + 1), keeper = read32(m + 5);
    if (!validDuo(shooter, keeper) || tierUsed(s, 0, shooter, false) || tierUsed(s, 0, keeper, true)) return false;
    std::uint8_t payload[42] = {0x50, std::uint8_t(s.kick / 2)};
    write32(payload + 2, shooter); write32(payload + 6, keeper);
    std::memcpy(payload + 10, m + 9, 32);
    std::uint8_t digest[32];
    pulse_sha256(payload, sizeof(payload), digest);
    if (std::memcmp(digest, s.commitment.data(), 32) != 0) return false;
    next.pairShooters[0] = shooter; next.pairShooters[1] = s.pendingShooter;
    next.pairKeepers[0] = keeper; next.pairKeepers[1] = s.pendingKeeper;
    if (s.kick < 6) {
      next.usedShooters[0][s.kick / 2] = shooter;
      next.usedShooters[1][s.kick / 2] = s.pendingShooter;
      next.usedKeepers[0][s.kick / 2] = keeper;
      next.usedKeepers[1][s.kick / 2] = s.pendingKeeper;
    }
    next.pendingShooter = 0; next.pendingKeeper = 0; next.commitment.fill(0);
    next.phase = COMMIT; next.turn = 1;
  } else if (s.phase == COMMIT) {
    if (n != 33 || m[0] != 1) return false;
    std::memcpy(next.commitment.data(), m + 1, 32);
    if (allZero(next.commitment)) return false;
    next.phase = SHOOT; next.turn = s.kick % 2;
  } else if (s.phase == SHOOT) {
    if (n != 2 || m[0] != 2 || m[1] > 8) return false;
    next.pendingLane = m[1];
    next.phase = REVEAL; next.turn = 1 - s.kick % 2;
  } else {
    if (n != 35 || m[0] != 3 || m[1] > 8) return false;
    const int shooter = s.kick % 2;
    const auto keeper = s.pairKeepers[1 - shooter];
    const auto striker = s.pairShooters[shooter];
    if (!validReach(keeper, striker, m[1], m[2])) return false;
    std::uint8_t payload[36] = {0x47, s.kick, m[1], m[2]};
    std::memcpy(payload + 4, m + 3, 32);
    std::uint8_t digest[32];
    pulse_sha256(payload, sizeof(payload), digest);
    if (std::memcmp(digest, s.commitment.data(), 32) != 0) return false;
    next.lastPlayer = striker; next.lastKeeper = keeper; next.lastShot = s.pendingLane;
    next.lastGuard = m[1]; next.lastReach = m[2];
    next.lastResult = m[1] == s.pendingLane || m[2] == s.pendingLane ? SAVED :
      (isScoringTarget(striker, s.pendingLane) ? GOAL : MISSED);
    if (next.lastResult == GOAL) ++next.goals[shooter];
    next.commitment.fill(0); next.pendingLane = 255;
    ++next.kick;
    const int winner = scoreWinner(next.kick, next.goals);
    if (winner != -1) {
      next.phase = FINISHED; next.turn = 255; next.winner = winner;
      if (next.kick % 2 == 0) { next.pairShooters[0] = 0; next.pairShooters[1] = 0; next.pairKeepers[0] = 0; next.pairKeepers[1] = 0; }
    } else if (next.kick % 2) {
      next.phase = COMMIT; next.turn = 0;
    } else {
      next.phase = PICK_COMMIT; next.turn = 0;
      next.pairShooters[0] = 0; next.pairShooters[1] = 0;
      next.pairKeepers[0] = 0; next.pairKeepers[1] = 0;
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
