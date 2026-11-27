import { ForbiddenRequestError } from "@app/lib/errors";

import { assertInstanceSetupToken } from "./super-admin-fns";
import { SuperAdminErrorCode } from "./super-admin-types";

const mockConfig: { INSTANCE_SETUP_TOKEN?: string } = {};

vi.mock("@app/lib/config/env", () => ({
  getConfig: () => mockConfig
}));

vi.mock("./super-admin-service", () => ({
  getServerCfg: vi.fn()
}));

const SETUP_TOKEN = "sample-setup-token";

const expectRejected = (providedToken?: string) => {
  try {
    assertInstanceSetupToken(providedToken);
    expect.unreachable("expected the setup token to be rejected");
  } catch (error) {
    expect(error).toBeInstanceOf(ForbiddenRequestError);
    expect((error as ForbiddenRequestError).name).toBe(SuperAdminErrorCode.InvalidSetupToken);
  }
};

describe("assertInstanceSetupToken", () => {
  afterEach(() => {
    delete mockConfig.INSTANCE_SETUP_TOKEN;
  });

  describe("when no setup token is configured", () => {
    test.each([undefined, "", "anything"])("allows signup with token %j", (providedToken) => {
      expect(() => assertInstanceSetupToken(providedToken)).not.toThrow();
    });
  });

  describe("when a setup token is configured", () => {
    beforeEach(() => {
      mockConfig.INSTANCE_SETUP_TOKEN = SETUP_TOKEN;
    });

    test("accepts the correct token", () => {
      expect(() => assertInstanceSetupToken(SETUP_TOKEN)).not.toThrow();
    });

    test("accepts the correct token with surrounding whitespace", () => {
      expect(() => assertInstanceSetupToken(`  ${SETUP_TOKEN}\n`)).not.toThrow();
    });

    test.each([
      ["missing", undefined],
      ["empty", ""],
      ["whitespace only", "   "],
      ["incorrect", "x".repeat(SETUP_TOKEN.length)],
      ["a prefix of the correct token", SETUP_TOKEN.slice(0, -1)],
      ["longer than the correct token", `${SETUP_TOKEN}0`],
      ["differently cased", SETUP_TOKEN.toUpperCase()]
    ])("rejects a token that is %s", (_label, providedToken) => {
      expectRejected(providedToken);
    });
  });
});
