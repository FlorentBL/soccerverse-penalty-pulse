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
  Salt out{};
  for (int i = 0; i < 32; ++i) out[i] = seed + i;
  return out;
}
void put32(std::uint8_t* p, std::uint32_t id) {
  for (int i = 0; i < 4; ++i) p[i] = std::uint8_t(id >> (8 * i));
}
std::array<std::uint8_t, 9> pick(std::uint32_t shooter, std::uint32_t keeper) {
  std::array<std::uint8_t, 9> out{};
  out[0] = 4; put32(out.data() + 1, shooter); put32(out.data() + 5, keeper);
  return out;
}
std::array<std::uint8_t, 33> pickCommit(std::uint8_t round, std::uint32_t shooter,
                                         std::uint32_t keeper, const Salt& secret) {
  std::uint8_t pre[42] = {0x50, round};
  put32(pre + 2, shooter); put32(pre + 6, keeper);
  std::memcpy(pre + 10, secret.data(), 32);
  std::array<std::uint8_t, 33> out{}; out[0] = 5;
  pulse_sha256(pre, sizeof(pre), out.data() + 1);
  return out;
}
std::array<std::uint8_t, 41> pickReveal(std::uint32_t shooter, std::uint32_t keeper,
                                         const Salt& secret) {
  std::array<std::uint8_t, 41> out{}; out[0] = 6;
  put32(out.data() + 1, shooter); put32(out.data() + 5, keeper);
  std::memcpy(out.data() + 9, secret.data(), 32);
  return out;
}
std::array<std::uint8_t, 33> guardCommit(std::uint8_t kick, std::uint8_t lane,
                                          std::uint8_t reach, const Salt& secret) {
  std::uint8_t pre[36] = {0x47, kick, lane, reach};
  std::memcpy(pre + 4, secret.data(), 32);
  std::array<std::uint8_t, 33> out{}; out[0] = 1;
  pulse_sha256(pre, sizeof(pre), out.data() + 1);
  return out;
}
std::array<std::uint8_t, 35> guardReveal(std::uint8_t lane, std::uint8_t reach, const Salt& secret) {
  std::array<std::uint8_t, 35> out{}; out[0] = 3; out[1] = lane; out[2] = reach;
  std::memcpy(out.data() + 3, secret.data(), 32);
  return out;
}
std::array<std::uint8_t, 2> shot(std::uint8_t lane) { return {2, lane}; }
template<std::size_t N> bool move(State& s, const std::array<std::uint8_t, N>& m) {
  return apply(s, m.data(), m.size());
}
void pair(State& s, std::uint32_t shooter0, std::uint32_t keeper0,
          std::uint32_t shooter1, std::uint32_t keeper1, std::uint8_t seed) {
  assert(s.phase == PICK_COMMIT && s.kick % 2 == 0);
  const auto secret = salt(seed);
  assert(move(s, pickCommit(s.kick / 2, shooter0, keeper0, secret)));
  assert(s.phase == PICK && !move(s, shot(0)));
  assert(move(s, pick(shooter1, keeper1)));
  assert(s.phase == PICK_REVEAL);
  assert(!move(s, pickReveal(shooter1, keeper0, secret)));
  assert(move(s, pickReveal(shooter0, keeper0, secret)));
  assert(s.phase == COMMIT && s.pairShooters[0] == shooter0 && s.pairShooters[1] == shooter1 &&
         s.pairKeepers[0] == keeper0 && s.pairKeepers[1] == keeper1);
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
  assert(s.phase == SHOOT);
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
  assert(playerExists(184) && playerExists(19465) && !playerExists(0));
  assert(shootingRating(184) == 97 && goalkeeperRating(184) == 50);
  assert(shootingRating(159) == 58 && goalkeeperRating(19465) == 95);
  assert(scoringTargetCount(184) == 8 && scoringTargetCount(159) == 3);
  assert(ratingTier(shootingRating(184)) == 0 && ratingTier(shootingRating(1460)) == 1 &&
         ratingTier(shootingRating(159)) == 2);
  assert(canReach(19465, 184) && !canReach(19465, 159));
  assert(validReach(19465, 184, 0, 8) && !validReach(1438, 184, 0, 8));
  assert(validReach(1438, 184, 0, 4) && validReach(62, 184, 0, 255) &&
         !validReach(62, 184, 0, 4));
  assert(adjacent(0, 4) && !adjacent(0, 8) && !adjacent(0, 0));
  pair(s, 184, 19465, 1100, 22221, 1);
  kick(s, true, 2);
  kick(s, false, 3);
  assert(s.goals[0] == 1 && s.goals[1] == 0);
  assert(s.phase == PICK_COMMIT && s.turnCount == 9);
  State early; assert(initial(2, nullptr, 0, early));
  pair(early, 184, 19465, 1100, 22221, 11);
  kick(early, true, 15); kick(early, false, 16);
  pair(early, 1460, 1438, 129718, 2932, 12);
  kick(early, true, 17); kick(early, false, 18);
  assert(early.phase == FINISHED && early.winner == 0 && early.turnCount == 18);
  State sudden; assert(initial(2, nullptr, 0, sudden));
  for (int k = 0; k < 8; ++k) {
    if (k % 2 == 0) {
      const std::uint32_t shooters0[3] = {184, 1460, 159};
      const std::uint32_t keepers0[3] = {19465, 1438, 62};
      const std::uint32_t shooters1[3] = {1100, 129718, 21};
      const std::uint32_t keepers1[3] = {22221, 2932, 189};
      const int round = k / 2 < 3 ? k / 2 : 0;
      pair(sudden, shooters0[round], keepers0[round], shooters1[round], keepers1[round], std::uint8_t(k + 21));
    }
    kick(sudden, k == 6, std::uint8_t(k + 30));
  }
  assert(sudden.phase == FINISHED && sudden.kick == 8 && sudden.winner == 0);
  State cap; assert(initial(2, nullptr, 0, cap));
  for (int k = 0; k < 254; ++k) {
    if (k % 2 == 0) {
      const std::uint32_t shooters0[3] = {184, 1460, 159};
      const std::uint32_t keepers0[3] = {19465, 1438, 62};
      const std::uint32_t shooters1[3] = {1100, 129718, 21};
      const std::uint32_t keepers1[3] = {22221, 2932, 189};
      const int round = k / 2 < 3 ? k / 2 : 0;
      pair(cap, shooters0[round], keepers0[round], shooters1[round], keepers1[round], std::uint8_t(k));
    }
    kick(cap, false, std::uint8_t(k));
  }
  assert(cap.phase == FINISHED && cap.kick == 254 && cap.winner == 0);
  State repeat; assert(initial(2, nullptr, 0, repeat));
  pair(repeat, 184, 19465, 1100, 22221, 4);
  kick(repeat, false, 5); kick(repeat, false, 6);
  assert(move(repeat, pickCommit(1, 909, 1438, salt(7))));
  assert(move(repeat, pick(1460, 2932)));
  assert(!move(repeat, pickReveal(909, 1438, salt(7))));
  State invalid; assert(initial(2, nullptr, 0, invalid));
  assert(move(invalid, pickCommit(0, 184, 19465, salt(8))));
  assert(!move(invalid, pick(19465, 19465)));
  assert(!move(invalid, pick(1, 1438)));
  State miss; assert(initial(2, nullptr, 0, miss));
  pair(miss, 159, 62, 184, 1438, 9);
  std::uint8_t wide = 0; while (isScoringTarget(159, wide)) ++wide;
  const auto secret = salt(42);
  const auto g = std::uint8_t((wide + 1) % 9);
  assert(move(miss, guardCommit(0, g, 255, secret)));
  assert(move(miss, shot(wide)));
  assert(move(miss, guardReveal(g, 255, secret)) && miss.lastResult == MISSED);
  State t; assert(initial(2, nullptr, 0, t));
  assert(timeout(t, 0) && t.winner == 1 && t.phase == FINISHED && valid(t));
  assert(!timeout(t, 0));
  std::cout << "native core: pass\n";
}
