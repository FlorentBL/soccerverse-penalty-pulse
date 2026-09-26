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
std::array<std::uint8_t, 9> pick(std::uint32_t shooter, std::uint32_t keeper) {
  std::array<std::uint8_t, 9> out{};
  out[0] = 4; put32(out.data() + 1, shooter); put32(out.data() + 5, keeper);
  return out;
}
int main() {
  constexpr std::uint32_t shooters0[3] = {184, 874, 1917};
  constexpr std::uint32_t keepers0[3] = {19465, 1438, 62};
  constexpr std::uint32_t shooters1[3] = {874, 1917, 184};
  constexpr std::uint32_t keepers1[3] = {1438, 62, 19465};
  for (int mode = 0; mode < 2; ++mode) {
    State s; initial(2, nullptr, 0, s);
    std::cout << "mode " << mode << '\n';
    const auto initialBytes = encode(s); hex(initialBytes.data(), initialBytes.size()); std::cout << '\n';
    for (int k = 0; k < (mode == 0 ? 4 : 8); ++k) {
      if (k % 2 == 0) {
        const int round = k / 2 < 3 ? k / 2 : 0;
        const auto secret = salt(k + 40);
        std::uint8_t pre[42] = {0x50, std::uint8_t(k / 2)};
        put32(pre + 2, shooters0[round]); put32(pre + 6, keepers0[round]);
        std::memcpy(pre + 10, secret.data(), 32);
        std::array<std::uint8_t, 33> commit{}; commit[0] = 5;
        pulse_sha256(pre, sizeof(pre), commit.data() + 1); step(s, commit);
        step(s, pick(shooters1[round], keepers1[round]));
        std::array<std::uint8_t, 41> reveal{}; reveal[0] = 6;
        put32(reveal.data() + 1, shooters0[round]); put32(reveal.data() + 5, keepers0[round]);
        std::memcpy(reveal.data() + 9, secret.data(), 32); step(s, reveal);
      }
      const auto striker = s.pairShooters[k % 2];
      const auto keeper = s.pairKeepers[1 - k % 2];
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
