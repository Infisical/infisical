import { describe, expect, it } from "vitest";

import { decodeEncryptionKey } from "./kms-service";

describe("decodeEncryptionKey", () => {
  describe("hex-encoded keys (64 chars = 32 bytes)", () => {
    it("should decode a hex-encoded key with lowercase letters", () => {
      // Generated via: openssl rand -hex 32
      const hexKey = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2";
      const result = decodeEncryptionKey(hexKey);

      expect(result).toBeInstanceOf(Buffer);
      expect(result.length).toBe(32);
      expect(result.toString("hex")).toBe(hexKey.toLowerCase());
    });

    it("should decode a hex-encoded key with uppercase letters", () => {
      const hexKey = "A1B2C3D4E5F6A7B8C9D0E1F2A3B4C5D6E7F8A9B0C1D2E3F4A5B6C7D8E9F0A1B2";
      const result = decodeEncryptionKey(hexKey);

      expect(result).toBeInstanceOf(Buffer);
      expect(result.length).toBe(32);
      expect(result.toString("hex")).toBe(hexKey.toLowerCase());
    });

    it("should decode a hex-encoded key with mixed case", () => {
      const hexKey = "A1b2C3d4E5f6A7b8C9d0E1f2A3b4C5d6E7f8A9b0C1d2E3f4A5b6C7d8E9f0A1b2";
      const result = decodeEncryptionKey(hexKey);

      expect(result).toBeInstanceOf(Buffer);
      expect(result.length).toBe(32);
    });

    it("should decode a random hex key correctly", () => {
      // Another random hex key
      const hexKey = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
      const result = decodeEncryptionKey(hexKey);

      expect(result).toBeInstanceOf(Buffer);
      expect(result.length).toBe(32);
    });
  });

  describe("base64-encoded keys (~44 chars = 32 bytes)", () => {
    it("should decode a base64-encoded key with padding", () => {
      // Generated via: openssl rand -base64 32
      const base64Key = "dGVzdGtleXRlc3RrZXl0ZXN0a2V5dGVzdGtleXRlc3Q="; // 44 chars with padding
      const result = decodeEncryptionKey(base64Key);

      expect(result).toBeInstanceOf(Buffer);
      expect(result.length).toBe(32);
    });

    it("should decode a base64-encoded key without padding", () => {
      // Same key without padding
      const base64Key = "dGVzdGtleXRlc3RrZXl0ZXN0a2V5dGVzdGtleXRlc3Q";
      const result = decodeEncryptionKey(base64Key);

      expect(result).toBeInstanceOf(Buffer);
      expect(result.length).toBe(32);
    });

    it("should decode a standard 44-char base64 key", () => {
      // Another openssl rand -base64 32 output
      const base64Key = "YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXoxMjM0NTY=";
      const result = decodeEncryptionKey(base64Key);

      expect(result).toBeInstanceOf(Buffer);
      expect(result.length).toBe(32);
    });

    it("should handle base64 key that decodes to exactly 32 bytes", () => {
      // This key decodes to exactly 32 bytes
      const base64Key = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
      const result = decodeEncryptionKey(base64Key);

      expect(result).toBeInstanceOf(Buffer);
      expect(result.length).toBe(32);
    });
  });

  describe("legacy utf8/raw keys (32 chars = 32 bytes)", () => {
    it("should decode a 32-character UTF-8 string as raw bytes", () => {
      // Legacy ENCRYPTION_KEY format: 32 arbitrary characters
      const utf8Key = "my-secret-key-32-chars-long!!!!!";
      const result = decodeEncryptionKey(utf8Key);

      expect(result).toBeInstanceOf(Buffer);
      expect(result.length).toBe(32);
      expect(result.toString("utf8")).toBe(utf8Key);
    });

    it("should decode a 32-char alphanumeric key as utf8", () => {
      const utf8Key = "abcdefghijklmnopqrstuvwxyz123456";
      const result = decodeEncryptionKey(utf8Key);

      expect(result).toBeInstanceOf(Buffer);
      expect(result.length).toBe(32);
    });
  });

  describe("edge cases and error handling", () => {
    it("should prefer hex over base64 when key is 64 hex chars", () => {
      // A key that looks like hex but could be interpreted as base64
      // 64 hex chars should be treated as hex, not base64
      const hexKey = "deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef";
      const result = decodeEncryptionKey(hexKey);

      expect(result).toBeInstanceOf(Buffer);
      expect(result.length).toBe(32);
      expect(result.toString("hex")).toBe(hexKey);
    });

    it("should handle non-32-byte base64 as utf8 fallback", () => {
      // A base64 string that decodes to something other than 32 bytes
      // Should fall back to utf8 encoding
      const weirdKey = "dGVzdA=="; // decodes to "test" (4 bytes)
      const result = decodeEncryptionKey(weirdKey);

      // Since it's valid base64 but NOT 32 bytes, it falls through to utf8
      expect(result).toBeInstanceOf(Buffer);
      // It will be treated as utf8 (8 chars)
      expect(result.length).toBe(8);
    });

    it("should handle short keys as utf8", () => {
      const shortKey = "short";
      const result = decodeEncryptionKey(shortKey);

      expect(result).toBeInstanceOf(Buffer);
      expect(result.length).toBe(5);
    });

    it("should handle empty string", () => {
      const emptyKey = "";
      const result = decodeEncryptionKey(emptyKey);

      expect(result).toBeInstanceOf(Buffer);
      expect(result.length).toBe(0);
    });
  });

  describe("real-world scenarios", () => {
    it("should handle the exact error case from issue #2733 - hex 64 chars", () => {
      // User generated with: openssl rand -hex 32
      // This is the exact scenario that fails with "Invalid key length"
      const userHexKey = "7a4c8f2b9e1d6a5c3b8f0e7d4a2c9b6e3f5a8c1d7e4b2a9c6f3e8d5a1b7c4e2";
      const result = decodeEncryptionKey(userHexKey);

      expect(result).toBeInstanceOf(Buffer);
      expect(result.length).toBe(32);
    });

    it("should handle base64 key from FIPS documentation", () => {
      // User generated with: openssl rand -base64 32
      const userBase64Key = "aJ7cDf9Gh2Kl5Mn8Pq4Rs7Uv0Xy3Ab6De9Gh2Jk5Mn8=";
      const result = decodeEncryptionKey(userBase64Key);

      expect(result).toBeInstanceOf(Buffer);
      expect(result.length).toBe(32);
    });
  });
});
