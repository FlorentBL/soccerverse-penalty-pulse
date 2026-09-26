#include "pulse/game.hpp"
#include "pulse/sha.hpp"
#include <array>
#include <cstdint>
#include <cstring>
#include <iostream>
using namespace pulse;
void hex(const std::uint8_t* bytes, std::size_t n) {
  static const char* d = "0123456789abcdef";
  for (std::size_t i = 0; i < n; ++i) std::cout << d[bytes[i] >> 4] << d[bytes[i] & 15];
}
template<std::size_t N> void step(State& s, const std::array<std::uint8_t, N>& m) {
  if (!apply(s, m.data(), m.size())) std::abort();
  hex(m.data(), m.size()); std::cout << ' ';
  const auto b = encode(s); hex(b.data(), b.size()); std::cout << '\n';
}
std::array<std::uint8_t, 32> salt(int seed) {
  std::array<std::uint8_t, 32> out{};
  for (int i = 0; i < 32; ++i) out[i] = std::uint8_t(seed + i);
  return out;
}
void put32(std::uint8_t* p, std::uint32_t id) {
  for (int i = 0; i < 4; ++i) p[i] = std::uint8_t(id >> (8 * i));
}
std::array<std::uint8_t, 5> player(std::uint8_t opcode, std::uint32_t id) {
  std::array<std::uint8_t, 5> out{}; out[0] = opcode; put32(out.data() + 1, id); return out;
}
int main() {
  constexpr std::uint32_t shooters[2][3] = {{184, 874, 1917}, {874, 1917, 184}};
  constexpr std::uint32_t keepers[2][3] = {{19465, 1438, 62}, {1438, 62, 19465}};
  for (int mode = 0; mode < 2; ++mode) {
    State s; initial(2, nullptr, 0, s);
    std::cout << "mode " << mode << '\n';
    const auto initialBytes = encode(s); hex(initialBytes.data(), initialBytes.size()); std::cout << '\n';
    for (int k = 0; k < (mode == 0 ? 4 : 8); ++k) {
      const int seat = k % 2, round = k / 2 < 3 ? k / 2 : 0;
      step(s, player(4, shooters[seat][round]));
      step(s, player(5, keepers[1 - seat][round]));
      const auto striker = s.pairShooters[seat];
      const auto keeper = s.pairKeepers[1 - seat];
      std::uint8_t target = 0; while (!isScoringTarget(striker, target)) ++target;
      const bool goal = mode == 0 ? k % 2 == 0 : k == 6;
      const auto guard = std::uint8_t(goal ? (target + 1) % 9 : target);
      std::uint8_t reach = 255;
      if (canReach(keeper, striker))
        for (std::uint8_t i = 0; i < 9; ++i)
          if (validReach(keeper, striker, guard, i) && (!goal || i != target)) {
            reach = i; break;
          }
      const auto secret = salt(k + 60);
      std::uint8_t pre[36] = {0x47, std::uint8_t(k), guard, reach};
      std::memcpy(pre + 4, secret.data(), 32);
      std::array<std::uint8_t, 33> commit{}; commit[0] = 1;
      pulse_sha256(pre, sizeof(pre), commit.data() + 1); step(s, commit);
      step(s, std::array<std::uint8_t, 2>{2, target});
      std::array<std::uint8_t, 35> reveal{}; reveal[0] = 3; reveal[1] = guard; reveal[2] = reach;
      std::memcpy(reveal.data() + 3, secret.data(), 32); step(s, reveal);
    }
  }
}
