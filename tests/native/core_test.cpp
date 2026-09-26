#include "pulse/game.hpp"
#include "pulse/sha.hpp"
#include <array>
#include <cassert>
#include <cstdint>
#include <cstring>
#include <iostream>

using namespace pulse;
std::array<std::uint8_t, 32> salt(std::uint8_t seed) {
  std::array<std::uint8_t, 32> out{};
  for (int i = 0; i < 32; ++i) out[i] = seed + i;
  return out;
}
std::array<std::uint8_t, 33> commit(std::uint8_t kick, std::uint8_t lane, const std::array<std::uint8_t, 32>& secret) {
  std::uint8_t preimage[34] = {kick, lane};
  std::memcpy(preimage + 2, secret.data(), 32);
  std::array<std::uint8_t, 33> out{};
  out[0] = 1;
  pulse_sha256(preimage, 34, out.data() + 1);
  return out;
}
std::array<std::uint8_t, 5> pick(std::uint32_t id) {
  return {4, std::uint8_t(id), std::uint8_t(id >> 8),
          std::uint8_t(id >> 16), std::uint8_t(id >> 24)};
}
std::array<std::uint8_t, 2> shot(std::uint8_t lane) { return {2, lane}; }
std::uint8_t firstTarget(std::uint32_t id) {
  for (std::uint8_t target = 0; target < 9; ++target) if (isScoringTarget(id, target)) return target;
  std::abort();
}
std::array<std::uint8_t, 34> reveal(std::uint8_t lane, const std::array<std::uint8_t, 32>& secret) {
  std::array<std::uint8_t, 34> out{};
  out[0] = 3; out[1] = lane;
  std::memcpy(out.data() + 2, secret.data(), 32);
  return out;
}
void play(State& s, std::uint32_t id, bool goal, std::uint8_t seed) {
  const auto k = s.kick;
  const auto lane = firstTarget(id);
  const auto guard = std::uint8_t(goal ? (lane + 1) % 9 : lane);
  const auto secret = salt(seed);
  const auto p = pick(id); const auto c = commit(k, guard, secret);
  const auto m = shot(lane); const auto r = reveal(guard, secret);
  assert(apply(s, p.data(), p.size()));
  assert(apply(s, c.data(), c.size()));
  assert(apply(s, m.data(), m.size()));
  assert(apply(s, r.data(), r.size()));
  assert(s.kick == k + 1 && s.turnCount == 4 * s.kick && valid(s));
  const auto encoded = encode(s);
  State restored;
  assert(decode(encoded.data(), encoded.size(), 2, restored));
  assert(valid(restored) && encode(restored) == encoded);
}
int main() {
  State s;
  assert(initial(2, nullptr, 0, s) && valid(s));
  assert(!initial(2, nullptr, 1, s));
  assert(initial(1, nullptr, 0, s) && valid(s) && whoseTurn(s) == -1);
  assert(!apply(s, shot(2).data(), 2));
  assert(initial(2, nullptr, 0, s));
  assert(playerExists(1100) && playerExists(278) && !playerExists(0) && !playerExists(9999999));
  for (const auto id : {1u, 2u, 3u, 1100u}) {
    int count = 0;
    for (std::uint8_t target = 0; target < 9; ++target) count += isScoringTarget(id, target);
    assert(count == scoringTargetCount(id));
  }
  assert(shootingRating(1100) == 96 && shootingRating(278) == 95);
  assert(shootingRating(1) == 51 && scoringTargetCount(1) == 2);
  assert(scoringTargetCount(1100) == 8 && scoringTargetCount(278) == 8);
  assert(shootingRating(154) == 88 && scoringTargetCount(154) == 7);
  const std::uint32_t players[6] = {1100, 278, 154, 874, 129718, 1};
  assert(!apply(s, pick(0).data(), 5));
  for (int kick = 0; kick < 4; ++kick) play(s, players[kick], kick % 2 == 0, std::uint8_t(kick + 7));
  assert(s.phase == FINISHED && s.winner == 0 && s.goals[0] == 2 && s.goals[1] == 0);
  assert(whoseTurn(s) == -1 && !apply(s, shot(0).data(), 2));
  State sudden;
  assert(initial(2, nullptr, 0, sudden));
  for (int k = 0; k < 6; ++k) play(sudden, players[k], false, std::uint8_t(k + 21));
  assert(sudden.phase == PICK && sudden.kick == 6 && sudden.goals[0] == 0 && sudden.goals[1] == 0);
  play(sudden, 1100, true, 40); // First striker can be reused in sudden death.
  assert(sudden.phase == PICK && sudden.kick == 7 && sudden.winner == -1);
  play(sudden, 278, false, 41);
  assert(sudden.phase == FINISHED && sudden.kick == 8 && sudden.winner == 0);
  State cap;
  assert(initial(2, nullptr, 0, cap));
  for (int k = 0; k < 254; ++k)
    play(cap, k < 6 ? players[k] : (k % 2 ? 278u : 1100u), false, std::uint8_t(k));
  assert(cap.phase == FINISHED && cap.kick == 254 && cap.winner == 0);
  State regulation;
  assert(initial(2, nullptr, 0, regulation));
  play(regulation, 1100, false, 50);
  play(regulation, 278, false, 51);
  assert(!apply(regulation, pick(1100).data(), 5));
  assert(!apply(regulation, shot(9).data(), 2));
  State miss;
  assert(initial(2, nullptr, 0, miss));
  const auto p = pick(3);
  assert(apply(miss, p.data(), p.size()));
  std::uint8_t unsafe = 0;
  while (isScoringTarget(3, unsafe)) ++unsafe;
  const auto secret = salt(42);
  const auto c = commit(0, std::uint8_t((unsafe + 1) % 9), secret);
  assert(apply(miss, c.data(), c.size()));
  const auto m = shot(unsafe);
  assert(apply(miss, m.data(), m.size()));
  assert(!apply(miss, reveal(std::uint8_t((unsafe + 2) % 9), secret).data(), 34));
  const auto r = reveal(std::uint8_t((unsafe + 1) % 9), secret);
  assert(apply(miss, r.data(), r.size()) && miss.lastResult == MISSED && miss.goals[0] == 0);
  State t;
  assert(initial(2, nullptr, 0, t));
  assert(timeout(t, 0) && t.winner == 1 && t.phase == FINISHED);
  assert(!timeout(t, 0));
  std::cout << "native core: pass\n";
}
