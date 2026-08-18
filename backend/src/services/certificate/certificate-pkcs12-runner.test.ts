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

  test("gives up on a keystore built to be expensive to open", async () => {
    // 2.6KB with five million key-derivation rounds, which parsed inline blocks the event loop for
    // over a minute.
    const started = Date.now();

    await expect(run(fixtures.hostileIterations, "test")).rejects.toThrow(/takes too long to open/);

    expect(Date.now() - started).toBeLessThan(6_000);
  }, 15_000);
});
