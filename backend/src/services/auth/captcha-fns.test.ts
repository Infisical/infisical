import { beforeEach, describe, expect, test, vi } from "vitest";

import { BadRequestError } from "@app/lib/errors";

const getConfig = vi.fn<() => { CAPTCHA_SECRET?: string }>();
const postForm = vi.fn<(url: string, body: Record<string, unknown>) => Promise<{ data: { success: boolean } }>>();

vi.mock("@app/lib/config/env", () => ({ getConfig: () => getConfig() }));
vi.mock("@app/lib/config/request", () => ({
  request: { postForm: (url: string, body: Record<string, unknown>) => postForm(url, body) }
}));

// eslint-disable-next-line import/first
import { verifyPublicEmailCaptcha } from "./captcha-fns";

const SECRET = "test-captcha-secret";
const TOKEN = "10000000-aaaa-bbbb-cccc-000000000001";

describe("verifyPublicEmailCaptcha", () => {
  beforeEach(() => {
    getConfig.mockReset();
    postForm.mockReset();
  });

  // Self-hosted instances mostly never set a captcha secret. The gate has to disappear entirely
  // there rather than locking everyone out of signup and password reset.
  test.each([undefined, ""])("is inert when no secret is configured (%s)", async (secret) => {
    getConfig.mockReturnValue({ CAPTCHA_SECRET: secret });

    await expect(verifyPublicEmailCaptcha(undefined)).resolves.toBeUndefined();
    expect(postForm).not.toHaveBeenCalled();
  });

  test("demands a token on every attempt once a secret is configured", async () => {
    getConfig.mockReturnValue({ CAPTCHA_SECRET: SECRET });

    await expect(verifyPublicEmailCaptcha(undefined)).rejects.toBeInstanceOf(BadRequestError);
    // No token means no work and, critically, no email: the check must short-circuit.
    expect(postForm).not.toHaveBeenCalled();
  });

  test("rejects a token the provider does not accept", async () => {
    getConfig.mockReturnValue({ CAPTCHA_SECRET: SECRET });
    postForm.mockResolvedValue({ data: { success: false } });

    await expect(verifyPublicEmailCaptcha("forged-token")).rejects.toBeInstanceOf(BadRequestError);
  });

  test("accepts a token the provider verifies, and sends the secret with it", async () => {
    getConfig.mockReturnValue({ CAPTCHA_SECRET: SECRET });
    postForm.mockResolvedValue({ data: { success: true } });

    await expect(verifyPublicEmailCaptcha(TOKEN)).resolves.toBeUndefined();
    expect(postForm).toHaveBeenCalledWith("https://api.hcaptcha.com/siteverify", {
      response: TOKEN,
      secret: SECRET
    });
  });

  // A provider outage must not silently admit the request; failing closed is the whole point.
  test("does not admit the request when the provider call throws", async () => {
    getConfig.mockReturnValue({ CAPTCHA_SECRET: SECRET });
    postForm.mockRejectedValue(new Error("hcaptcha unreachable"));

    await expect(verifyPublicEmailCaptcha(TOKEN)).rejects.toThrow();
  });
});
