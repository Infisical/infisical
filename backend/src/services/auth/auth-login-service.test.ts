import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";

import { crypto } from "@app/lib/crypto/cryptography";

import { authLoginServiceFactory } from "./auth-login-service";
import { AuthMethod, ProviderAuthResult } from "./auth-type";

vi.mock("@app/lib/config/env", () => ({
  getConfig: () => ({
    SITE_URL: "https://app.example.com",
    AUTH_SECRET: "test-secret-for-auth-login-unit-tests",
    JWT_AUTH_LIFETIME: "1h",
    JWT_REFRESH_LIFETIME: "1d",
    JWT_SIGNUP_LIFETIME: "15m"
  })
}));

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }
}));

vi.mock("@app/services/super-admin/super-admin-service", () => ({
  getServerCfg: vi.fn(async () => ({ allowSignUp: true }))
}));

type TDeps = Parameters<typeof authLoginServiceFactory>[0];

const googleLogin = {
  email: "alice@mailinator.com",
  firstName: "Alice",
  authMethod: AuthMethod.GOOGLE,
  providerUserId: "google-1",
  isEmailVerifiedByProvider: true,
  ip: "127.0.0.1",
  userAgent: "test"
};

const existingAccount = ({
  email = "alice@corp.com",
  alias
}: {
  email?: string;
  alias?: { email: string; isEmailVerified: boolean };
}) => {
  const user = {
    id: "user-1",
    username: email,
    email,
    isAccepted: true,
    isEmailVerified: true,
    authMethods: [AuthMethod.GOOGLE]
  };
  const aliasRow = alias && {
    id: "alias-1",
    userId: "user-1",
    emails: [alias.email],
    isEmailVerified: alias.isEmailVerified
  };
  const userDAL = {
    findById: vi.fn().mockResolvedValue(user),
    findOne: vi.fn().mockResolvedValue(aliasRow ? undefined : user),
    updateById: vi.fn(async (_id: string, data: object) => ({ ...user, ...data })),
    transaction: vi.fn(async (cb: (tx: object) => unknown) => cb({}))
  };
  const userAliasDAL = {
    findOne: vi.fn().mockResolvedValue(aliasRow),
    create: vi.fn(async (data: object) => ({ id: "alias-1", ...data })),
    updateById: vi.fn(async (_id: string, data: object) => ({ ...aliasRow, ...data }))
  };
  const smtpService = { sendMail: vi.fn() };
  const service = authLoginServiceFactory({
    userDAL,
    userAliasDAL,
    smtpService,
    tokenService: {
      createTokenForUser: vi.fn().mockResolvedValue("123456"),
      getUserTokenSession: vi.fn().mockResolvedValue({ id: "session-1", accessVersion: 1, refreshVersion: 1 })
    },
    mfaLockoutService: { clearRecentMfaAuth: vi.fn() }
  } as unknown as TDeps);

  return { service, userDAL, userAliasDAL, smtpService };
};

describe("oauth2Login", () => {
  beforeAll(async () => {
    vi.stubEnv("FIPS_ENABLED", "false");
    await crypto.initialize({} as never, {} as never, {} as never);
  });

  afterAll(() => {
    vi.unstubAllEnvs();
  });

  test("refuses to create an account on a disposable email domain", async () => {
    const userDAL = { findOne: vi.fn().mockResolvedValue(undefined), transaction: vi.fn() };
    const service = authLoginServiceFactory({
      userDAL,
      userAliasDAL: { findOne: vi.fn().mockResolvedValue(undefined) }
    } as unknown as TDeps);

    await expect(service.oauth2Login(googleLogin)).rejects.toThrow(
      "Email address 'alice@mailinator.com' is from a disposable email provider. Sign in with an account that uses a different email address."
    );
    expect(userDAL.transaction).not.toHaveBeenCalled();
  });

  test("keeps the account's email when the provider now asserts a disposable address", async () => {
    const { service, userDAL, userAliasDAL } = existingAccount({
      alias: { email: "alice@corp.com", isEmailVerified: true }
    });

    const login = await service.oauth2Login(googleLogin);

    expect(login.result).toBe(ProviderAuthResult.SESSION);
    expect(login.user.email).toBe("alice@corp.com");
    expect(userDAL.updateById).not.toHaveBeenCalled();
    expect(userAliasDAL.updateById).not.toHaveBeenCalled();
  });

  test("sends a code to the account's email when an unverified alias asserts a disposable address", async () => {
    const { service, userAliasDAL, smtpService } = existingAccount({
      alias: { email: "alice@mailinator.com", isEmailVerified: false }
    });

    const login = await service.oauth2Login(googleLogin);

    expect(login.result).toBe(ProviderAuthResult.SIGNUP_REQUIRED);
    expect(userAliasDAL.updateById).not.toHaveBeenCalled();
    expect(smtpService.sendMail).toHaveBeenCalledWith(expect.objectContaining({ recipients: ["alice@corp.com"] }));
  });

  test("signs in an existing account whose own email is on a disposable domain", async () => {
    const { service, userAliasDAL, smtpService } = existingAccount({ email: "alice@mailinator.com" });

    const login = await service.oauth2Login(googleLogin);

    expect(login.result).toBe(ProviderAuthResult.SESSION);
    expect(userAliasDAL.create).toHaveBeenCalledWith(expect.objectContaining({ isEmailVerified: true }));
    expect(smtpService.sendMail).not.toHaveBeenCalled();
  });
});
