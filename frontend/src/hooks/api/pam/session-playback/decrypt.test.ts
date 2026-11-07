import { afterEach, describe, expect, it, vi } from "vitest";

import { apiRequest } from "@app/config/request";

import { buildChunkAad, decryptOneChunk } from "./decrypt";

vi.mock("@app/config/request", () => ({ apiRequest: { get: vi.fn() } }));

const b64 = (bytes: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes))));
const recording = async () => {
  const sessionKey = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, [
    "encrypt",
    "decrypt"
  ]);
  const identity = {
    projectId: "project",
    sessionId: "session",
    chunkIndex: 0,
    storageBackend: "postgres" as const
  };
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const body = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: await buildChunkAad(identity) },
    sessionKey,
    new TextEncoder().encode('[{"channelType":"web"}]')
  );
  const digest = b64(await crypto.subtle.digest("SHA-256", body));
  vi.mocked(apiRequest.get).mockResolvedValue({ data: body });
  return {
    sessionKey,
    projectId: identity.projectId,
    sessionId: identity.sessionId,
    fallbackUrlBuilder: () => "/chunk",
    manifestDigest: digest,
    chunk: {
      chunkIndex: 0,
      startElapsedMs: 0,
      endElapsedMs: 100,
      storageBackend: "postgres" as const,
      externalChunkObjectKey: null,
      ciphertextSha256: digest,
      ciphertextBytes: body.byteLength,
      iv: b64(iv),
      presignedGetUrl: null
    }
  };
};

describe("Web recording playback verification", () => {
  afterEach(() => vi.restoreAllMocks());
  it("decrypts bytes authenticated by the metadata and sealed manifest", async () => {
    expect(await decryptOneChunk(await recording())).toMatchObject({
      ok: true,
      events: [{ channelType: "web" }]
    });
  });
  it("refuses a valid chunk whose sealed manifest names another digest before decrypting", async () => {
    const input = await recording();
    const decrypt = vi.spyOn(crypto.subtle, "decrypt");
    expect(
      await decryptOneChunk({ ...input, manifestDigest: b64(new Uint8Array(32)) })
    ).toMatchObject({ ok: false, reason: "sha256" });
    expect(decrypt).not.toHaveBeenCalled();
  });
  it("refuses ciphertext substituted across sessions even with matching digest metadata", async () => {
    const input = await recording();
    expect(await decryptOneChunk({ ...input, sessionId: "another-session" })).toMatchObject({
      ok: false,
      reason: "gcm"
    });
  });
});
