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
std::array<std::uint8_t, 34> reveal(std::uint8_t lane, const std::array<std::uint8_t, 32>& secret) {
  std::array<std::uint8_t, 34> out{};
  out[0] = 3; out[1] = lane;
  std::memcpy(out.data() + 2, secret.data(), 32);
  return out;
}
int main() {
  State s;
  assert(initial(2, nullptr, 0, s) && valid(s));
  assert(!initial(2, nullptr, 1, s));
  assert(initial(1, nullptr, 0, s) && valid(s) && whoseTurn(s) == -1);
  assert(!apply(s, shot(2).data(), 2));
  assert(initial(2, nullptr, 0, s));
  assert(playerExists(1100) && playerExists(278) && !playerExists(0) && !playerExists(9999999));
  const std::uint32_t players[6] = {1100, 278, 154, 874, 129718, 1};
  for (int kick = 0; kick < 6; ++kick) {
    const auto secret = salt(std::uint8_t(7 + kick));
    const auto id = players[kick];
    const auto lane = primaryLane(id);
    const auto keeper = std::uint8_t(kick % 2 ? lane : (lane + 1) % 3);
    const auto c = commit(kick, keeper, secret);
    assert(whoseTurn(s) == kick % 2);
    assert(!apply(s, pick(0).data(), 5));
    const auto p = pick(id);
    assert(apply(s, p.data(), p.size()));
    assert(whoseTurn(s) == 1 - kick % 2);
    assert(!apply(s, c.data(), 32));
    assert(apply(s, c.data(), c.size()));
    const auto m = shot(lane);
    assert(!apply(s, m.data(), 1));
    assert(!apply(s, shot(3).data(), 2));
    assert(apply(s, m.data(), m.size()));
    assert(!apply(s, reveal((keeper + 1) % 3, secret).data(), 34));
    const auto r = reveal(keeper, secret);
    assert(apply(s, r.data(), r.size()));
    assert(s.kick == kick + 1 && s.turnCount == (kick + 1) * 4 && valid(s));
    const auto bytes = encode(s);
    State restored;
    assert(decode(bytes.data(), bytes.size(), 2, restored));
    assert(valid(restored) && encode(restored) == bytes);
  }
  assert(s.phase == FINISHED && s.winner == 0 && s.goals[0] == 3 && s.goals[1] == 0);
  assert(whoseTurn(s) == -1 && !apply(s, shot(0).data(), 2));
  State t;
  assert(initial(2, nullptr, 0, t));
  assert(timeout(t, 0) && t.winner == 1 && t.phase == FINISHED);
  assert(!timeout(t, 0));
  std::cout << "native core: pass\n";
}
