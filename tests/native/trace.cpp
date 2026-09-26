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
std::array<std::uint8_t, 5> pick(std::uint32_t id) {
  return {4, std::uint8_t(id), std::uint8_t(id >> 8), std::uint8_t(id >> 16), std::uint8_t(id >> 24)};
}
int main() {
  constexpr std::uint32_t ids[] = {1100,278,154,874,129718,1,1100,278};
  for (int mode = 0; mode < 2; ++mode) {
    State s; initial(2, nullptr, 0, s);
    std::cout << "mode " << mode << '\n';
    const auto initialBytes = encode(s); hex(initialBytes.data(), initialBytes.size()); std::cout << '\n';
    for (int k = 0; k < (mode == 0 ? 4 : 8); ++k) {
      if (k % 2 == 0) {
        const auto secret = salt(k + 40);
        const auto id = ids[k];
        std::uint8_t pre[38] = {0x50, std::uint8_t(k / 2), std::uint8_t(id), std::uint8_t(id >> 8),
                                std::uint8_t(id >> 16), std::uint8_t(id >> 24)};
        std::memcpy(pre + 6, secret.data(), 32);
        std::array<std::uint8_t, 33> commit{}; commit[0] = 5;
        pulse_sha256(pre, sizeof(pre), commit.data() + 1); step(s, commit);
        step(s, pick(ids[k + 1]));
        std::array<std::uint8_t, 37> reveal{}; reveal[0] = 6;
        const auto p = pick(id); std::memcpy(reveal.data() + 1, p.data() + 1, 4);
        std::memcpy(reveal.data() + 5, secret.data(), 32); step(s, reveal);
      }
      const auto striker = s.pairPlayers[k % 2];
      std::uint8_t target = 0; while (!isScoringTarget(striker, target)) ++target;
      const bool goal = mode == 0 ? k % 2 == 0 : k == 6;
      const auto guard = std::uint8_t(goal ? (target + 1) % 9 : target);
      const auto secret = salt(k + 60);
      std::uint8_t pre[36] = {0x47, std::uint8_t(k), guard, 255};
      std::memcpy(pre + 4, secret.data(), 32);
      std::array<std::uint8_t, 33> commit{}; commit[0] = 1;
      pulse_sha256(pre, sizeof(pre), commit.data() + 1); step(s, commit);
      step(s, std::array<std::uint8_t, 2>{2, target});
      std::array<std::uint8_t, 35> reveal{}; reveal[0] = 3; reveal[1] = guard; reveal[2] = 255;
      std::memcpy(reveal.data() + 3, secret.data(), 32); step(s, reveal);
    }
  }
}
