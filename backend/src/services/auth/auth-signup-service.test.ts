import { afterAll, beforeAll, beforeEach, expect, test, vi } from "vitest";

import { crypto } from "@app/lib/crypto/cryptography";
import { BREACHED_PASSWORD_ERROR_NAME } from "@app/lib/validator/breached-password";
import { breachedRangeResponse } from "@app/lib/validator/breached-password.test-utils";

import { authSignupServiceFactory } from "./auth-signup-service";
import { CompleteAccountType } from "./auth-signup-type";
import { AuthTokenType } from "./auth-type";

const mocks = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock("@app/lib/config/env", () => ({
  getConfig: () => ({ AUTH_SECRET: "test-secret", SALT_ROUNDS: 4, BREACHED_PASSWORD_CHECK_ENABLED: true })
}));
vi.mock("@app/lib/config/request", () => ({ request: { get: mocks.get } }));
vi.mock("@app/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const BREACHED_PASSWORD = "Breached-Password-7!";

const completeEmailSignup = (user: { isAccepted: boolean }) => {
  const authDAL = { transaction: vi.fn() };
  const service = authSignupServiceFactory({
    authDAL,
    userDAL: { findById: vi.fn().mockResolvedValue({ id: "user-id", ...user }) }
  } as never);
  const token = crypto
    .jwt()
    .sign({ authTokenType: AuthTokenType.SIGNUP_TOKEN, userId: "user-id" }, "test-secret", { expiresIn: "5m" });

  const result = service.completeAccount({
    type: CompleteAccountType.Email,
    authorization: `Bearer ${token}`,
    email: "ada@example.com",
    firstName: "Ada",
    password: BREACHED_PASSWORD,
    ip: "127.0.0.1",
    userAgent: "vitest"
  });
  return { authDAL, result };
};

beforeAll(async () => {
  process.env.FIPS_ENABLED = "false";
  await crypto.initialize({} as never);
});

afterAll(() => {
  delete process.env.FIPS_ENABLED;
});

beforeEach(() => {
  mocks.get.mockReset();
  mocks.get.mockResolvedValue(breachedRangeResponse(BREACHED_PASSWORD));
});

test("signup refuses a breached password before completing the account", async () => {
  const { authDAL, result } = completeEmailSignup({ isAccepted: false });

  await expect(result).rejects.toMatchObject({
    name: BREACHED_PASSWORD_ERROR_NAME,
    message: "This password has appeared in a known data breach. Choose a different password."
  });
  expect(authDAL.transaction).not.toHaveBeenCalled();
});

test("signup runs the breach lookup for a refused token too and reports the token error", async () => {
  const { authDAL, result } = completeEmailSignup({ isAccepted: true });

  await expect(result).rejects.toThrow("Invalid token");
  expect(mocks.get).toHaveBeenCalledTimes(1);
  expect(authDAL.transaction).not.toHaveBeenCalled();
});
