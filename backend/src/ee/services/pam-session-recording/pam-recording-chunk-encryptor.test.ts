import { webcrypto } from "node:crypto";

import { buildChunkAad, encryptChunk } from "./pam-recording-chunk-encryptor";

test("encryptChunk output decrypts with WebCrypto AES-GCM using the same AAD", async () => {
  const sessionKey = Buffer.alloc(32, 7);
  const plaintext = Buffer.from(
    JSON.stringify([{ type: "web_frame", elapsedMs: 10, jpegBase64: "AAA=", w: 4, h: 3 }])
  );
  const { body, iv } = encryptChunk({
    plaintext,
    sessionKey,
    projectId: "p1",
    sessionId: "s1",
    chunkIndex: 0,
    storageBackend: "postgres"
  });

  const key = await webcrypto.subtle.importKey("raw", sessionKey, { name: "AES-GCM" }, false, ["decrypt"]);
  const aad = buildChunkAad({ projectId: "p1", sessionId: "s1", chunkIndex: 0, storageBackend: "postgres" });
  const out = await webcrypto.subtle.decrypt({ name: "AES-GCM", iv, additionalData: aad }, key, body);
  expect(Buffer.from(out).toString()).toBe(plaintext.toString());
});
