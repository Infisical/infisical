import { afterAll, beforeAll, beforeEach, describe, expect, onTestFinished, test, vi } from "vitest";

import { crypto } from "@app/lib/crypto/cryptography";
import { breachedRangeResponse } from "@app/lib/validator/breached-password.test-utils";

import { authPaswordServiceFactory } from "./auth-password-service";
import { ResetPasswordV2Type } from "./auth-password-type";
import { AuthMethod } from "./auth-type";

const mocks = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock("@app/lib/config/env", () => ({
  getConfig: () => ({ SALT_ROUNDS: 4, BREACHED_PASSWORD_CHECK_ENABLED: true })
}));
vi.mock("@app/lib/config/request", () => ({ request: { get: mocks.get } }));
vi.mock("@app/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const CURRENT_PASSWORD = "Current-Password-7!";
const BREACHED_PASSWORD = "Breached-Password-7!";

const setup = async () => {
  const keyStore = { setItemWithExpiryNX: vi.fn() };
  const tokenService = { validateTokenForUser: vi.fn() };
  const user = {
    isAccepted: true,
    isEmailVerified: true,
    authMethods: [AuthMethod.EMAIL],
    hashedPassword: await crypto.hashing().createHash(CURRENT_PASSWORD, 4)
  };
  const service = authPaswordServiceFactory({
    keyStore,
    tokenService: tokenService as never,
    userDAL: { findById: vi.fn().mockResolvedValue(user) } as never,
    authDAL: {} as never,
    smtpService: {} as never,
    totpConfigDAL: {} as never
  });
  return { keyStore, tokenService, service };
};

beforeAll(async () => {
  process.env.FIPS_ENABLED = "false";
  await crypto.initialize(async () => null);
});

afterAll(() => {
  delete process.env.FIPS_ENABLED;
});

beforeEach(() => {
  mocks.get.mockReset();
  mocks.get.mockResolvedValue(breachedRangeResponse(BREACHED_PASSWORD));
});

describe("breached password", () => {
  test("is rejected before the recovery token is claimed", async () => {
    const { keyStore, service } = await setup();

    await expect(
      service.resetPasswordV2({
        type: ResetPasswordV2Type.Recovery,
        userId: "user-id",
        newPassword: BREACHED_PASSWORD,
        recoveryTokenJti: "jti",
        recoveryTokenExpiresAt: Math.floor(Date.now() / 1000) + 600
      })
    ).rejects.toThrow("known data breach");
    expect(keyStore.setItemWithExpiryNX).not.toHaveBeenCalled();
  });

  test("is checked only after the current password is verified", async () => {
    const { service } = await setup();

    await expect(
      service.resetPasswordV2({
        type: ResetPasswordV2Type.LoggedInReset,
        userId: "user-id",
        oldPassword: "Not-The-Current-Password-7!",
        newPassword: BREACHED_PASSWORD
      })
    ).rejects.toThrow("Incorrect current password.");
    expect(mocks.get).not.toHaveBeenCalled();
  });

  test("is rejected before the setup token is validated", async () => {
    const { tokenService, service } = await setup();

    await expect(
      service.setupPassword({ password: BREACHED_PASSWORD, token: "123456" }, { id: "user-id" } as never)
    ).rejects.toThrow("known data breach");
    expect(tokenService.validateTokenForUser).not.toHaveBeenCalled();
  });
});

test("refuses a recovery token that expires during the lookup", async () => {
  const { keyStore, service } = await setup();
  const expiresAt = Math.floor(Date.now() / 1000) + 60;
  const now = vi.spyOn(Date, "now");
  onTestFinished(() => now.mockRestore());
  mocks.get.mockImplementation(async () => {
    now.mockReturnValue((expiresAt + 1) * 1000);
    return { data: "" };
  });

  await expect(
    service.resetPasswordV2({
      type: ResetPasswordV2Type.Recovery,
      userId: "user-id",
      newPassword: "Not-In-The-List-7!",
      recoveryTokenJti: "jti",
      recoveryTokenExpiresAt: expiresAt
    })
  ).rejects.toThrow("Invalid recovery token");
  expect(keyStore.setItemWithExpiryNX).not.toHaveBeenCalled();
});
