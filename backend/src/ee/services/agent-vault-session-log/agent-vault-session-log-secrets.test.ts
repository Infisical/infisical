import { describe, expect, test, vi } from "vitest";

import { buildWrappedKeyPayload, openWrappedKey } from "@app/services/kms/kms-fns";

import {
  generateSessionLogKey,
  openSessionLogKey,
  unwrapSessionLogKey,
  wrapSessionLogKey
} from "./agent-vault-session-log-secrets";

vi.mock("@app/lib/logger", () => ({ logger: { error: vi.fn() } }));

// The real KMS wrap is authenticated encryption; passing bytes through leaves only the label check under test.
const passThroughKms = {
  wrapKey: async ({ label, key }: { label: string; key: Buffer }) => buildWrappedKeyPayload(label, key),
  unwrapKey: async ({ label, wrappedKey, keyBytes }: { label: string; wrappedKey: Buffer; keyBytes: number }) =>
    openWrappedKey({ label, payload: wrappedKey, keyBytes })
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

  test("a stored key without its session label is refused", () => {
    expect(() => openSessionLogKey({ sessionId: "sess-a", payload: generateSessionLogKey() })).toThrow();
  });
});
