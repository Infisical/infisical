import { describe, expect, test } from "vitest";

import * as fixtures from "./certificate-pkcs12-fixtures";
import { runPkcs12Extraction } from "./certificate-pkcs12-runner";

const run = (fixture: string, password: string) =>
  runPkcs12Extraction({ pkcs12: Buffer.from(fixture, "base64"), password });

describe("runPkcs12Extraction", () => {
  test("extracts through the worker", async () => {
    const { entries } = await run(fixtures.sharedCaBundle, "test");

    expect(entries).toHaveLength(2);
  });

  test("refuses a keystore built to be expensive to open, without decrypting it", async () => {
    // 2.6KB with five million key-derivation rounds, which parsed inline blocks the event loop for
    // over a minute. The count is read from the file, so this costs nothing.
    const started = Date.now();

    await expect(run(fixtures.hostileIterations, "test")).rejects.toThrow(/key-derivation rounds/);

    expect(Date.now() - started).toBeLessThan(3_000);
  }, 15_000);
});
