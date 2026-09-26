#pragma once

#include <array>
#include <cstddef>
#include <cstdint>

namespace pulse {

constexpr std::size_t STATE_SIZE = 78;
enum Phase : std::uint8_t { PICK = 0, COMMIT = 1, SHOOT = 2, REVEAL = 3, FINISHED = 4 };
enum Result : std::uint8_t { NONE = 0, GOAL = 1, SAVED = 2, MISSED = 3 };

struct State {
  std::uint8_t participants = 2;
  Phase phase = PICK;
  std::uint8_t turn = 0;
  std::uint8_t kick = 0;
  std::uint8_t goals[2] = {0, 0};
  std::int8_t winner = -1;
  std::uint16_t turnCount = 0;
  std::array<std::uint8_t, 32> commitment{};
  std::uint32_t pendingPlayer = 0;
  std::uint8_t pendingLane = 255;
  Result lastResult = NONE;
  std::uint32_t used[2][3] = {};
  std::uint32_t lastPlayer = 0;
  std::uint8_t lastShot = 255;
  std::uint8_t lastGuard = 255;
};

bool playerExists(std::uint32_t id);
std::uint8_t scoringTargetCount(std::uint32_t id);
bool isScoringTarget(std::uint32_t id, std::uint8_t target);
bool initial(std::uint8_t participants, const std::uint8_t* cfg, std::size_t cfgLength, State& out);
bool decode(const std::uint8_t* bytes, std::size_t length, std::uint8_t participants, State& out);
std::array<std::uint8_t, STATE_SIZE> encode(const State& state);
bool valid(const State& state);
int whoseTurn(const State& state);
bool apply(State& state, const std::uint8_t* move, std::size_t length);
bool timeout(State& state, std::uint8_t seat);

} // namespace pulse
