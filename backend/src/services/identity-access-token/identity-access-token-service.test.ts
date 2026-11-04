import * as x509 from "@peculiar/x509";
import jwt from "jsonwebtoken";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";

import { IdentityAuthMethod, TableName } from "@app/db/schemas";
import { crypto } from "@app/lib/crypto";
import { IPType, TIp } from "@app/lib/ip";

import { AuthTokenType } from "../auth/auth-type";
import {
  computeCertificateThumbprint,
  signIdentityAccessToken,
  verifyAccessTokenJwt
} from "./identity-access-token-fns";
import { identityAccessTokenServiceFactory } from "./identity-access-token-service";
import { CERTIFICATE_THUMBPRINT_CLAIM, TIdentityAccessTokenJwtPayload } from "./identity-access-token-types";

const MAX_AGE = 7_776_000;
const AUTH_SECRET = "test-auth-secret";
const NOW_SECONDS = 1_700_000_000;
const ENFORCED_AT = new Date("2026-05-04T00:00:00.000Z");
// Mirror IDENTITY_REVOCATION_MARKER_SKEW_SECONDS from identity-access-token-fns.
const MARKER_SKEW_SECONDS = 300;

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
    warn: vi.fn(),
    error: vi.fn()
  }
}));

const createService = ({
  trustedIps = [],
  membership = { isActive: true },
  org = { id: "org-id" },
  activeRevocations = [],
  tokenRow = null
}: {
  trustedIps?: TIp[] | null;
  membership?: { isActive: boolean } | null;
  org?: { id: string; rootOrgId?: string; parentOrgId?: string };
  activeRevocations?: Array<{
    id: string;
    identityId: string;
    revokedAt?: Date | null;
    createdAt: Date;
    scope?: string | null;
  }>;
  tokenRow?: Record<string, unknown> | null;
} = {}) => {
  const keyStore = {
    getItem: vi.fn().mockResolvedValue(null),
    getItemPrimary: vi.fn(),
    decrementIfExists: vi.fn(),
    setItemWithExpiry: vi.fn(),
    setItemWithExpiryNX: vi.fn().mockResolvedValue("OK"),
    incrementSeededWithExpiry: vi.fn().mockResolvedValue(1),
    deleteItem: vi.fn().mockResolvedValue(1)
  };
  // getItemPrimary shares the getItem mock so tests that stub getItem by key also
  // cover the primary-pinned version reads.
  keyStore.getItemPrimary.mockImplementation(
    (key: string, prefix?: string) => keyStore.getItem(key, prefix) as Promise<string | null>
  );
  const identityAccessTokenRevocationDAL = {
    findActiveRevocationsForToken: vi.fn().mockResolvedValue(activeRevocations),
    insertRevocation: vi.fn(),
    deleteRevocationsByScope: vi.fn()
  };
  const identityDAL = {
    getTrustedIpsByAuthMethod: vi.fn().mockResolvedValue(trustedIps),
    findById: vi.fn()
  };
  const orgDAL = {
    findEffectiveOrgMembership: vi.fn().mockResolvedValue(membership),
    findOne: vi.fn().mockResolvedValue(org)
  };
  const identityAccessTokenDAL = { findOne: vi.fn().mockResolvedValue(tokenRow) };

  const service = identityAccessTokenServiceFactory({
    identityAccessTokenDAL: identityAccessTokenDAL as never,
    identityAccessTokenRevocationDAL: identityAccessTokenRevocationDAL as never,
    identityDAL: identityDAL as never,
    orgDAL: orgDAL as never,
    keyStore: keyStore as never
  });

  return {
    service,
    keyStore,
    identityDAL,
    orgDAL,
    identityAccessTokenDAL,
    identityAccessTokenRevocationDAL
  };
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

    // maxTTL=0/TTL=0: irreducible ~90d marker (now + ceiling), plus the skew buffer.
    expect(identityAccessTokenRevocationDAL.insertRevocation).toHaveBeenCalledWith({
      id: "token-id",
      identityId: "identity-id",
      expiresAt: new Date((NOW_SECONDS + MAX_AGE + MARKER_SKEW_SECONDS) * 1000)
    });
  });

  test("writes identity-wide revocation sentinel to PG", async () => {
    const { service, identityAccessTokenRevocationDAL } = createService();

    await service.revokeAllTokensForIdentity("identity-id");

    expect(identityAccessTokenRevocationDAL.insertRevocation).toHaveBeenCalledWith(
      {
        id: "identity-id",
        identityId: "identity-id",
        revokedAt: new Date(NOW_SECONDS * 1000),
        expiresAt: new Date((NOW_SECONDS + MAX_AGE) * 1000)
      },
      undefined
    );
  });

  test("insertIdentityWideRevocationMarker writes the sentinel in the caller tx without bumping", async () => {
    const { service, identityAccessTokenRevocationDAL, keyStore } = createService();
    const tx = {} as unknown as Parameters<typeof service.insertIdentityWideRevocationMarker>[0]["tx"];

    await service.insertIdentityWideRevocationMarker({ identityId: "identity-id", tx });

    expect(identityAccessTokenRevocationDAL.insertRevocation).toHaveBeenCalledWith(
      {
        id: "identity-id",
        identityId: "identity-id",
        revokedAt: new Date(NOW_SECONDS * 1000),
        expiresAt: new Date((NOW_SECONDS + MAX_AGE) * 1000)
      },
      tx
    );
    // The bump runs post-commit in the caller, never inside the marker insert.
    expect(keyStore.incrementSeededWithExpiry).not.toHaveBeenCalled();
  });

  test("writes per-token revocation to PG for exact legacy tokens", async () => {
    const { service, identityAccessTokenRevocationDAL } = createService({
      tokenRow: createLegacyTokenRow()
    });
    const legacyToken = signLegacyUniversalAuthAccessToken();

    await service.revokeAccessToken(legacyToken);

    // Legacy row has accessTokenMaxTTL: 7200, createdAt: NOW_SECONDS. The marker
    // is clamped to creationEpoch+maxTTL (the legacy upper bound) plus the skew.
    expect(identityAccessTokenRevocationDAL.insertRevocation).toHaveBeenCalledWith({
      id: "legacy-token-id",
      identityId: "identity-id",
      expiresAt: new Date((NOW_SECONDS + 7200 + MARKER_SKEW_SECONDS) * 1000)
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
    keyStore.decrementIfExists.mockResolvedValue(0);

    await expect(
      service.fnValidateIdentityAccessTokenFast(createTokenClaims({ numUsesLimit: 3 }), "10.0.0.1")
    ).resolves.toMatchObject({
      identityId: "identity-id"
    });
    expect(keyStore.decrementIfExists).toHaveBeenCalledWith("identity-token-uses-remaining:identity-id:token-id");
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
      MAX_AGE + MARKER_SKEW_SECONDS,
      2
    );
    expect(keyStore.decrementIfExists).not.toHaveBeenCalled();
  });

  test("reseeds a lost counter to outlive every renewed JWT, not just the one presented", async () => {
    const { service, keyStore } = createService();
    keyStore.getItem.mockResolvedValue(null);

    // The presented JWT has 10 minutes left, but the token's maxTTL budget allows renewed JWTs for
    // another 90 minutes, and they all share this counter.
    await service.fnValidateIdentityAccessTokenFast(
      createTokenClaims({
        numUsesLimit: 3,
        exp: NOW_SECONDS + 600,
        accessTokenTTL: 3600,
        accessTokenMaxTTL: 7200,
        creationEpoch: NOW_SECONDS - 1800
      }),
      "10.0.0.1"
    );
    expect(keyStore.setItemWithExpiry).toHaveBeenCalledWith(
      "identity-token-uses-remaining:identity-id:token-id",
      5400 + MARKER_SKEW_SECONDS,
      2
    );
  });

  test("reseeds a lost counter for a legacy JWT with no exp to last through the legacy window", async () => {
    // Thirty days into the legacy window, with the row's maxTTL budget long spent. The JWT still
    // authenticates, so the counter has to outlive it rather than the spent budget.
    const thirtyDays = 30 * 24 * 60 * 60;
    vi.setSystemTime(new Date(ENFORCED_AT.getTime() + thirtyDays * 1000));
    const { service, keyStore } = createService({
      tokenRow: createLegacyTokenRow({ accessTokenNumUsesLimit: 3 })
    });
    const legacyClaims = verifyAccessTokenJwt(signLegacyUniversalAuthAccessToken({}, { expiresIn: undefined }));
    expect(legacyClaims.exp).toBeUndefined();

    await expect(service.fnValidateIdentityAccessTokenFast(legacyClaims, "10.0.0.1")).resolves.toMatchObject({
      identityId: "identity-id"
    });
    expect(keyStore.setItemWithExpiry).toHaveBeenCalledWith(
      "identity-token-uses-remaining:identity-id:legacy-token-id",
      MAX_AGE - thirtyDays + MARKER_SKEW_SECONDS,
      2
    );
  });

  test("does not reseed a lost counter for a JWT that expired after it was verified", async () => {
    const { service, keyStore } = createService();
    keyStore.getItem.mockImplementation(async (key: string) => {
      if (key.startsWith("identity-token-uses-remaining:")) {
        vi.setSystemTime(new Date((NOW_SECONDS + 3600) * 1000));
      }
      return null;
    });

    await expect(
      service.fnValidateIdentityAccessTokenFast(createTokenClaims({ numUsesLimit: 3 }), "10.0.0.1")
    ).rejects.toThrow(jwt.TokenExpiredError);
    expect(keyStore.setItemWithExpiry).not.toHaveBeenCalledWith(
      expect.stringContaining("identity-token-uses-remaining:"),
      expect.anything(),
      expect.anything()
    );
  });

  test("rejects without recreating a counter that expired between the read and the decrement", async () => {
    const { service, keyStore } = createService();
    keyStore.getItem.mockResolvedValue("2");
    keyStore.decrementIfExists.mockResolvedValue(null);

    await expect(
      service.fnValidateIdentityAccessTokenFast(createTokenClaims({ numUsesLimit: 3 }), "10.0.0.1")
    ).rejects.toThrow("could not be recorded");
    expect(keyStore.setItemWithExpiry).not.toHaveBeenCalledWith(
      expect.stringContaining("identity-token-uses-remaining:"),
      expect.anything(),
      expect.anything()
    );
  });

  test("seeds the usage counter at issuance to expire with the token, not the ceiling", async () => {
    const { service, keyStore } = createService();

    await service.issueIdentityAccessToken({
      identityId: "identity-id",
      identityName: "identity-name",
      authMethod: IdentityAuthMethod.UNIVERSAL_AUTH,
      orgId: "org-id",
      rootOrgId: "root-org-id",
      parentOrgId: "parent-org-id",
      subOrganizationId: null,
      accessTokenTTL: 600,
      accessTokenMaxTTL: 0,
      accessTokenNumUsesLimit: 1,
      accessTokenPeriod: 0,
      accessTokenTrustedIps: []
    });

    expect(keyStore.setItemWithExpiry).toHaveBeenCalledWith(
      expect.stringMatching(/^identity-token-uses-remaining:identity-id:/),
      600 + MARKER_SKEW_SECONDS,
      1
    );
  });

  test("reseeds the usage counter on renewal to expire with the renewed token", async () => {
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
    keyStore.getItem.mockResolvedValue("1");

    await service.renewAccessToken({ accessToken });

    expect(keyStore.setItemWithExpiry).toHaveBeenCalledWith(
      "identity-token-uses-remaining:identity-id:token-id",
      3600 + MARKER_SKEW_SECONDS,
      1
    );
  });

  test("does not renew with a fresh budget when the JWT expired after it was verified", async () => {
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
    keyStore.getItem.mockImplementation(async (key: string) => {
      if (key.startsWith("identity-token-uses-remaining:")) {
        vi.setSystemTime(new Date((NOW_SECONDS + 3600) * 1000));
      }
      return null;
    });

    await expect(service.renewAccessToken({ accessToken })).rejects.toThrow(jwt.TokenExpiredError);
    expect(keyStore.setItemWithExpiry).not.toHaveBeenCalledWith(
      expect.stringContaining("identity-token-uses-remaining:"),
      expect.anything(),
      expect.anything()
    );
  });

  test("does not require Redis counters for unlimited-use tokens", async () => {
    const { service, keyStore } = createService();

    await expect(service.fnValidateIdentityAccessTokenFast(createTokenClaims(), "10.0.0.1")).resolves.toMatchObject({
      identityId: "identity-id"
    });
    expect(keyStore.setItemWithExpiry).not.toHaveBeenCalledWith(
      expect.stringContaining("identity-token-uses-remaining:"),
      expect.anything(),
      expect.anything()
    );
    expect(keyStore.decrementIfExists).not.toHaveBeenCalled();
    expect(keyStore.setItemWithExpiry).toHaveBeenCalledWith(
      "identity-trusted-ips:identity-id:universal-auth",
      300,
      expect.any(String)
    );
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

  test("tightens the per-token marker to the JWT exp plus one issuance TTL and skew", async () => {
    // TTL=2h, maxTTL=30d: marker should self-drain ~2h after exp, not in 30d.
    const twoHours = 7200;
    const thirtyDays = 2_592_000;
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
      ttlSeconds: twoHours,
      accessTokenTTL: twoHours,
      accessTokenMaxTTL: thirtyDays,
      accessTokenPeriod: 0,
      creationEpoch: NOW_SECONDS,
      identityAuth: {}
    });
    const { service, identityAccessTokenRevocationDAL } = createService();

    await service.revokeAccessToken(accessToken);

    // exp = NOW + 2h; cap = min(2h, ceiling) = 2h; clamped by creationEpoch+maxTTL
    // (NOW + 30d) → exp + 2h wins; plus skew.
    expect(identityAccessTokenRevocationDAL.insertRevocation).toHaveBeenCalledWith({
      id: "token-id",
      identityId: "identity-id",
      expiresAt: new Date((NOW_SECONDS + twoHours + twoHours + MARKER_SKEW_SECONDS) * 1000)
    });
  });

  test("bumps the identity revocation version after inserting the marker on revoke", async () => {
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
    const { service, keyStore, identityAccessTokenRevocationDAL } = createService();

    await service.revokeAccessToken(accessToken);

    expect(identityAccessTokenRevocationDAL.insertRevocation).toHaveBeenCalledTimes(1);
    expect(keyStore.incrementSeededWithExpiry).toHaveBeenCalledWith(
      "identity-revocation-version:identity-id",
      expect.any(Number),
      expect.any(Number)
    );
  });

  test("bumps the identity revocation version on identity-wide revoke", async () => {
    const { service, keyStore } = createService();

    await service.revokeAllTokensForIdentity("identity-id");

    expect(keyStore.incrementSeededWithExpiry).toHaveBeenCalledWith(
      "identity-revocation-version:identity-id",
      expect.any(Number),
      expect.any(Number)
    );
  });

  test("serves a cached allow verdict without hitting the revocation DAL or membership", async () => {
    const { service, keyStore, identityAccessTokenRevocationDAL, orgDAL } = createService();
    keyStore.getItem.mockImplementation(async (key: string) => {
      if (key.startsWith("identity-revocation-version:")) return "5";
      if (key.startsWith("identity-revocation-verdict:")) return JSON.stringify({ v: 5 });
      return null;
    });

    await expect(service.fnValidateIdentityAccessTokenFast(createTokenClaims(), "10.0.0.1")).resolves.toMatchObject({
      identityId: "identity-id"
    });
    expect(identityAccessTokenRevocationDAL.findActiveRevocationsForToken).not.toHaveBeenCalled();
    expect(orgDAL.findEffectiveOrgMembership).not.toHaveBeenCalled();
  });

  test("serves a cached deny verdict without hitting the revocation DAL", async () => {
    const { service, keyStore, identityAccessTokenRevocationDAL } = createService();
    keyStore.getItem.mockImplementation(async (key: string) => {
      if (key.startsWith("identity-revocation-version:")) return "5";
      if (key.startsWith("identity-revocation-verdict:")) return JSON.stringify({ deny: "token" });
      return null;
    });

    await expect(service.fnValidateIdentityAccessTokenFast(createTokenClaims(), "10.0.0.1")).rejects.toThrow(
      "token has been revoked"
    );
    expect(identityAccessTokenRevocationDAL.findActiveRevocationsForToken).not.toHaveBeenCalled();
  });

  test("re-queries the primary when the cached allow version is stale", async () => {
    const { service, keyStore, identityAccessTokenRevocationDAL, orgDAL } = createService();
    // Live version advanced past the version the cached allow was stamped with.
    keyStore.getItem.mockImplementation(async (key: string) => {
      if (key.startsWith("identity-revocation-version:")) return "6";
      if (key.startsWith("identity-revocation-verdict:")) return JSON.stringify({ v: 5 });
      return null;
    });

    await expect(service.fnValidateIdentityAccessTokenFast(createTokenClaims(), "10.0.0.1")).resolves.toMatchObject({
      identityId: "identity-id"
    });
    expect(identityAccessTokenRevocationDAL.findActiveRevocationsForToken).toHaveBeenCalledTimes(1);
    expect(identityAccessTokenRevocationDAL.findActiveRevocationsForToken).toHaveBeenCalledWith(
      expect.objectContaining({ scopes: expect.arrayContaining(["org-id"]) as unknown as string[] })
    );
    expect(orgDAL.findEffectiveOrgMembership).toHaveBeenCalled();
    // Re-stamp the allow with the current live version.
    expect(keyStore.setItemWithExpiry).toHaveBeenCalledWith(
      expect.stringContaining("identity-revocation-verdict:identity-id:"),
      expect.any(Number),
      JSON.stringify({ v: 6 })
    );
  });

  test("denies via a version-current cached membership deny without a membership re-read", async () => {
    const { service, keyStore, orgDAL } = createService();
    keyStore.getItem.mockImplementation(async (key: string) => {
      if (key.startsWith("identity-revocation-version:")) return "5";
      if (key.startsWith("identity-revocation-verdict:")) return JSON.stringify({ deny: "org-membership", v: 5 });
      return null;
    });

    await expect(service.fnValidateIdentityAccessTokenFast(createTokenClaims(), "10.0.0.1")).rejects.toThrow(
      "not a member"
    );
    expect(orgDAL.findEffectiveOrgMembership).not.toHaveBeenCalled();
  });

  test("caches a cold-path membership deny stamped with the live version", async () => {
    const { service, keyStore } = createService({ membership: null });
    keyStore.getItem.mockImplementation(async (key: string) => {
      if (key.startsWith("identity-revocation-version:")) return "7";
      return null;
    });

    await expect(service.fnValidateIdentityAccessTokenFast(createTokenClaims(), "10.0.0.1")).rejects.toThrow(
      "not a member"
    );
    expect(keyStore.setItemWithExpiry).toHaveBeenCalledWith(
      expect.stringContaining("identity-revocation-verdict:identity-id:"),
      expect.any(Number),
      JSON.stringify({ deny: "org-membership", v: 7 })
    );
  });

  test("re-checks a stale cached membership deny and allows once membership is restored", async () => {
    // Deny was stamped at v5; restoring the membership bumped the version to 6.
    const { service, keyStore, orgDAL } = createService();
    keyStore.getItem.mockImplementation(async (key: string) => {
      if (key.startsWith("identity-revocation-version:")) return "6";
      if (key.startsWith("identity-revocation-verdict:")) return JSON.stringify({ deny: "org-membership", v: 5 });
      return null;
    });

    await expect(service.fnValidateIdentityAccessTokenFast(createTokenClaims(), "10.0.0.1")).resolves.toMatchObject({
      identityId: "identity-id"
    });
    expect(orgDAL.findEffectiveOrgMembership).toHaveBeenCalled();
    // Re-stamped as an allow under the live version.
    expect(keyStore.setItemWithExpiry).toHaveBeenCalledWith(
      expect.stringContaining("identity-revocation-verdict:identity-id:"),
      expect.any(Number),
      JSON.stringify({ v: 6 })
    );
  });

  test("re-checks an unstamped legacy cached membership deny instead of trusting it", async () => {
    const { service, keyStore, orgDAL } = createService();
    keyStore.getItem.mockImplementation(async (key: string) => {
      if (key.startsWith("identity-revocation-version:")) return "5";
      if (key.startsWith("identity-revocation-verdict:")) return JSON.stringify({ deny: "org-membership" });
      return null;
    });

    await expect(service.fnValidateIdentityAccessTokenFast(createTokenClaims(), "10.0.0.1")).resolves.toMatchObject({
      identityId: "identity-id"
    });
    expect(orgDAL.findEffectiveOrgMembership).toHaveBeenCalled();
  });

  test("serves a cached revocation deny regardless of a version mismatch", async () => {
    const { service, keyStore, identityAccessTokenRevocationDAL } = createService();
    keyStore.getItem.mockImplementation(async (key: string) => {
      if (key.startsWith("identity-revocation-version:")) return "9";
      if (key.startsWith("identity-revocation-verdict:")) return JSON.stringify({ deny: "auth-method", v: 5 });
      return null;
    });

    await expect(service.fnValidateIdentityAccessTokenFast(createTokenClaims(), "10.0.0.1")).rejects.toThrow(
      "auth method has been revoked"
    );
    expect(identityAccessTokenRevocationDAL.findActiveRevocationsForToken).not.toHaveBeenCalled();
  });

  test("removeOrgMembershipRevocationMarkers deletes the org-scoped markers in the caller tx without bumping", async () => {
    const { service, identityAccessTokenRevocationDAL, keyStore } = createService();
    const tx = {} as unknown as Parameters<typeof service.removeOrgMembershipRevocationMarkers>[0]["tx"];

    await service.removeOrgMembershipRevocationMarkers({ identityId: "identity-id", orgId: "org-id", tx });

    expect(identityAccessTokenRevocationDAL.deleteRevocationsByScope).toHaveBeenCalledWith(
      { identityId: "identity-id", scope: "org-id" },
      tx
    );
    // The bump is a separate post-commit step, never triggered by the marker removal.
    expect(keyStore.incrementSeededWithExpiry).not.toHaveBeenCalled();
  });

  test("insertOrgMembershipRevocationMarker writes an org-scoped marker in the caller tx without bumping", async () => {
    const { service, identityAccessTokenRevocationDAL, keyStore } = createService();
    const tx = {} as unknown as Parameters<typeof service.insertOrgMembershipRevocationMarker>[0]["tx"];

    await service.insertOrgMembershipRevocationMarker({ identityId: "identity-id", orgId: "org-id", tx });

    expect(identityAccessTokenRevocationDAL.insertRevocation).toHaveBeenCalledWith(
      {
        id: expect.any(String) as unknown as string,
        identityId: "identity-id",
        scope: "org-id",
        revokedAt: new Date(NOW_SECONDS * 1000),
        expiresAt: new Date((NOW_SECONDS + MAX_AGE) * 1000)
      },
      tx
    );
    // The bump is a separate post-commit step, never triggered by the marker insert.
    expect(keyStore.incrementSeededWithExpiry).not.toHaveBeenCalled();
  });

  test("bumpIdentityRevocationVersion bumps the identity version without writing a marker", async () => {
    const { service, identityAccessTokenRevocationDAL, keyStore } = createService();

    await service.bumpIdentityRevocationVersion({ identityId: "identity-id" });

    expect(identityAccessTokenRevocationDAL.insertRevocation).not.toHaveBeenCalled();
    expect(keyStore.incrementSeededWithExpiry).toHaveBeenCalledWith(
      "identity-revocation-version:identity-id",
      expect.any(Number),
      expect.any(Number)
    );
  });

  test("fails open to a direct primary query when the verdict cache read errors", async () => {
    const { service, keyStore, identityAccessTokenRevocationDAL } = createService({
      activeRevocations: [{ id: "token-id", identityId: "identity-id", createdAt: new Date(NOW_SECONDS * 1000) }]
    });
    // Only the revocation cache reads fail; the uses-remaining read still resolves
    // so we isolate the revocation-check fail-open behaviour.
    keyStore.getItem.mockImplementation(async (key: string) => {
      if (key.startsWith("identity-revocation-")) {
        throw new Error("redis down");
      }
      return null;
    });

    await expect(service.fnValidateIdentityAccessTokenFast(createTokenClaims(), "10.0.0.1")).rejects.toThrow(
      "token has been revoked"
    );
    expect(identityAccessTokenRevocationDAL.findActiveRevocationsForToken).toHaveBeenCalled();
  });
});

describe("certificate-bound access tokens", () => {
  let previousFipsEnabled: string | undefined;
  let boundPem: string;
  let otherPem: string;
  let boundThumbprint: string;

  const makeCertificatePem = async (commonName: string) => {
    const alg = { name: "ECDSA", namedCurve: "P-256", hash: "SHA-256" };
    const keys = await globalThis.crypto.subtle.generateKey(alg, true, ["sign", "verify"]);
    const cert = await x509.X509CertificateGenerator.createSelfSigned({
      serialNumber: "01",
      name: `CN=${commonName}`,
      notBefore: new Date("2020-01-01T00:00:00Z"),
      notAfter: new Date("2040-01-01T00:00:00Z"),
      signingAlgorithm: alg,
      keys
    });
    return cert.toString("pem");
  };

  const asHeader = (pem: string) => encodeURIComponent(pem);

  const signBoundToken = (overrides: { numUsesLimit?: number } = {}) =>
    signIdentityAccessToken({
      identityAccessTokenId: "token-id",
      identityId: "identity-id",
      identityName: "identity-name",
      authMethod: IdentityAuthMethod.TLS_CERT_AUTH,
      orgId: "org-id",
      rootOrgId: "root-org-id",
      parentOrgId: "parent-org-id",
      clientSecretId: "",
      numUsesLimit: overrides.numUsesLimit ?? 0,
      ipRestrictionEnabled: false,
      ttlSeconds: 3600,
      accessTokenTTL: 3600,
      accessTokenMaxTTL: 7200,
      accessTokenPeriod: 0,
      creationEpoch: NOW_SECONDS,
      identityAuth: {},
      cnf: { [CERTIFICATE_THUMBPRINT_CLAIM]: boundThumbprint }
    }).accessToken;

  beforeAll(async () => {
    previousFipsEnabled = process.env.FIPS_ENABLED;
    process.env.FIPS_ENABLED = "false";
    await crypto.initialize({} as never, {} as never, {} as never);
    x509.cryptoProvider.set(globalThis.crypto);
    boundPem = await makeCertificatePem("bound-client");
    otherPem = await makeCertificatePem("other-client");
    boundThumbprint = computeCertificateThumbprint(new crypto.nativeCrypto.X509Certificate(boundPem).raw);
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
  });

  test("thumbprint is the base64url SHA-256 of the certificate DER", () => {
    const der = new crypto.nativeCrypto.X509Certificate(boundPem).raw;
    expect(boundThumbprint).toBe(crypto.nativeCrypto.createHash("sha256").update(der).digest("base64url"));
    for (const char of ["+", "/", "="]) expect(boundThumbprint).not.toContain(char);
  });

  test("accepts a bound token when the matching certificate is presented", async () => {
    const { service } = createService();
    const claims = verifyAccessTokenJwt(signBoundToken());

    await expect(
      service.fnValidateIdentityAccessTokenFast(claims, "10.0.0.1", asHeader(boundPem))
    ).resolves.toMatchObject({ identityId: "identity-id" });
  });

  test("uses the leaf when the proxy forwards a full chain", async () => {
    const { service } = createService();
    const claims = verifyAccessTokenJwt(signBoundToken());

    await expect(
      service.fnValidateIdentityAccessTokenFast(claims, "10.0.0.1", asHeader(`${boundPem}\n${otherPem}`))
    ).resolves.toMatchObject({ identityId: "identity-id" });
  });

  test("rejects a bound token when no certificate is presented", async () => {
    const { service } = createService();
    const claims = verifyAccessTokenJwt(signBoundToken());

    await expect(service.fnValidateIdentityAccessTokenFast(claims, "10.0.0.1")).rejects.toThrow(
      "no client certificate was presented"
    );
  });

  test("rejects a bound token when a different certificate is presented", async () => {
    const { service } = createService();
    const claims = verifyAccessTokenJwt(signBoundToken());

    await expect(service.fnValidateIdentityAccessTokenFast(claims, "10.0.0.1", asHeader(otherPem))).rejects.toThrow(
      "does not match the certificate the access token is bound to"
    );
  });

  test("rejects a bound token when the certificate header cannot be parsed", async () => {
    const { service } = createService();
    const claims = verifyAccessTokenJwt(signBoundToken());

    await expect(service.fnValidateIdentityAccessTokenFast(claims, "10.0.0.1", "%E0%A4%A")).rejects.toThrow(
      "client certificate header could not be read"
    );
  });

  test("does not spend a token use when the certificate does not match", async () => {
    const { service, keyStore } = createService();
    keyStore.getItem.mockResolvedValue("3");
    const claims = verifyAccessTokenJwt(signBoundToken({ numUsesLimit: 3 }));

    await expect(service.fnValidateIdentityAccessTokenFast(claims, "10.0.0.1", asHeader(otherPem))).rejects.toThrow();
    expect(keyStore.decrementIfExists).not.toHaveBeenCalled();
  });

  test("ignores the certificate header for unbound tokens", async () => {
    const { service } = createService();

    await expect(
      service.fnValidateIdentityAccessTokenFast(createTokenClaims(), "10.0.0.1", asHeader(otherPem))
    ).resolves.toMatchObject({ identityId: "identity-id" });
  });

  test("renewal keeps the binding when the matching certificate is presented", async () => {
    const { service } = createService();

    const renewed = await service.renewAccessToken({
      accessToken: signBoundToken(),
      clientCertificate: asHeader(boundPem)
    });

    expect(verifyAccessTokenJwt(renewed.accessToken).cnf).toEqual({
      [CERTIFICATE_THUMBPRINT_CLAIM]: boundThumbprint
    });
  });

  test("renewal requires the bound certificate", async () => {
    const { service } = createService();

    await expect(service.renewAccessToken({ accessToken: signBoundToken() })).rejects.toThrow(
      "Cannot renew: access token is bound to a client certificate, but no client certificate was presented"
    );
    await expect(
      service.renewAccessToken({ accessToken: signBoundToken(), clientCertificate: asHeader(otherPem) })
    ).rejects.toThrow("Cannot renew: the presented client certificate does not match");
  });
});
