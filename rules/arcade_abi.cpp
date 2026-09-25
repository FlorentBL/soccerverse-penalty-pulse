#include "pulse/game.hpp"
#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <new>

[[noreturn]] void judge_libcpp_verbose_abort(const char*, ...)
    asm("_ZNSt3__222__libcpp_verbose_abortEPKcz");
[[noreturn]] void judge_libcpp_verbose_abort(const char*, ...) { __builtin_trap(); }
extern "C" [[noreturn]] void abort_message(const char*, ...) { __builtin_trap(); }

namespace {
constexpr int MAX_HANDLES = 256;
pulse::State* handles[MAX_HANDLES] = {};
pulse::State* get(int32_t h) { return h >= 1 && h <= MAX_HANDLES ? handles[h - 1] : nullptr; }
int32_t store(pulse::State* s) {
  for (int i = 0; i < MAX_HANDLES; ++i) if (!handles[i]) { handles[i] = s; return i + 1; }
  return 0;
}
int32_t copy(const pulse::State& s, std::uint8_t* out, int32_t cap) {
  if (!out || cap < int32_t(pulse::STATE_SIZE)) return -2;
  const auto bytes = pulse::encode(s);
  std::memcpy(out, bytes.data(), bytes.size());
  return int32_t(bytes.size());
}
}

extern "C" {
__attribute__((export_name("arcade_alloc")))
void* arcade_alloc(std::uint32_t n) { return std::malloc(n ? n : 1); }
__attribute__((export_name("arcade_free")))
void arcade_free(void* p, std::uint32_t) { std::free(p); }
__attribute__((export_name("arcade_parse_state")))
int32_t arcade_parse_state(int32_t participants, const std::uint8_t* p, std::uint32_t n) {
  if (participants < 1 || participants > 2) return 0;
  auto* s = new (std::nothrow) pulse::State();
  if (!s) return 0;
  if (!pulse::decode(p, n, std::uint8_t(participants), *s)) { delete s; return 0; }
  const int32_t h = store(s);
  if (!h) delete s;
  return h;
}
__attribute__((export_name("arcade_release")))
void arcade_release(int32_t h) {
  if (h < 1 || h > MAX_HANDLES) return;
  delete handles[h - 1]; handles[h - 1] = nullptr;
}
__attribute__((export_name("arcade_is_valid")))
int32_t arcade_is_valid(int32_t h) { auto* s = get(h); return s && pulse::valid(*s) ? 1 : 0; }
__attribute__((export_name("arcade_whose_turn")))
int32_t arcade_whose_turn(int32_t h) { auto* s = get(h); return s ? pulse::whoseTurn(*s) : -1; }
__attribute__((export_name("arcade_turn_count")))
int32_t arcade_turn_count(int32_t h) { auto* s = get(h); return s ? s->turnCount : 0; }
__attribute__((export_name("arcade_is_finished")))
int32_t arcade_is_finished(int32_t h) { auto* s = get(h); return s && s->phase == pulse::FINISHED ? 1 : 0; }
__attribute__((export_name("arcade_winner")))
int32_t arcade_winner(int32_t h) { auto* s = get(h); return s && s->phase == pulse::FINISHED ? s->winner : -1; }
__attribute__((export_name("arcade_apply_move")))
int32_t arcade_apply_move(int32_t h, const std::uint8_t* m, std::uint32_t n, std::uint8_t* out, int32_t cap) {
  auto* s = get(h); if (!s) return -1;
  auto next = *s;
  if (!pulse::apply(next, m, n)) return -1;
  return copy(next, out, cap);
}
__attribute__((export_name("arcade_initial_state")))
int32_t arcade_initial_state(int32_t participants, const std::uint8_t* cfg, std::uint32_t n,
                             std::uint8_t* out, int32_t cap) {
  if (participants < 1 || participants > 2) return -1;
  pulse::State s;
  if (!pulse::initial(std::uint8_t(participants), cfg, n, s)) return -1;
  return copy(s, out, cap);
}
__attribute__((export_name("arcade_resolve_timeout")))
int32_t arcade_resolve_timeout(int32_t h, int32_t seat, std::uint8_t* out, int32_t cap) {
  auto* s = get(h); if (!s || seat < 0 || seat > 1) return -1;
  auto next = *s;
  if (!pulse::timeout(next, std::uint8_t(seat))) return -1;
  return copy(next, out, cap);
}
}
