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
bool usedEarlier(const State& s, int seat, std::uint32_t id) {
  if (s.kick >= 6) return false;
  for (auto used : s.used[seat]) if (used == id) return true;
  return false;
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
  // Arcade's keeper focus balances two covered zones against a striker's shot.
  return goalkeeperRating(id) >= 75 && count > 4 ? 4 : count;
}
bool isScoringTarget(std::uint32_t id, std::uint8_t target) {
  if (goalkeeperRating(id) >= 75 && scoringTargetCount(id) == 4) {
    constexpr std::uint8_t focus[4] = {0, 1, 7, 8};
    for (auto lane : focus) {
      for (std::uint32_t turn = 0; turn < id % 4; ++turn)
        lane = std::uint8_t(3 * (lane % 3) + 2 - lane / 3);
      if (lane == target) return true;
    }
    return false;
  }
  constexpr std::uint8_t steps[6] = {1, 2, 4, 5, 7, 8};
  const auto start = id % 9;
  const auto step = steps[(id / 9) % 6];
  for (std::uint8_t i = 0; i < scoringTargetCount(id); ++i)
    if ((start + i * step) % 9 == target) return true;
  return false;
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

bool initial(std::uint8_t participants, const std::uint8_t*, std::size_t cfgLength, State& out) {
  if (participants < 1 || participants > 2 || cfgLength) return false;
  out = State{};
  out.participants = participants;
  out.turn = participants == 2 ? 0 : 255;
  return true;
}

std::array<std::uint8_t, STATE_SIZE> encode(const State& s) {
  std::array<std::uint8_t, STATE_SIZE> b{};
  b[0] = 2; b[1] = s.participants; b[2] = s.phase; b[3] = s.turn;
  b[4] = s.kick; b[5] = s.goals[0]; b[6] = s.goals[1];
  b[7] = static_cast<std::uint8_t>(s.winner);
  b[8] = std::uint8_t(s.turnCount); b[9] = std::uint8_t(s.turnCount >> 8);
  std::memcpy(b.data() + 10, s.commitment.data(), 32);
  write32(b.data() + 42, s.pendingPlayer); b[46] = s.pendingLane;
  b[47] = s.lastResult;
  for (int seat = 0; seat < 2; ++seat)
    for (int shot = 0; shot < 3; ++shot)
      write32(b.data() + 48 + 4 * (seat * 3 + shot), s.used[seat][shot]);
  write32(b.data() + 72, s.lastPlayer);
  b[76] = s.lastShot; b[77] = s.lastGuard;
  write32(b.data() + 78, s.pairPlayers[0]);
  write32(b.data() + 82, s.pairPlayers[1]);
  b[86] = s.lastReach;
  return b;
}

bool decode(const std::uint8_t* b, std::size_t n, std::uint8_t participants, State& s) {
  if (!b || n != STATE_SIZE || b[0] != 2 || b[1] != participants) return false;
  s.participants = b[1]; s.phase = static_cast<Phase>(b[2]); s.turn = b[3];
  s.kick = b[4]; s.goals[0] = b[5]; s.goals[1] = b[6];
  s.winner = static_cast<std::int8_t>(b[7]);
  s.turnCount = std::uint16_t(b[8]) | (std::uint16_t(b[9]) << 8);
  std::memcpy(s.commitment.data(), b + 10, 32);
  s.pendingPlayer = read32(b + 42); s.pendingLane = b[46];
  s.lastResult = static_cast<Result>(b[47]);
  for (int seat = 0; seat < 2; ++seat)
    for (int shot = 0; shot < 3; ++shot)
      s.used[seat][shot] = read32(b + 48 + 4 * (seat * 3 + shot));
  s.lastPlayer = read32(b + 72); s.lastShot = b[76]; s.lastGuard = b[77];
  s.pairPlayers[0] = read32(b + 78); s.pairPlayers[1] = read32(b + 82);
  s.lastReach = b[86];
  return true;
}

bool valid(const State& s) {
  if (s.participants < 1 || s.participants > 2 || s.phase > FINISHED ||
      s.kick > 254 || s.turnCount > 1143 ||
      s.goals[0] > (s.kick + 1) / 2 || s.goals[1] > s.kick / 2 ||
      s.lastResult > MISSED) return false;
  if (s.participants == 1) {
    return s.phase == PICK_COMMIT && s.turn == 255 && !s.kick && !s.turnCount &&
      s.winner == -1 && allZero(s.commitment) && !s.pendingPlayer &&
      !s.pairPlayers[0] && !s.pairPlayers[1];
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
      const auto id = s.used[seat][shot];
      const bool assigned = shot < s.kick / 2 || (selected && shot == s.kick / 2);
      if ((assigned && !playerExists(id)) || (!assigned && id)) return false;
      for (int earlier = 0; earlier < shot; ++earlier)
        if (id && id == s.used[seat][earlier]) return false;
    }
  }
  if (selected) {
    for (int seat = 0; seat < 2; ++seat)
      if (!playerExists(s.pairPlayers[seat]) ||
          (s.kick < 6 && s.pairPlayers[seat] != s.used[seat][s.kick / 2])) return false;
  } else if (s.pairPlayers[0] || s.pairPlayers[1]) return false;
  if (active == PICK_COMMIT || active == COMMIT || active == FINISHED) {
    if (!allZero(s.commitment) || s.pendingPlayer || s.pendingLane != 255) return false;
  } else if (active == PICK || active == PICK_REVEAL) {
    if (allZero(s.commitment) || s.pendingLane != 255 ||
        (active == PICK ? s.pendingPlayer != 0 :
         !playerExists(s.pendingPlayer) || usedEarlier(s, 1, s.pendingPlayer))) return false;
  } else {
    if ((active == SHOOT || active == REVEAL ? allZero(s.commitment) : !allZero(s.commitment)) ||
        s.pendingPlayer || (active == REVEAL ? s.pendingLane > 8 : s.pendingLane != 255)) return false;
  }
  if (s.kick == 0) {
    if (s.lastResult != NONE || s.lastPlayer || s.lastShot != 255 ||
        s.lastGuard != 255 || s.lastReach != 255) return false;
  } else if (s.lastResult == NONE || !playerExists(s.lastPlayer) ||
             s.lastShot > 8 || s.lastGuard > 8 || (s.lastReach != 255 && s.lastReach > 8)) return false;
  if (s.kick > 0) {
    if (s.lastReach != 255 && !adjacent(s.lastGuard, s.lastReach)) return false;
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
    if (n != 5 || m[0] != 4) return false;
    const auto id = read32(m + 1);
    if (!playerExists(id) || usedEarlier(s, 1, id)) return false;
    next.pendingPlayer = id;
    next.phase = PICK_REVEAL; next.turn = 0;
  } else if (s.phase == PICK_REVEAL) {
    if (n != 37 || m[0] != 6) return false;
    const auto id = read32(m + 1);
    if (!playerExists(id) || usedEarlier(s, 0, id)) return false;
    std::uint8_t payload[38] = {0x50, std::uint8_t(s.kick / 2)};
    write32(payload + 2, id);
    std::memcpy(payload + 6, m + 5, 32);
    std::uint8_t digest[32];
    pulse_sha256(payload, sizeof(payload), digest);
    if (std::memcmp(digest, s.commitment.data(), 32) != 0) return false;
    next.pairPlayers[0] = id; next.pairPlayers[1] = s.pendingPlayer;
    if (s.kick < 6) {
      next.used[0][s.kick / 2] = id;
      next.used[1][s.kick / 2] = s.pendingPlayer;
    }
    next.pendingPlayer = 0; next.commitment.fill(0);
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
    const auto keeper = s.pairPlayers[1 - shooter];
    const auto striker = s.pairPlayers[shooter];
    const bool reach = canReach(keeper, striker);
    if (reach ? !adjacent(m[1], m[2]) : m[2] != 255) return false;
    std::uint8_t payload[36] = {0x47, s.kick, m[1], m[2]};
    std::memcpy(payload + 4, m + 3, 32);
    std::uint8_t digest[32];
    pulse_sha256(payload, sizeof(payload), digest);
    if (std::memcmp(digest, s.commitment.data(), 32) != 0) return false;
    next.lastPlayer = striker; next.lastShot = s.pendingLane;
    next.lastGuard = m[1]; next.lastReach = m[2];
    next.lastResult = m[1] == s.pendingLane || m[2] == s.pendingLane ? SAVED :
      (isScoringTarget(striker, s.pendingLane) ? GOAL : MISSED);
    if (next.lastResult == GOAL) ++next.goals[shooter];
    next.commitment.fill(0); next.pendingLane = 255;
    ++next.kick;
    const int winner = scoreWinner(next.kick, next.goals);
    if (winner != -1) {
      next.phase = FINISHED; next.turn = 255; next.winner = winner;
      if (next.kick % 2 == 0) { next.pairPlayers[0] = 0; next.pairPlayers[1] = 0; }
    } else if (next.kick % 2) {
      next.phase = COMMIT; next.turn = 0;
    } else {
      next.phase = PICK_COMMIT; next.turn = 0;
      next.pairPlayers[0] = 0; next.pairPlayers[1] = 0;
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
