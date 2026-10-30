import { describe, expect, it } from "vitest";

import { deriveSecretValueBlindIndexKey } from "./blind-index";
import { deriveCookieSigningKey } from "./cookie-signing-key";

const ROOT_KEY = Buffer.from("000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f", "hex");

describe("deriveCookieSigningKey", () => {
  // Pins the context string, the empty salt, SHA-256 and the 32 byte length together. Changing any
  // of them changes every deployment's key on upgrade, which logs out every SSO login in flight, so
  // that has to be a deliberate edit to this vector rather than a silent side effect.
  it("matches the known answer for a fixed root key", () => {
    expect(deriveCookieSigningKey(ROOT_KEY)).toBe("uFYvATtAEhzPYlypzAyQnrPGMoUA3GwqtIEVO6PlBqY=");
  });

  it("returns 32 bytes of base64", () => {
    const key = deriveCookieSigningKey(ROOT_KEY);
    expect(Buffer.from(key, "base64")).toHaveLength(32);
  });

  // Every process on a deployment derives independently from the same stored root key and has to
  // land on the same value, or one task rejects another task's cookies.
  it("is deterministic across calls", () => {
    expect(deriveCookieSigningKey(ROOT_KEY)).toBe(deriveCookieSigningKey(Buffer.from(ROOT_KEY)));
  });

  it("differs for a root key that differs by a single bit", () => {
    const neighbour = Buffer.from(ROOT_KEY);
    neighbour[31] -= 1; // 0x1f to 0x1e, one bit apart
    expect(deriveCookieSigningKey(neighbour)).not.toBe(deriveCookieSigningKey(ROOT_KEY));
  });

  it("differs from the root key it came from", () => {
    expect(deriveCookieSigningKey(ROOT_KEY)).not.toBe(ROOT_KEY.toString("base64"));
  });

  // Same root key, same HKDF, different context. If the contexts ever collide, a cookie signing key
  // and a blind index key become the same secret used for two unrelated purposes.
  it("is domain separated from the blind index derivation over the same root key", async () => {
    const blindIndexKey = await deriveSecretValueBlindIndexKey(ROOT_KEY);
    expect(deriveCookieSigningKey(ROOT_KEY)).not.toBe(blindIndexKey.toString("base64"));
  });
});
