import { describe, expect, test } from "vitest";

import { fingerprintReplicatedSecrets, mergeReplicatedSecrets } from "./secret-import-enforcement-fns";

const secret = (key: string, value: string) => ({ key, encryptedValue: Buffer.from(value) });

describe("mergeReplicatedSecrets", () => {
  test("keeps the source's own value, then the last import's value for a key several imports share", () => {
    const merged = mergeReplicatedSecrets(
      [secret("LOCAL", "local"), secret("OVERRIDDEN", "local")],
      [
        { secrets: [secret("SHARED", "first"), secret("FIRST_ONLY", "first"), secret("OVERRIDDEN", "first")] },
        { secrets: [secret("SHARED", "second"), secret("SECOND_ONLY", "second")] }
      ]
    );

    expect(Object.fromEntries(merged.map(({ key, encryptedValue }) => [key, encryptedValue.toString()]))).toEqual({
      LOCAL: "local",
      OVERRIDDEN: "local",
      SHARED: "second",
      SECOND_ONLY: "second",
      FIRST_ONLY: "first"
    });
  });

  test("keeps the first occurrence of a key within one import", () => {
    const merged = mergeReplicatedSecrets([], [{ secrets: [secret("KEY", "own"), secret("KEY", "nested")] }]);
    expect(merged.map(({ encryptedValue }) => encryptedValue.toString())).toEqual(["own"]);
  });
});

describe("fingerprintReplicatedSecrets", () => {
  test("does not depend on order", () => {
    expect(fingerprintReplicatedSecrets([secret("A", "1"), secret("B", "2")])).toBe(
      fingerprintReplicatedSecrets([secret("B", "2"), secret("A", "1")])
    );
  });

  test("changes when a value, comment or metadata changes", () => {
    const base = fingerprintReplicatedSecrets([secret("A", "1")]);
    expect(fingerprintReplicatedSecrets([secret("A", "2")])).not.toBe(base);
    expect(fingerprintReplicatedSecrets([{ ...secret("A", "1"), encryptedComment: Buffer.from("c") }])).not.toBe(base);
    expect(
      fingerprintReplicatedSecrets([{ ...secret("A", "1"), rawSecretMetadata: [{ key: "k", value: "v" }] }])
    ).not.toBe(base);
  });
});
