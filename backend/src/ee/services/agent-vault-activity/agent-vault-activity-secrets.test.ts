import { describe, expect, test, vi } from "vitest";

import {
  generateActivityKey,
  openActivityKey,
  unwrapActivityKey,
  wrapActivityKey
} from "./agent-vault-activity-secrets";

vi.mock("@app/lib/logger", () => ({ logger: { error: vi.fn() } }));

// The real KMS wrap is authenticated encryption; passing bytes through leaves only the label check under test.
const passThroughKms = {
  createCipherPairWithDataKey: async () => ({
    encryptor: ({ plainText }: { plainText: Buffer }) => ({ cipherTextBlob: Buffer.from(plainText) }),
    decryptor: ({ cipherTextBlob }: { cipherTextBlob: Buffer }) => Buffer.from(cipherTextBlob)
  })
} as never;

describe("activity keys", () => {
  test("a key opens for the session it was wrapped for", async () => {
    const activityKey = generateActivityKey();
    const encryptedActivityKey = await wrapActivityKey(
      { projectId: "proj-1", sessionId: "sess-a", activityKey },
      passThroughKms
    );

    const opened = await unwrapActivityKey(
      { projectId: "proj-1", sessionId: "sess-a", encryptedActivityKey },
      passThroughKms
    );
    expect(opened.equals(activityKey)).toBe(true);
  });

  test("a key copied onto another session's row is refused rather than handed out", async () => {
    const encryptedActivityKey = await wrapActivityKey(
      { projectId: "proj-1", sessionId: "sess-a", activityKey: generateActivityKey() },
      passThroughKms
    );

    await expect(
      unwrapActivityKey({ projectId: "proj-1", sessionId: "sess-b", encryptedActivityKey }, passThroughKms)
    ).rejects.toMatchObject({ name: "InternalServerError" });
  });

  test("a stored key without its session label is refused", () => {
    expect(() => openActivityKey({ sessionId: "sess-a", payload: generateActivityKey() })).toThrow();
  });
});
