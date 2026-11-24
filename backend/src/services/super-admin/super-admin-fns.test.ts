import { ForbiddenRequestError } from "@app/lib/errors";

import { assertInitialSetupActivationToken } from "./super-admin-fns";
import { SuperAdminErrorCode } from "./super-admin-types";

const mockConfig: { INITIAL_SETUP_ACTIVATION_TOKEN?: string } = {};

vi.mock("@app/lib/config/env", () => ({
  getConfig: () => mockConfig
}));

vi.mock("./super-admin-service", () => ({
  getServerCfg: vi.fn()
}));

const ACTIVATION_TOKEN = "f3b1c0d6e2a94785b6c1d0e9f8a7b6c5d4e3f2a1b0c9d8e7";

const expectRejected = (providedToken?: string) => {
  try {
    assertInitialSetupActivationToken(providedToken);
    expect.unreachable("expected the activation token to be rejected");
  } catch (error) {
    expect(error).toBeInstanceOf(ForbiddenRequestError);
    expect((error as ForbiddenRequestError).name).toBe(SuperAdminErrorCode.InvalidActivationToken);
  }
};

describe("assertInitialSetupActivationToken", () => {
  afterEach(() => {
    delete mockConfig.INITIAL_SETUP_ACTIVATION_TOKEN;
  });

  describe("when no activation token is configured", () => {
    test.each([undefined, "", "anything"])("allows signup with token %j", (providedToken) => {
      expect(() => assertInitialSetupActivationToken(providedToken)).not.toThrow();
    });
  });

  describe("when an activation token is configured", () => {
    beforeEach(() => {
      mockConfig.INITIAL_SETUP_ACTIVATION_TOKEN = ACTIVATION_TOKEN;
    });

    test("accepts the correct token", () => {
      expect(() => assertInitialSetupActivationToken(ACTIVATION_TOKEN)).not.toThrow();
    });

    test("accepts the correct token with surrounding whitespace", () => {
      expect(() => assertInitialSetupActivationToken(`  ${ACTIVATION_TOKEN}\n`)).not.toThrow();
    });

    test.each([
      ["missing", undefined],
      ["empty", ""],
      ["whitespace only", "   "],
      ["incorrect", "x".repeat(ACTIVATION_TOKEN.length)],
      ["a prefix of the correct token", ACTIVATION_TOKEN.slice(0, -1)],
      ["longer than the correct token", `${ACTIVATION_TOKEN}0`],
      ["differently cased", ACTIVATION_TOKEN.toUpperCase()]
    ])("rejects a token that is %s", (_label, providedToken) => {
      expectRejected(providedToken);
    });
  });
});
