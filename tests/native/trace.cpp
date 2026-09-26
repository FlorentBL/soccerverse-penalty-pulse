#include "pulse/game.hpp"
#include "pulse/sha.hpp"
#include <array>
#include <cstdint>
#include <cstring>
#include <iostream>

using namespace pulse;
void hex(const std::uint8_t* bytes, std::size_t n) {
  static const char* digits = "0123456789abcdef";
  for (std::size_t i = 0; i < n; ++i) std::cout << digits[bytes[i] >> 4] << digits[bytes[i] & 15];
}
template<std::size_t N> void step(State& s, const std::array<std::uint8_t, N>& move) {
  if (!apply(s, move.data(), move.size())) std::abort();
  hex(move.data(), move.size()); std::cout << " ";
  const auto b = encode(s); hex(b.data(), b.size()); std::cout << "\n";
}
int main() {
  constexpr std::uint32_t ids[] = {1100,278,154,874,129718,1,1100,278};
  for (int mode = 0; mode < 2; ++mode) {
    State s; initial(2, nullptr, 0, s);
    std::cout << "mode " << mode << "\n";
    auto initialBytes = encode(s); hex(initialBytes.data(), initialBytes.size()); std::cout << "\n";
    for (int k = 0; k < (mode == 0 ? 4 : 8); ++k) {
      std::array<std::uint8_t, 5> pick = {4, std::uint8_t(ids[k]), std::uint8_t(ids[k] >> 8),
        std::uint8_t(ids[k] >> 16), std::uint8_t(ids[k] >> 24)};
      step(s, pick);
      std::uint8_t shotLane = 0;
      while (!isScoringTarget(ids[k], shotLane)) ++shotLane;
      const auto goal = mode == 0 ? k % 2 == 0 : k == 6;
      const auto guard = std::uint8_t(goal ? (shotLane + 1) % 9 : shotLane);
      std::array<std::uint8_t, 32> salt{};
      for (int i = 0; i < 32; ++i) salt[i] = std::uint8_t(k * 11 + i);
      std::uint8_t pre[34] = {std::uint8_t(k), guard};
      std::memcpy(pre + 2, salt.data(), 32);
      std::array<std::uint8_t, 33> commit{}; commit[0] = 1;
      pulse_sha256(pre, 34, commit.data() + 1);
      step(s, commit);
      std::array<std::uint8_t, 2> shot = {2, shotLane};
      step(s, shot);
      std::array<std::uint8_t, 34> reveal{};
      reveal[0] = 3; reveal[1] = guard; std::memcpy(reveal.data() + 2, salt.data(), 32);
      step(s, reveal);
    }
  }
}
