import { createHash } from "node:crypto";

import { describe, expect, test, vi } from "vitest";

import { WrappedKeyPayload } from "@app/domains/platform/kms-core/ce/module";

import {
  generateSessionLogKey,
  openSessionLogKey,
  unwrapSessionLogKey,
  wrapSessionLogKey
} from "./agent-vault-session-log-secrets";

vi.mock("@app/lib/logger", () => ({ logger: { error: vi.fn() } }));

// The real KMS wrap is authenticated encryption; passing bytes through leaves only the label check under test.
const passThroughKms = {
  wrapKey: async ({ label, key }: { label: string; key: Buffer }) => WrappedKeyPayload.build(label, key).payload,
  unwrapKey: async ({ label, wrappedKey, keyBytes }: { label: string; wrappedKey: Buffer; keyBytes: number }) =>
    WrappedKeyPayload.restore(wrappedKey).open(label, keyBytes)
} as never;

describe("session log keys", () => {
  test("a key opens for the session it was wrapped for", async () => {
    const sessionLogKey = generateSessionLogKey();
    const encryptedSessionLogKey = await wrapSessionLogKey(
      { projectId: "proj-1", sessionId: "sess-a", sessionLogKey },
      passThroughKms
    );

    const opened = await unwrapSessionLogKey(
      { projectId: "proj-1", sessionId: "sess-a", encryptedSessionLogKey },
      passThroughKms
    );
    expect(opened.equals(sessionLogKey)).toBe(true);
  });

  test("a key copied onto another session's row is refused rather than handed out", async () => {
    const encryptedSessionLogKey = await wrapSessionLogKey(
      { projectId: "proj-1", sessionId: "sess-a", sessionLogKey: generateSessionLogKey() },
      passThroughKms
    );

    await expect(
      unwrapSessionLogKey({ projectId: "proj-1", sessionId: "sess-b", encryptedSessionLogKey }, passThroughKms)
    ).rejects.toMatchObject({ name: "InternalServerError" });
  });

  // An Agent Vault session can have no expiry, so a key stored by older code must still open. The layout is built here
  // by hand, so changing the label in the secrets module breaks this test.
  test("a key stored in the original layout, sha256(sessionId|v1) then the key, still opens", () => {
    const sessionId = "6f1c7a52-3f7e-4c8e-9a40-0b2d6c1e9f11";
    const sessionLogKey = generateSessionLogKey();
    const storedBefore = Buffer.concat([createHash("sha256").update(`${sessionId}|v1`).digest(), sessionLogKey]);
    expect(openSessionLogKey({ sessionId, payload: storedBefore }).equals(sessionLogKey)).toBe(true);
  });

  test("a stored key without its session label is refused", () => {
    expect(() => openSessionLogKey({ sessionId: "sess-a", payload: generateSessionLogKey() })).toThrow();
  });
});
