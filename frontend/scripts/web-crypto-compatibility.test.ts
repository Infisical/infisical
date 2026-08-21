import assert from "node:assert/strict";
import test from "node:test";

const decodeBase64 = (value: string): Uint8Array<ArrayBuffer> => {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
};

test("base64 decoding preserves boundary byte values in ArrayBuffer-backed storage", () => {
  const bytes = decodeBase64("AH+A/w==");

  assert.ok(bytes.buffer instanceof ArrayBuffer);
  assert.deepEqual(Array.from(bytes), [0, 127, 128, 255]);
});

test("ArrayBuffer-backed Web Crypto inputs preserve authenticated bytes", async () => {
  const rawKey = new Uint8Array(32);
  rawKey.forEach((_, index) => {
    rawKey[index] = index;
  });

  const key = await crypto.subtle.importKey("raw", rawKey, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt"
  ]);
  const iv = new Uint8Array(12);
  const additionalData = new TextEncoder().encode("project|session|0|local|v1");
  const plaintext = new TextEncoder().encode("boundary:\u0000\u007f\u0080\u00ff");
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData },
    key,
    plaintext
  );
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv, additionalData },
    key,
    ciphertext
  );

  assert.deepEqual(new Uint8Array(decrypted), plaintext);
  assert.equal((await crypto.subtle.digest("SHA-256", plaintext)).byteLength, 32);
});
