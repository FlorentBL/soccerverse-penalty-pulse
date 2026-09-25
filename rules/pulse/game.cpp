#include "game.hpp"
#include "sha.hpp"
#include <cstring>

namespace pulse {
namespace {
constexpr std::uint8_t playerBits[] = {
#include "player_bits.inc"
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
} // namespace

bool playerExists(std::uint32_t id) {
  return id && id / 8 < sizeof(playerBits) && (playerBits[id / 8] & (1u << (id % 8)));
}
std::uint8_t primaryLane(std::uint32_t id) { return std::uint8_t(id % 3); }
std::uint8_t secondaryLane(std::uint32_t id) {
  return std::uint8_t((primaryLane(id) + 1 + (id / 3) % 2) % 3);
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
  b[0] = 1; b[1] = s.participants; b[2] = s.phase; b[3] = s.turn;
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
  return b;
}

bool decode(const std::uint8_t* b, std::size_t n, std::uint8_t participants, State& s) {
  if (!b || n != STATE_SIZE || b[0] != 1 || b[1] != participants) return false;
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
  return true;
}

bool valid(const State& s) {
  if (s.participants < 1 || s.participants > 2 || s.phase > FINISHED ||
      s.kick > 6 || s.turnCount > 25 || s.goals[0] > 3 || s.goals[1] > 3 ||
      s.goals[0] > (s.kick + 1) / 2 || s.goals[1] > s.kick / 2 ||
      s.lastResult > MISSED) return false;
  if (s.participants == 1) {
    if (s.phase != PICK || s.turn != 255 || s.kick || s.turnCount ||
        s.winner != -1 || !allZero(s.commitment)) return false;
  } else if (s.phase == FINISHED) {
    if (s.turn != 255 || s.winner < -2 || s.winner > 1 || s.winner == -1) return false;
    if (s.kick == 6 && (s.turnCount != 24 ||
        s.winner != (s.goals[0] == s.goals[1] ? -2 : (s.goals[0] > s.goals[1] ? 0 : 1)))) return false;
    if (s.kick < 6 && (s.winner == -2 || s.turnCount < 4 * s.kick + 1 ||
        s.turnCount > 4 * s.kick + 4)) return false;
  } else {
    if (s.kick >= 6 || s.winner != -1 ||
        s.turn != ((s.phase == PICK || s.phase == SHOOT) ? s.kick % 2 : 1 - s.kick % 2) ||
        s.turnCount != 4 * s.kick + s.phase) return false;
  }
  for (int seat = 0; seat < 2; ++seat) {
    for (int shot = 0; shot < 3; ++shot) {
      const auto id = s.used[seat][shot];
      const bool completed = 2 * shot + seat < s.kick;
      if ((completed && !playerExists(id)) || (!completed && id)) return false;
      for (int earlier = 0; earlier < shot; ++earlier)
        if (id && id == s.used[seat][earlier]) return false;
    }
  }
  if (s.phase == PICK || s.participants == 1) {
    if (!allZero(s.commitment) || s.pendingPlayer || s.pendingLane != 255) return false;
  } else if (s.phase == COMMIT || s.phase == SHOOT || s.phase == REVEAL) {
    if ((s.phase == COMMIT ? !allZero(s.commitment) : allZero(s.commitment)) ||
        !playerExists(s.pendingPlayer) ||
        (s.phase == REVEAL ? s.pendingLane > 2 : s.pendingLane != 255)) return false;
    for (int i = 0; i < 3; ++i) if (s.used[s.kick % 2][i] == s.pendingPlayer) return false;
  }
  if (s.kick == 0 && (s.lastResult != NONE || s.lastPlayer || s.lastShot != 255 || s.lastGuard != 255)) return false;
  if (s.kick > 0 && (s.lastResult == NONE || !playerExists(s.lastPlayer) || s.lastShot > 2 || s.lastGuard > 2)) return false;
  return true;
}

int whoseTurn(const State& s) { return s.participants == 2 && s.phase != FINISHED ? s.turn : -1; }

bool apply(State& s, const std::uint8_t* m, std::size_t n) {
  if (!m || !valid(s) || s.participants != 2 || s.phase == FINISHED) return false;
  State next = s;
  if (s.phase == PICK) {
    if (n != 5 || m[0] != 4) return false;
    const auto id = read32(m + 1);
    if (!playerExists(id)) return false;
    for (int i = 0; i < 3; ++i) if (s.used[s.kick % 2][i] == id) return false;
    next.pendingPlayer = id;
    next.phase = COMMIT;
    next.turn = 1 - s.kick % 2;
  } else if (s.phase == COMMIT) {
    if (n != 33 || m[0] != 1) return false;
    std::memcpy(next.commitment.data(), m + 1, 32);
    if (allZero(next.commitment)) return false;
    next.phase = SHOOT;
    next.turn = s.kick % 2;
  } else if (s.phase == SHOOT) {
    if (n != 2 || m[0] != 2 || m[1] > 2) return false;
    next.pendingLane = m[1];
    next.phase = REVEAL;
    next.turn = 1 - s.kick % 2;
  } else {
    if (n != 34 || m[0] != 3 || m[1] > 2) return false;
    std::uint8_t payload[34] = {s.kick, m[1]};
    std::memcpy(payload + 2, m + 2, 32);
    std::uint8_t digest[32];
    pulse_sha256(payload, sizeof(payload), digest);
    if (std::memcmp(digest, s.commitment.data(), 32) != 0) return false;
    const int seat = s.kick % 2;
    next.lastPlayer = s.pendingPlayer; next.lastShot = s.pendingLane;
    next.lastGuard = m[1];
    next.lastResult = m[1] == s.pendingLane ? SAVED :
      (s.pendingLane == primaryLane(s.pendingPlayer) ||
       s.pendingLane == secondaryLane(s.pendingPlayer) ? GOAL : MISSED);
    if (next.lastResult == GOAL) ++next.goals[seat];
    next.used[seat][s.kick / 2] = s.pendingPlayer;
    next.commitment.fill(0);
    next.pendingPlayer = 0; next.pendingLane = 255;
    ++next.kick;
    if (next.kick == 6) {
      next.phase = FINISHED; next.turn = 255;
      next.winner = next.goals[0] == next.goals[1] ? -2 :
        (next.goals[0] > next.goals[1] ? 0 : 1);
    } else {
      next.phase = PICK;
      next.turn = next.kick % 2;
    }
  }
  ++next.turnCount;
  if (!valid(next)) return false;
  s = next;
  return true;
}

bool timeout(State& s, std::uint8_t seat) {
  if (!valid(s) || s.participants != 2 || s.phase == FINISHED || seat != s.turn) return false;
  s.phase = FINISHED;
  s.turn = 255;
  s.winner = 1 - seat;
  ++s.turnCount;
  return valid(s);
}
} // namespace pulse
