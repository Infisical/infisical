import nodeCrypto from "node:crypto";

import { beforeEach, describe, expect, test, vi } from "vitest";

import { isPasswordBreached } from "./breached-password";

const mocks = vi.hoisted(() => ({
  config: { DISABLE_BREACHED_PASSWORD_CHECK: false },
  get: vi.fn(),
  warn: vi.fn()
}));

vi.mock("@app/lib/crypto/cryptography", async () => ({
  crypto: { nativeCrypto: await import("node:crypto") }
}));
vi.mock("../config/env", () => ({ getConfig: () => mocks.config }));
vi.mock("../config/request", () => ({ request: { get: mocks.get } }));
vi.mock("../logger", () => ({ logger: { warn: mocks.warn } }));

const PASSWORD = "Correct-Horse-Battery-7!";
const HASH = nodeCrypto.createHash("sha1").update(PASSWORD, "utf8").digest("hex").toUpperCase();
const SUFFIX = HASH.slice(5);

const rangeBody = (lines: string[]) => ({ data: lines.join("\r\n") });

describe("isPasswordBreached", () => {
  beforeEach(() => {
    mocks.config.DISABLE_BREACHED_PASSWORD_CHECK = false;
    mocks.get.mockReset();
    mocks.warn.mockReset();
  });

  test("sends only the five-character hash prefix and asks for padding", async () => {
    mocks.get.mockResolvedValue(rangeBody([]));

    await isPasswordBreached(PASSWORD);

    const [url, options] = mocks.get.mock.calls[0] as [string, { headers: unknown }];
    expect(url).toBe(`https://api.pwnedpasswords.com/range/${HASH.slice(0, 5)}`);
    expect(options.headers).toEqual({ "Add-Padding": "true" });
  });

  test("reports a breach when the suffix appears with a count", async () => {
    mocks.get.mockResolvedValue(rangeBody(["0018A45C4D1DEF81644B54AB7F969B88D65:1", `${SUFFIX}:42`]));

    expect(await isPasswordBreached(PASSWORD)).toBe(true);
  });

  test("ignores a padding record, which carries the suffix with a zero count", async () => {
    mocks.get.mockResolvedValue(rangeBody([`${SUFFIX}:0`]));

    expect(await isPasswordBreached(PASSWORD)).toBe(false);
  });

  test("reports no breach when the suffix is absent", async () => {
    mocks.get.mockResolvedValue(rangeBody(["0018A45C4D1DEF81644B54AB7F969B88D65:1"]));

    expect(await isPasswordBreached(PASSWORD)).toBe(false);
  });

  test("fails open and logs when the lookup errors", async () => {
    mocks.get.mockRejectedValue(new Error("connect ETIMEDOUT"));

    expect(await isPasswordBreached(PASSWORD)).toBe(false);
    expect(mocks.warn).toHaveBeenCalledTimes(1);
  });

  test("makes no request when the check is disabled", async () => {
    mocks.config.DISABLE_BREACHED_PASSWORD_CHECK = true;

    expect(await isPasswordBreached(PASSWORD)).toBe(false);
    expect(mocks.get).not.toHaveBeenCalled();
  });
});
