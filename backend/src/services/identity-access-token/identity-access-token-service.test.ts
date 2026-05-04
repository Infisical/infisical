import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";

import { IdentityAuthMethod, TableName } from "@app/db/schemas";
import { crypto } from "@app/lib/crypto";
import { IPType, TIp } from "@app/lib/ip";

import { AuthTokenType } from "../auth/auth-type";
import { signIdentityAccessToken, verifyAccessTokenJwt } from "./identity-access-token-fns";
import { identityAccessTokenServiceFactory } from "./identity-access-token-service";
import { TIdentityAccessTokenJwtPayload } from "./identity-access-token-types";

const MAX_AGE = 7_776_000;
const AUTH_SECRET = "test-auth-secret";
const NOW_SECONDS = 1_700_000_000;
const ENFORCED_AT = new Date("2026-05-04T00:00:00.000Z");

vi.mock("@app/lib/config/env", () => ({
  getConfig: () => ({
    AUTH_SECRET,
    MAX_MACHINE_IDENTITY_TOKEN_AGE: MAX_AGE,
    LEGACY_IDENTITY_ACCESS_TOKEN_EXPIRATION_ENFORCED_AT: ENFORCED_AT
  })
}));

vi.mock("@app/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn()
  }
}));

const createService = ({
  trustedIps = [],
  membership = { isActive: true },
  activeRevocations = [],
  tokenRow = null
}: {
  trustedIps?: TIp[] | null;
  membership?: { isActive: boolean } | null;
  activeRevocations?: Array<{ id: string; identityId: string; revokedAt?: Date | null; createdAt: Date }>;
  tokenRow?: Record<string, unknown> | null;
} = {}) => {
  const keyStore = {
    getItem: vi.fn().mockResolvedValue(null),
    incrementBy: vi.fn(),
    setItemWithExpiry: vi.fn()
  };
  const identityAccessTokenRevocationDAL = {
    findActiveRevocationsForToken: vi.fn().mockResolvedValue(activeRevocations),
    insertRevocation: vi.fn()
  };
  const identityDAL = {
    getTrustedIpsByAuthMethod: vi.fn().mockResolvedValue(trustedIps),
    findById: vi.fn()
  };
  const orgDAL = {
    findEffectiveOrgMembership: vi.fn().mockResolvedValue(membership)
  };
  const identityAccessTokenDAL = { findOne: vi.fn().mockResolvedValue(tokenRow) };

  const service = identityAccessTokenServiceFactory({
    identityAccessTokenDAL: identityAccessTokenDAL as never,
    identityAccessTokenRevocationDAL: identityAccessTokenRevocationDAL as never,
    identityDAL: identityDAL as never,
    orgDAL: orgDAL as never,
    keyStore: keyStore as never
  });

  return { service, keyStore, identityDAL, orgDAL, identityAccessTokenDAL, identityAccessTokenRevocationDAL };
};

const createTokenClaims = (
  overrides: Partial<TIdentityAccessTokenJwtPayload> = {}
): TIdentityAccessTokenJwtPayload => ({
  jti: "token-id",
  iat: NOW_SECONDS,
  exp: NOW_SECONDS + 3600,
  identityId: "identity-id",
  identityName: "identity-name",
  authMethod: IdentityAuthMethod.UNIVERSAL_AUTH,
  orgId: "org-id",
  rootOrgId: "root-org-id",
  parentOrgId: "parent-org-id",
  ipRestrictionEnabled: false,
  clientSecretId: "",
  identityAccessTokenId: "token-id",
  authTokenType: AuthTokenType.IDENTITY_ACCESS_TOKEN,
  accessTokenTTL: 0,
  accessTokenMaxTTL: 0,
  accessTokenPeriod: 0,
  creationEpoch: NOW_SECONDS,
  identityAuth: {},
  ...overrides
});

const signLegacyUniversalAuthAccessToken = (
  overrides: Partial<TIdentityAccessTokenJwtPayload> = {},
  options: { expiresIn?: number } = { expiresIn: MAX_AGE }
) => {
  const payload = {
    identityId: "identity-id",
    clientSecretId: "",
    identityAccessTokenId: "legacy-token-id",
    authTokenType: AuthTokenType.IDENTITY_ACCESS_TOKEN,
    ...overrides
  };
  const signOptions = options.expiresIn === undefined ? undefined : { expiresIn: options.expiresIn };

  return crypto.jwt().sign(payload, AUTH_SECRET, signOptions);
};

const signLegacyOidcAccessToken = (overrides: Partial<TIdentityAccessTokenJwtPayload> = {}) =>
  crypto.jwt().sign(
    {
      identityId: "identity-id",
      identityAccessTokenId: "legacy-token-id",
      authTokenType: AuthTokenType.IDENTITY_ACCESS_TOKEN,
      identityAuth: {
        oidc: {
          claims: {
            sub: "legacy-sub"
          }
        }
      },
      ...overrides
    },
    AUTH_SECRET,
    {
      expiresIn: MAX_AGE
    }
  );

const createLegacyTokenRow = (overrides: Record<string, unknown> = {}) => ({
  id: "legacy-token-id",
  identityId: "identity-id",
  authMethod: IdentityAuthMethod.UNIVERSAL_AUTH,
  accessTokenTTL: 3600,
  accessTokenMaxTTL: 7200,
  accessTokenPeriod: 0,
  isAccessTokenRevoked: false,
  createdAt: new Date(NOW_SECONDS * 1000),
  identityOrgId: "org-id",
  identityName: "identity-name",
  ...overrides
});

describe("identityAccessTokenServiceFactory", () => {
  let previousFipsEnabled: string | undefined;

  beforeAll(async () => {
    previousFipsEnabled = process.env.FIPS_ENABLED;
    process.env.FIPS_ENABLED = "false";
    await crypto.initialize({} as never, {} as never, {} as never);
  });

  afterAll(() => {
    if (previousFipsEnabled === undefined) {
      delete process.env.FIPS_ENABLED;
    } else {
      process.env.FIPS_ENABLED = previousFipsEnabled;
    }
  });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW_SECONDS * 1000));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  test("writes per-token revocation to PG with the JWT exp for zero configured TTL tokens", async () => {
    const { accessToken } = signIdentityAccessToken({
      identityAccessTokenId: "token-id",
      identityId: "identity-id",
      identityName: "identity-name",
      authMethod: IdentityAuthMethod.UNIVERSAL_AUTH,
      orgId: "org-id",
      rootOrgId: "root-org-id",
      parentOrgId: "parent-org-id",
      clientSecretId: "",
      numUsesLimit: 0,
      ipRestrictionEnabled: false,
      ttlSeconds: MAX_AGE,
      accessTokenTTL: 0,
      accessTokenMaxTTL: 0,
      accessTokenPeriod: 0,
      creationEpoch: NOW_SECONDS,
      identityAuth: {}
    });
    const { service, identityAccessTokenRevocationDAL } = createService();

    await service.revokeAccessToken(accessToken);

    expect(identityAccessTokenRevocationDAL.insertRevocation).toHaveBeenCalledWith({
      id: "token-id",
      identityId: "identity-id",
      expiresAt: new Date((NOW_SECONDS + MAX_AGE) * 1000)
    });
  });

  test("writes identity-wide revocation sentinel to PG", async () => {
    const { service, identityAccessTokenRevocationDAL } = createService();

    await service.revokeAllTokensForIdentity("identity-id");

    expect(identityAccessTokenRevocationDAL.insertRevocation).toHaveBeenCalledWith({
      id: "identity-id",
      identityId: "identity-id",
      revokedAt: new Date(NOW_SECONDS * 1000),
      expiresAt: new Date((NOW_SECONDS + MAX_AGE) * 1000)
    });
  });

  test("writes per-token revocation to PG for exact legacy tokens", async () => {
    const { service, identityAccessTokenRevocationDAL } = createService({
      tokenRow: createLegacyTokenRow()
    });
    const legacyToken = signLegacyUniversalAuthAccessToken();

    await service.revokeAccessToken(legacyToken);

    // Legacy row has accessTokenMaxTTL: 7200, createdAt: NOW_SECONDS
    expect(identityAccessTokenRevocationDAL.insertRevocation).toHaveBeenCalledWith({
      id: "legacy-token-id",
      identityId: "identity-id",
      expiresAt: new Date((NOW_SECONDS + 7200) * 1000)
    });
  });

  test("rejects active per-token PG revocations", async () => {
    const { service } = createService({
      activeRevocations: [{ id: "token-id", identityId: "identity-id", createdAt: new Date(NOW_SECONDS * 1000) }]
    });

    await expect(service.fnValidateIdentityAccessTokenFast(createTokenClaims(), "10.0.0.1")).rejects.toThrow(
      "token has been revoked"
    );
  });

  test("rejects active identity-wide PG revocations for tokens issued before revokedAt", async () => {
    const { service } = createService({
      activeRevocations: [
        {
          id: "identity-id",
          identityId: "identity-id",
          revokedAt: new Date((NOW_SECONDS + 10) * 1000),
          createdAt: new Date((NOW_SECONDS + 10) * 1000)
        }
      ]
    });

    await expect(service.fnValidateIdentityAccessTokenFast(createTokenClaims(), "10.0.0.1")).rejects.toThrow(
      "identity tokens have been revoked"
    );
  });

  test("allows tokens issued after an identity-wide PG revocation", async () => {
    const { service } = createService({
      activeRevocations: [
        {
          id: "identity-id",
          identityId: "identity-id",
          revokedAt: new Date((NOW_SECONDS - 10) * 1000),
          createdAt: new Date((NOW_SECONDS - 10) * 1000)
        }
      ]
    });

    await expect(service.fnValidateIdentityAccessTokenFast(createTokenClaims(), "10.0.0.1")).resolves.toMatchObject({
      identityId: "identity-id",
      orgId: "org-id"
    });
  });

  test("keeps usage counters in Redis", async () => {
    const { service, keyStore } = createService();
    keyStore.getItem.mockResolvedValue("1");
    keyStore.incrementBy.mockResolvedValue(0);

    await expect(
      service.fnValidateIdentityAccessTokenFast(createTokenClaims({ numUsesLimit: 3 }), "10.0.0.1")
    ).resolves.toMatchObject({
      identityId: "identity-id"
    });
    expect(keyStore.incrementBy).toHaveBeenCalledWith("identity-token-uses-remaining:identity-id:token-id", -1);
  });

  test("reseeds a lost Redis usage counter from JWT claims", async () => {
    const { service, keyStore } = createService();
    keyStore.getItem.mockResolvedValue(null);

    await expect(
      service.fnValidateIdentityAccessTokenFast(createTokenClaims({ numUsesLimit: 3 }), "10.0.0.1")
    ).resolves.toMatchObject({
      identityId: "identity-id"
    });
    expect(keyStore.setItemWithExpiry).toHaveBeenCalledWith(
      "identity-token-uses-remaining:identity-id:token-id",
      MAX_AGE,
      2
    );
    expect(keyStore.incrementBy).not.toHaveBeenCalled();
  });

  test("does not require Redis counters for unlimited-use tokens", async () => {
    const { service, keyStore } = createService();

    await expect(service.fnValidateIdentityAccessTokenFast(createTokenClaims(), "10.0.0.1")).resolves.toMatchObject({
      identityId: "identity-id"
    });
    expect(keyStore.setItemWithExpiry).not.toHaveBeenCalled();
    expect(keyStore.incrementBy).not.toHaveBeenCalled();
  });

  test("rejects exhausted Redis usage counters", async () => {
    const { service, keyStore } = createService();
    keyStore.getItem.mockResolvedValue("0");

    await expect(
      service.fnValidateIdentityAccessTokenFast(createTokenClaims({ numUsesLimit: 3 }), "10.0.0.1")
    ).rejects.toThrow("usage limit reached");
  });

  test("rejects renewal when PG says the token is revoked", async () => {
    const { accessToken } = signIdentityAccessToken({
      identityAccessTokenId: "token-id",
      identityId: "identity-id",
      identityName: "identity-name",
      authMethod: IdentityAuthMethod.UNIVERSAL_AUTH,
      orgId: "org-id",
      rootOrgId: "root-org-id",
      parentOrgId: "parent-org-id",
      clientSecretId: "",
      numUsesLimit: 0,
      ipRestrictionEnabled: false,
      ttlSeconds: MAX_AGE,
      accessTokenTTL: 0,
      accessTokenMaxTTL: 0,
      accessTokenPeriod: 0,
      creationEpoch: NOW_SECONDS,
      identityAuth: {}
    });
    const { service } = createService({
      activeRevocations: [{ id: "token-id", identityId: "identity-id", createdAt: new Date(NOW_SECONDS * 1000) }]
    });

    await expect(service.renewAccessToken({ accessToken })).rejects.toThrow("token has been revoked");
  });

  test("renews active new-format tokens and the renewed JWT authenticates", async () => {
    const { accessToken } = signIdentityAccessToken({
      identityAccessTokenId: "token-id",
      identityId: "identity-id",
      identityName: "identity-name",
      authMethod: IdentityAuthMethod.UNIVERSAL_AUTH,
      orgId: "org-id",
      rootOrgId: "root-org-id",
      parentOrgId: "parent-org-id",
      clientSecretId: "",
      numUsesLimit: 0,
      ipRestrictionEnabled: false,
      ttlSeconds: 3600,
      accessTokenTTL: 3600,
      accessTokenMaxTTL: 7200,
      accessTokenPeriod: 0,
      creationEpoch: NOW_SECONDS,
      identityAuth: {}
    });
    const { service } = createService();

    const renewed = await service.renewAccessToken({ accessToken });
    const renewedClaims = verifyAccessTokenJwt(renewed.accessToken);

    expect(renewed.expiresIn).toBe(3600);
    expect(renewedClaims).toMatchObject({
      jti: "token-id",
      identityId: "identity-id",
      authMethod: IdentityAuthMethod.UNIVERSAL_AUTH,
      accessTokenTTL: 3600,
      accessTokenMaxTTL: 7200,
      creationEpoch: NOW_SECONDS
    });
    await expect(service.fnValidateIdentityAccessTokenFast(renewedClaims, "10.0.0.1")).resolves.toMatchObject({
      identityId: "identity-id"
    });
  });

  test("rejects renewal when identity-wide PG revocation is after token iat", async () => {
    const { accessToken } = signIdentityAccessToken({
      identityAccessTokenId: "token-id",
      identityId: "identity-id",
      identityName: "identity-name",
      authMethod: IdentityAuthMethod.UNIVERSAL_AUTH,
      orgId: "org-id",
      rootOrgId: "root-org-id",
      parentOrgId: "parent-org-id",
      clientSecretId: "",
      numUsesLimit: 0,
      ipRestrictionEnabled: false,
      ttlSeconds: 3600,
      accessTokenTTL: 3600,
      accessTokenMaxTTL: 7200,
      accessTokenPeriod: 0,
      creationEpoch: NOW_SECONDS,
      identityAuth: {}
    });
    const { service } = createService({
      activeRevocations: [
        {
          id: "identity-id",
          identityId: "identity-id",
          revokedAt: new Date((NOW_SECONDS + 10) * 1000),
          createdAt: new Date((NOW_SECONDS + 10) * 1000)
        }
      ]
    });

    await expect(service.renewAccessToken({ accessToken })).rejects.toThrow("identity tokens have been revoked");
  });

  test("rejects renewal when Redis usage counter is exhausted", async () => {
    const { accessToken } = signIdentityAccessToken({
      identityAccessTokenId: "token-id",
      identityId: "identity-id",
      identityName: "identity-name",
      authMethod: IdentityAuthMethod.UNIVERSAL_AUTH,
      orgId: "org-id",
      rootOrgId: "root-org-id",
      parentOrgId: "parent-org-id",
      clientSecretId: "",
      numUsesLimit: 2,
      ipRestrictionEnabled: false,
      ttlSeconds: 3600,
      accessTokenTTL: 3600,
      accessTokenMaxTTL: 7200,
      accessTokenPeriod: 0,
      creationEpoch: NOW_SECONDS,
      identityAuth: {}
    });
    const { service, keyStore } = createService();
    keyStore.getItem.mockResolvedValue("0");

    await expect(service.renewAccessToken({ accessToken })).rejects.toThrow("Cannot renew exhausted access token");
  });

  test("authenticates exact legacy Universal Auth tokens from their PG row", async () => {
    const { service, identityAccessTokenDAL, orgDAL } = createService({ tokenRow: createLegacyTokenRow() });
    const legacyToken = signLegacyUniversalAuthAccessToken();
    const legacyClaims = verifyAccessTokenJwt(legacyToken);

    expect(legacyClaims.jti).toBeUndefined();
    expect(legacyClaims.orgId).toBeUndefined();
    await expect(service.fnValidateIdentityAccessTokenFast(legacyClaims, "10.0.0.1")).resolves.toMatchObject({
      identityId: "identity-id",
      orgId: "org-id",
      rootOrgId: "org-id",
      parentOrgId: "org-id"
    });
    expect(identityAccessTokenDAL.findOne).toHaveBeenCalledWith({
      [`${TableName.IdentityAccessToken}.id`]: "legacy-token-id"
    });
    expect(orgDAL.findEffectiveOrgMembership).toHaveBeenCalledWith({
      actorType: "identity",
      actorId: "identity-id",
      orgId: "org-id",
      status: "accepted"
    });
  });

  test("preserves legacy method-specific auth details during renewal", async () => {
    const { service } = createService({
      tokenRow: createLegacyTokenRow({ authMethod: IdentityAuthMethod.OIDC_AUTH })
    });
    const legacyToken = signLegacyOidcAccessToken();

    const renewed = await service.renewAccessToken({ accessToken: legacyToken });
    const renewedClaims = verifyAccessTokenJwt(renewed.accessToken);

    expect(renewedClaims.identityAuth).toEqual({
      oidc: {
        claims: {
          sub: "legacy-sub"
        }
      }
    });
  });

  test("rejects legacy auth when org claims are missing and the PG row is missing", async () => {
    const { service } = createService({ tokenRow: null });
    const legacyToken = signLegacyUniversalAuthAccessToken();
    const legacyClaims = verifyAccessTokenJwt(legacyToken);

    await expect(service.fnValidateIdentityAccessTokenFast(legacyClaims, "10.0.0.1")).rejects.toThrow(
      "Cannot renew revoked or unknown access token"
    );
  });

  test("renews legacy tokens from their PG row into new-format tokens", async () => {
    const { service } = createService({ tokenRow: createLegacyTokenRow() });
    const legacyToken = signLegacyUniversalAuthAccessToken();

    const renewed = await service.renewAccessToken({ accessToken: legacyToken });
    const renewedClaims = verifyAccessTokenJwt(renewed.accessToken);

    expect(renewed.expiresIn).toBe(3600);
    expect(renewedClaims).toMatchObject({
      jti: "legacy-token-id",
      identityId: "identity-id",
      authMethod: IdentityAuthMethod.UNIVERSAL_AUTH,
      accessTokenTTL: 3600,
      accessTokenMaxTTL: 7200,
      accessTokenPeriod: 0,
      creationEpoch: NOW_SECONDS
    });
  });

  test("renews no-exp legacy tokens with old iat during the deployment grace window", async () => {
    const { service } = createService({ tokenRow: createLegacyTokenRow() });
    const legacyToken = signLegacyUniversalAuthAccessToken(
      { iat: NOW_SECONDS - MAX_AGE - 1 },
      { expiresIn: undefined }
    );

    const renewed = await service.renewAccessToken({ accessToken: legacyToken });
    const renewedClaims = verifyAccessTokenJwt(renewed.accessToken);

    expect(renewedClaims).toMatchObject({
      jti: "legacy-token-id",
      identityId: "identity-id",
      authMethod: IdentityAuthMethod.UNIVERSAL_AUTH
    });
  });

  test("rejects no-exp legacy renewal after deployment plus MAX_MACHINE_IDENTITY_TOKEN_AGE", async () => {
    const { service } = createService({ tokenRow: createLegacyTokenRow() });
    const legacyToken = signLegacyUniversalAuthAccessToken({}, { expiresIn: undefined });
    vi.setSystemTime(new Date(ENFORCED_AT.getTime() + MAX_AGE * 1000 + 1));

    await expect(service.renewAccessToken({ accessToken: legacyToken })).rejects.toThrow("exceeded max age");
  });

  test("rejects legacy renewal when the PG row is missing", async () => {
    const { service } = createService({ tokenRow: null });
    const legacyToken = signLegacyUniversalAuthAccessToken();

    await expect(service.renewAccessToken({ accessToken: legacyToken })).rejects.toThrow(
      "Cannot renew revoked or unknown access token"
    );
  });

  test("rejects legacy renewal when the PG row is revoked", async () => {
    const { service } = createService({
      tokenRow: createLegacyTokenRow({ isAccessTokenRevoked: true })
    });
    const legacyToken = signLegacyUniversalAuthAccessToken();

    await expect(service.renewAccessToken({ accessToken: legacyToken })).rejects.toThrow(
      "Cannot renew revoked or unknown access token"
    );
  });

  test("rejects legacy renewal when the row maxTTL budget is exhausted", async () => {
    const { service } = createService({
      tokenRow: createLegacyTokenRow({
        accessTokenTTL: 3600,
        accessTokenMaxTTL: 3600,
        createdAt: new Date((NOW_SECONDS - 3600) * 1000)
      })
    });
    const legacyToken = signLegacyUniversalAuthAccessToken();

    await expect(service.renewAccessToken({ accessToken: legacyToken })).rejects.toThrow("has reached its max TTL");
  });

  test("allows legacy JWTs without exp until deployment plus MAX_MACHINE_IDENTITY_TOKEN_AGE", async () => {
    const { service } = createService();

    await expect(
      service.fnValidateIdentityAccessTokenFast(
        createTokenClaims({ exp: undefined, iat: NOW_SECONDS - MAX_AGE - 1 }),
        "10.0.0.1"
      )
    ).resolves.toMatchObject({ identityId: "identity-id" });
  });

  test("rejects legacy JWTs without exp after deployment plus MAX_MACHINE_IDENTITY_TOKEN_AGE", async () => {
    const { service } = createService();
    vi.setSystemTime(new Date(ENFORCED_AT.getTime() + MAX_AGE * 1000 + 1));

    await expect(
      service.fnValidateIdentityAccessTokenFast(createTokenClaims({ exp: undefined, iat: NOW_SECONDS }), "10.0.0.1")
    ).rejects.toThrow("exceeded max age");
  });

  test("checks current trusted IPs even when the token was issued without IP restrictions", async () => {
    const { service, identityDAL } = createService({
      trustedIps: [{ ipAddress: "10.0.0.0", prefix: 24, type: IPType.IPV4 }]
    });

    await expect(service.fnValidateIdentityAccessTokenFast(createTokenClaims(), "192.168.1.1")).rejects.toThrow(
      "current IP address"
    );
    expect(identityDAL.getTrustedIpsByAuthMethod).toHaveBeenCalledWith(
      "identity-id",
      IdentityAuthMethod.UNIVERSAL_AUTH
    );
  });

  test("allows wildcard current trusted IPs", async () => {
    const { service } = createService({
      trustedIps: [{ ipAddress: "0.0.0.0/0", prefix: 0, type: IPType.IPV4 }]
    });

    await expect(service.fnValidateIdentityAccessTokenFast(createTokenClaims(), "192.168.1.1")).resolves.toMatchObject({
      identityId: "identity-id",
      orgId: "org-id"
    });
  });

  test("rejects when the identity no longer has an effective org membership", async () => {
    const { service } = createService({ membership: null });

    await expect(service.fnValidateIdentityAccessTokenFast(createTokenClaims(), "10.0.0.1")).rejects.toThrow(
      "not a member"
    );
  });

  test("rejects when the identity org membership is inactive", async () => {
    const { service } = createService({ membership: { isActive: false } });

    await expect(service.fnValidateIdentityAccessTokenFast(createTokenClaims(), "10.0.0.1")).rejects.toThrow(
      "membership is inactive"
    );
  });
});
