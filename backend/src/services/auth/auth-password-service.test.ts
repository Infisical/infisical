import { describe, expect, test, vi } from "vitest";

import { isPasswordBreached } from "@app/lib/validator/breached-password";

import { authPaswordServiceFactory } from "./auth-password-service";
import { ResetPasswordV2Type } from "./auth-password-type";
import { AuthMethod } from "./auth-type";

vi.mock("@app/lib/config/env", () => ({ getConfig: () => ({ SALT_ROUNDS: 10 }) }));
vi.mock("@app/lib/crypto/cryptography", () => ({ crypto: { hashing: () => ({ compareHash: async () => false }) } }));
vi.mock("@app/lib/validator/breached-password", () => ({ isPasswordBreached: vi.fn().mockResolvedValue(true) }));

const setup = () => {
  const keyStore = { setItemWithExpiryNX: vi.fn() };
  const tokenService = { validateTokenForUser: vi.fn() };
  const user = { isAccepted: true, isEmailVerified: true, authMethods: [AuthMethod.EMAIL], hashedPassword: "hash" };
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

describe("breached password", () => {
  test("is rejected before the recovery token is claimed", async () => {
    const { keyStore, service } = setup();

    await expect(
      service.resetPasswordV2({
        type: ResetPasswordV2Type.Recovery,
        userId: "user-id",
        newPassword: "a breached password",
        recoveryTokenJti: "jti",
        recoveryTokenExpiresAt: Math.floor(Date.now() / 1000) + 600
      })
    ).rejects.toThrow("known data breach");
    expect(keyStore.setItemWithExpiryNX).not.toHaveBeenCalled();
  });

  test("is checked only after the current password is verified", async () => {
    const { service } = setup();

    await expect(
      service.resetPasswordV2({
        type: ResetPasswordV2Type.LoggedInReset,
        userId: "user-id",
        oldPassword: "not the current password",
        newPassword: "a breached password"
      })
    ).rejects.toThrow("Incorrect current password.");
  });

  test("is rejected before the setup token is validated", async () => {
    const { tokenService, service } = setup();

    await expect(
      service.setupPassword({ password: "a breached password", token: "123456" }, { id: "user-id" } as never)
    ).rejects.toThrow("known data breach");
    expect(tokenService.validateTokenForUser).not.toHaveBeenCalled();
  });
});

test("refuses a recovery token that expires during the lookup", async () => {
  vi.mocked(isPasswordBreached).mockResolvedValueOnce(false);
  const { keyStore, service } = setup();

  await expect(
    service.resetPasswordV2({
      type: ResetPasswordV2Type.Recovery,
      userId: "user-id",
      newPassword: "a safe password",
      recoveryTokenJti: "jti",
      recoveryTokenExpiresAt: Math.floor(Date.now() / 1000) - 1
    })
  ).rejects.toThrow("Invalid recovery token");
  expect(keyStore.setItemWithExpiryNX).not.toHaveBeenCalled();
});
