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
std::array<std::uint8_t, 5> pick(std::uint32_t id) {
  return {4, std::uint8_t(id), std::uint8_t(id >> 8), std::uint8_t(id >> 16), std::uint8_t(id >> 24)};
}
std::array<std::uint8_t, 33> pickCommit(std::uint8_t round, std::uint32_t id, const Salt& secret) {
  std::uint8_t pre[38] = {0x50, round, std::uint8_t(id), std::uint8_t(id >> 8),
                          std::uint8_t(id >> 16), std::uint8_t(id >> 24)};
  std::memcpy(pre + 6, secret.data(), 32);
  std::array<std::uint8_t, 33> out{}; out[0] = 5;
  pulse_sha256(pre, sizeof(pre), out.data() + 1);
  return out;
}
std::array<std::uint8_t, 37> pickReveal(std::uint32_t id, const Salt& secret) {
  std::array<std::uint8_t, 37> out{};
  const auto p = pick(id);
  out[0] = 6; std::memcpy(out.data() + 1, p.data() + 1, 4);
  std::memcpy(out.data() + 5, secret.data(), 32);
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
void pair(State& s, std::uint32_t first, std::uint32_t second, std::uint8_t seed) {
  assert(s.phase == PICK_COMMIT && s.kick % 2 == 0);
  const auto secret = salt(seed);
  assert(move(s, pickCommit(s.kick / 2, first, secret)));
  assert(s.phase == PICK && !move(s, shot(0)));
  assert(move(s, pick(second)));
  assert(s.phase == PICK_REVEAL);
  assert(!move(s, pickReveal(second, secret)) || first == second);
  assert(move(s, pickReveal(first, secret)));
  assert(s.phase == COMMIT && s.pairPlayers[0] == first && s.pairPlayers[1] == second);
}
std::uint8_t firstTarget(std::uint32_t id) {
  for (std::uint8_t i = 0; i < 9; ++i) if (isScoringTarget(id, i)) return i;
  std::abort();
}
void kick(State& s, bool goal, std::uint8_t seed) {
  const auto k = s.kick;
  const auto striker = s.pairPlayers[k % 2];
  const auto keeper = s.pairPlayers[1 - k % 2];
  const auto target = firstTarget(striker);
  const auto primary = std::uint8_t(goal ? (target + 1) % 9 : target);
  std::uint8_t reach = 255;
  if (canReach(keeper, striker)) {
    for (std::uint8_t i = 0; i < 9; ++i)
      if (adjacent(primary, i) && (!goal || i != target)) { reach = i; break; }
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
  assert(playerExists(1100) && playerExists(19465) && !playerExists(0));
  assert(shootingRating(1100) == 96 && goalkeeperRating(1100) == 50);
  assert(shootingRating(19465) == 70 && goalkeeperRating(19465) == 95);
  assert(scoringTargetCount(1100) == 8 && scoringTargetCount(19465) == 4);
  assert(canReach(19465, 1100) && !canReach(1100, 19465));
  assert(scoringTargetCount(1) == 2 && !canReach(19465, 1));
  assert(adjacent(0, 4) && !adjacent(0, 8) && !adjacent(0, 0));
  pair(s, 1100, 19465, 1);
  kick(s, true, 2);
  kick(s, false, 3);
  assert(s.goals[0] == 1 && s.goals[1] == 0);
  assert(s.phase == PICK_COMMIT && s.turnCount == 9);
  assert(!move(s, pick(1100)));
  const std::uint32_t players[6] = {1100, 278, 154, 874, 129718, 1};
  State early; assert(initial(2, nullptr, 0, early));
  for (int k = 0; k < 4; ++k) {
    if (k % 2 == 0) pair(early, players[k], players[k + 1], std::uint8_t(k + 11));
    kick(early, k % 2 == 0, std::uint8_t(k + 15));
  }
  assert(early.phase == FINISHED && early.winner == 0 && early.turnCount == 18);
  State sudden; assert(initial(2, nullptr, 0, sudden));
  for (int k = 0; k < 8; ++k) {
    if (k % 2 == 0) pair(sudden, k < 6 ? players[k] : 1100,
                        k < 6 ? players[k + 1] : 278, std::uint8_t(k + 21));
    kick(sudden, k == 6, std::uint8_t(k + 30));
  }
  assert(sudden.phase == FINISHED && sudden.kick == 8 && sudden.winner == 0);
  State cap; assert(initial(2, nullptr, 0, cap));
  for (int k = 0; k < 254; ++k) {
    if (k % 2 == 0) pair(cap, k < 6 ? players[k] : 1100,
                        k < 6 ? players[k + 1] : 278, std::uint8_t(k));
    kick(cap, false, std::uint8_t(k));
  }
  assert(cap.phase == FINISHED && cap.kick == 254 && cap.winner == 0);
  State repeat; assert(initial(2, nullptr, 0, repeat));
  pair(repeat, 1100, 278, 4); kick(repeat, false, 5); kick(repeat, false, 6);
  const auto c = pickCommit(1, 1100, salt(7));
  assert(move(repeat, c)); assert(move(repeat, pick(154)));
  assert(!move(repeat, pickReveal(1100, salt(7))));
  State miss; assert(initial(2, nullptr, 0, miss));
  pair(miss, 3, 278, 9);
  std::uint8_t wide = 0; while (isScoringTarget(3, wide)) ++wide;
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
