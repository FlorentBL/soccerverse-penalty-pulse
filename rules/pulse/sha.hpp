// Freestanding FIPS 180-4 SHA-256, integer-only, no OS/library dependencies
// beyond <cstdint>/<cstddef>. Used by ships_core.cpp for commitment checks
// and the deterministic coin flip -- no OpenSSL, no libcrypto, so this code
// compiles into a zero-import wasm reactor the same way the xayaman blob does.
#pragma once

#include <cstddef>
#include <cstdint>

namespace pulse {

// One-shot digest: SHA-256(data[0..len)) -> out[0..32).
void pulse_sha256(const uint8_t* data, size_t len, uint8_t out[32]);

// Incremental context, for hashing concatenated inputs without a temporary
// buffer (e.g. the coin-flip hash over two 32-byte fields back to back).
// init/update*/final must be called in that order; update may be called any
// number of times (including zero) before final.
struct Sha256Ctx {
  uint32_t state[8];
  uint64_t bitlen;
  uint8_t buffer[64];
  uint32_t bufferLen;
};

void pulse_sha256_init(Sha256Ctx& ctx);
void pulse_sha256_update(Sha256Ctx& ctx, const uint8_t* data, size_t len);
void pulse_sha256_final(Sha256Ctx& ctx, uint8_t out[32]);

} // namespace pulse
