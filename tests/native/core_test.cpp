#include "pulse/game.hpp"
#include "pulse/sha.hpp"
#include <array>
#include <cassert>
#include <cstdint>
#include <cstring>
#include <iostream>
using namespace pulse;
using Salt = std::array<std::uint8_t, 32>;
Salt salt(std::uint8_t seed) {
  Salt out{}; for (int i = 0; i < 32; ++i) out[i] = seed + i; return out;
}
void put32(std::uint8_t* p, std::uint32_t id) {
  for (int i = 0; i < 4; ++i) p[i] = std::uint8_t(id >> (8 * i));
}
std::array<std::uint8_t, 5> player(std::uint8_t opcode, std::uint32_t id) {
  std::array<std::uint8_t, 5> out{}; out[0] = opcode; put32(out.data() + 1, id); return out;
}
std::array<std::uint8_t, 33> guardCommit(std::uint8_t kick, std::uint8_t lane,
                                          std::uint8_t reach, const Salt& secret) {
  std::uint8_t pre[36] = {0x47, kick, lane, reach};
  std::memcpy(pre + 4, secret.data(), 32);
  std::array<std::uint8_t, 33> out{}; out[0] = 1;
  pulse_sha256(pre, sizeof(pre), out.data() + 1); return out;
}
std::array<std::uint8_t, 35> guardReveal(std::uint8_t lane, std::uint8_t reach, const Salt& secret) {
  std::array<std::uint8_t, 35> out{}; out[0] = 3; out[1] = lane; out[2] = reach;
  std::memcpy(out.data() + 3, secret.data(), 32); return out;
}
std::array<std::uint8_t, 2> shot(std::uint8_t lane) { return {2, lane}; }
template<std::size_t N> bool move(State& s, const std::array<std::uint8_t, N>& m) {
  return apply(s, m.data(), m.size());
}
void select(State& s, std::uint32_t shooter, std::uint32_t keeper) {
  assert(s.phase == CHOOSE_SHOOTER && s.turn == s.kick % 2);
  assert(move(s, player(4, shooter)));
  assert(s.phase == CHOOSE_KEEPER && s.turn == 1 - s.kick % 2);
  assert(!move(s, shot(0)));
  assert(move(s, player(5, keeper)));
  assert(s.phase == COMMIT && s.pairShooters[s.kick % 2] == shooter &&
         s.pairKeepers[1 - s.kick % 2] == keeper);
}
std::uint8_t firstTarget(std::uint32_t id) {
  for (std::uint8_t i = 0; i < 9; ++i) if (isScoringTarget(id, i)) return i;
  std::abort();
}
void kick(State& s, bool goal, std::uint8_t seed) {
  const auto k = s.kick;
  const auto striker = s.pairShooters[k % 2];
  const auto keeper = s.pairKeepers[1 - k % 2];
  const auto target = firstTarget(striker);
  const auto primary = std::uint8_t(goal ? (target + 1) % 9 : target);
  std::uint8_t reach = 255;
  if (canReach(keeper, striker)) {
    for (std::uint8_t i = 0; i < 9; ++i)
      if (validReach(keeper, striker, primary, i) && (!goal || i != target)) {
        reach = i; break;
      }
    assert(reach <= 8);
  }
  const auto secret = salt(seed);
  assert(move(s, guardCommit(k, primary, reach, secret)));
  assert(s.phase == SHOOT && !move(s, guardReveal(primary, reach, secret)));
  assert(move(s, shot(target)));
  assert(s.phase == REVEAL);
  assert(!move(s, guardReveal(std::uint8_t((primary + 1) % 9), reach, secret)));
  assert(move(s, guardReveal(primary, reach, secret)));
  assert(s.kick == k + 1 && s.lastResult == (goal ? GOAL : SAVED) && valid(s));
  const auto bytes = encode(s); State restored;
  assert(decode(bytes.data(), bytes.size(), 2, restored) && valid(restored));
  assert(encode(restored) == bytes);
}
int main() {
  State s;
  assert(initial(2, nullptr, 0, s) && valid(s));
  assert(!initial(2, nullptr, 1, s));
  assert(initial(1, nullptr, 0, s) && valid(s) && whoseTurn(s) == -1);
  assert(initial(2, nullptr, 0, s));
  assert(encode(s)[0] == 5 && s.phase == CHOOSE_SHOOTER);
  assert(playerExists(184) && playerExists(19465) && !playerExists(0));
  assert(isCentreForward(184) && isCentreForward(874) && isCentreForward(1917));
  assert(!isCentreForward(159) && !isCentreForward(1460));
  assert(isGoalkeeper(19465) && isGoalkeeper(62) && !isGoalkeeper(184));
  assert(shootingRating(184) == 97 && goalkeeperRating(19465) == 95);
  assert(scoringTargetCount(184) == 8 && scoringTargetCount(1917) == 3);
  assert(canReach(19465, 184) && !canReach(19465, 1917));
  assert(!validReach(19465, 184, 6, 8) && validReach(19465, 184, 0, 4));
  assert(!validReach(1438, 184, 0, 4) && validReach(1438, 184, 0, 1));
  select(s, 184, 1438); kick(s, true, 2);
  select(s, 874, 19465); kick(s, false, 3);
  assert(s.goals[0] == 1 && s.goals[1] == 0);
  assert(s.phase == CHOOSE_SHOOTER && s.turnCount == 10);
  State early; assert(initial(2, nullptr, 0, early));
  select(early, 184, 1438); kick(early, true, 15);
  select(early, 874, 19465); kick(early, false, 16);
  select(early, 874, 62); kick(early, true, 17);
  select(early, 1917, 1438); kick(early, false, 18);
  assert(early.phase == FINISHED && early.winner == 0 && early.turnCount == 20);
  State sudden; assert(initial(2, nullptr, 0, sudden));
  State cap; assert(initial(2, nullptr, 0, cap));
  const std::uint32_t shooters[2][3] = {{184, 874, 1917}, {874, 1917, 184}};
  const std::uint32_t keepers[2][3] = {{19465, 1438, 62}, {1438, 62, 19465}};
  for (int k = 0; k < 254; ++k) {
    const int seat = k % 2, round = k / 2 < 3 ? k / 2 : 0;
    select(cap, shooters[seat][round], keepers[1 - seat][round]);
    kick(cap, false, std::uint8_t(k));
    if (k < 8) {
      select(sudden, shooters[seat][round], keepers[1 - seat][round]);
      kick(sudden, k == 6, std::uint8_t(k + 21));
    }
  }
  assert(sudden.phase == FINISHED && sudden.kick == 8 && sudden.winner == 0);
  assert(cap.phase == FINISHED && cap.kick == 254 && cap.winner == 0);
  State repeat; assert(initial(2, nullptr, 0, repeat));
  select(repeat, 184, 1438); kick(repeat, false, 5);
  select(repeat, 874, 19465); kick(repeat, false, 6);
  assert(!move(repeat, player(4, 184)));
  assert(move(repeat, player(4, 874)));
  assert(!move(repeat, player(5, 1438)));
  assert(move(repeat, player(5, 62)));
  State invalid; assert(initial(2, nullptr, 0, invalid));
  for (auto id : {159u, 1460u, 1100u, 1u, 19465u}) assert(!move(invalid, player(4, id)));
  assert(move(invalid, player(4, 184)));
  for (auto id : {184u, 22221u, 159u}) assert(!move(invalid, player(5, id)));
  assert(move(invalid, player(5, 19465)));
  assert(!move(invalid, shot(0)));
  State onlyGreen; assert(initial(2, nullptr, 0, onlyGreen));
  select(onlyGreen, 1917, 62);
  std::uint8_t wide = 0; while (isScoringTarget(1917, wide)) ++wide;
  const auto secret = salt(42);
  const auto g = std::uint8_t((wide + 1) % 9);
  assert(move(onlyGreen, guardCommit(0, g, 255, secret)));
  assert(!move(onlyGreen, shot(wide)) && onlyGreen.phase == SHOOT);
  const auto target = firstTarget(1917);
  assert(move(onlyGreen, shot(target)));
  State forged = onlyGreen;
  forged.pendingLane = wide;
  assert(!valid(forged));
  assert(move(onlyGreen, guardReveal(g, 255, secret)) && onlyGreen.lastResult == GOAL);
  forged = onlyGreen;
  forged.lastShot = wide;
  assert(!valid(forged));
  State t; assert(initial(2, nullptr, 0, t));
  assert(timeout(t, 0) && t.winner == 1 && t.phase == FINISHED && valid(t));
  assert(!timeout(t, 0));
  std::cout << "native core: pass\n";
}
