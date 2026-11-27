import { createCipheriv, createHash, randomBytes } from "node:crypto";

import { describe, expect, test } from "vitest";

import { decryptRecordingChunk } from "./pam-recording-secrets";

// Encrypts a chunk the way the gateway does: AES-256-GCM with the tag appended to the ciphertext.
const encryptChunk = (sessionKey: Buffer, iv: Buffer, chunkIndex: number, plaintext: string) => {
  const cipher = createCipheriv("aes-256-gcm", sessionKey, iv);
  cipher.setAAD(createHash("sha256").update(`project-1|session-1|${chunkIndex}|aws-s3|v1`).digest());
  return Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final(), cipher.getAuthTag()]);
};

describe("decryptRecordingChunk", () => {
  const sessionKey = randomBytes(32);
  const iv = randomBytes(12);
  const plaintext = JSON.stringify([{ timestamp: "2026-11-19T10:00:00Z", input: "SELECT 1", output: "1" }]);
  const ciphertext = encryptChunk(sessionKey, iv, 4, plaintext);

  const decrypt = (overrides: { chunkIndex?: number; storageBackend?: string } = {}) =>
    decryptRecordingChunk({
      sessionKey,
      projectId: "project-1",
      sessionId: "session-1",
      chunkIndex: 4,
      storageBackend: "aws-s3",
      iv,
      ciphertext,
      ...overrides
    });

  test("decrypts a chunk the gateway encrypted", () => {
    expect(decrypt().toString("utf8")).toBe(plaintext);
  });

  test("refuses a chunk read at another position or from another backend", () => {
    expect(() => decrypt({ chunkIndex: 5 })).toThrow();
    expect(() => decrypt({ storageBackend: "postgres" })).toThrow();
  });
});
