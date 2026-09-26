#pragma once

#include <array>
#include <cstddef>
#include <cstdint>

namespace pulse {

constexpr std::size_t STATE_SIZE = 127;
enum Phase : std::uint8_t { PICK_COMMIT = 0, PICK = 1, PICK_REVEAL = 2,
  COMMIT = 3, SHOOT = 4, REVEAL = 5, FINISHED = 6 };
enum Result : std::uint8_t { NONE = 0, GOAL = 1, SAVED = 2, MISSED = 3 };

struct State {
  std::uint8_t participants = 2;
  Phase phase = PICK_COMMIT;
  std::uint8_t turn = 0;
  std::uint8_t kick = 0;
  std::uint8_t goals[2] = {0, 0};
  std::int8_t winner = -1;
  std::uint16_t turnCount = 0;
  std::array<std::uint8_t, 32> commitment{};
  std::uint32_t pendingShooter = 0;
  std::uint32_t pendingKeeper = 0;
  std::uint8_t pendingLane = 255;
  Result lastResult = NONE;
  std::uint32_t usedShooters[2][3] = {};
  std::uint32_t usedKeepers[2][3] = {};
  std::uint32_t lastPlayer = 0;
  std::uint32_t lastKeeper = 0;
  std::uint8_t lastShot = 255;
  std::uint8_t lastGuard = 255;
  std::uint32_t pairShooters[2] = {0, 0};
  std::uint32_t pairKeepers[2] = {0, 0};
  std::uint8_t lastReach = 255;
};

bool playerExists(std::uint32_t id);
bool isCentreForward(std::uint32_t id);
bool isGoalkeeper(std::uint32_t id);
std::uint8_t shootingRating(std::uint32_t id); // 255 means unavailable.
std::uint8_t goalkeeperRating(std::uint32_t id); // 255 means unavailable.
std::uint8_t scoringTargetCount(std::uint32_t id);
bool isScoringTarget(std::uint32_t id, std::uint8_t target);
int ratingTier(std::uint8_t rating);
bool canReach(std::uint32_t keeper, std::uint32_t shooter);
bool adjacent(std::uint8_t first, std::uint8_t second);
bool validReach(std::uint32_t keeper, std::uint32_t shooter, std::uint8_t first, std::uint8_t second);
bool initial(std::uint8_t participants, const std::uint8_t* cfg, std::size_t cfgLength, State& out);
bool decode(const std::uint8_t* bytes, std::size_t length, std::uint8_t participants, State& out);
std::array<std::uint8_t, STATE_SIZE> encode(const State& state);
bool valid(const State& state);
int whoseTurn(const State& state);
bool apply(State& state, const std::uint8_t* move, std::size_t length);
bool timeout(State& state, std::uint8_t seat);

} // namespace pulse
