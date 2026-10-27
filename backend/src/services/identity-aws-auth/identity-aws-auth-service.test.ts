import { beforeEach, describe, expect, test, vi } from "vitest";

import { IdentityAuthMethod } from "@app/db/schemas";
import { logger } from "@app/lib/logger";

import { identityAwsAuthServiceFactory } from "./identity-aws-auth-service";

const { request } = vi.hoisted(() => ({ request: vi.fn() }));

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

vi.mock("@app/lib/config/env", () => ({
  getConfig: () => ({ OTEL_TELEMETRY_COLLECTION_ENABLED: false })
}));

vi.mock("@fastify/request-context", () => ({
  requestContext: { get: vi.fn(() => undefined) }
}));

vi.mock("@app/lib/config/request", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@app/lib/config/request")>();
  return { ...actual, request };
});

vi.mock("../identity/identity-auth-permission-fns", () => ({ assertIdentityAuthAccessAllowed: vi.fn() }));
vi.mock("../super-admin/super-admin-fns", () => ({ validateIdentityUpdateForSuperAdminPrivileges: vi.fn() }));
vi.mock("@app/services/identity/identity-auth-method-events", () => ({
  emitIdentityAuthMethodChanged: vi.fn(),
  IdentityAuthMethodChange: { Added: "added", Updated: "updated", Removed: "removed" }
}));

const IDENTITY_ID = "5d3a8b2e-7c61-4b0f-9f3e-2a1c4d6e8f90";
const ORG_ID = "org-id";
const ACCESS_TOKEN = "access-token";
const ACCOUNT_ID = "123456789012";
const ROLE_ARN = `arn:aws:iam::${ACCOUNT_ID}:role/app-role`;

type TAwsAuthRow = {
  allowedAccountIds: string;
  allowedPrincipalArns: string;
};

const makeService = (awsAuth: Partial<TAwsAuthRow> = {}, authMethods: string[] = []) => {
  const updateById = vi.fn().mockImplementation(async (_id: string, data: Record<string, unknown>) => ({
    id: "auth-id",
    ...data
  }));
  const create = vi.fn();
  const issueIdentityAccessToken = vi.fn().mockResolvedValue({
    accessToken: ACCESS_TOKEN,
    identityAccessToken: { id: "access-token-id" }
  });

  const service = identityAwsAuthServiceFactory({
    identityAwsAuthDAL: {
      findOne: vi.fn().mockResolvedValue({
        id: "auth-id",
        identityId: IDENTITY_ID,
        stsEndpoint: "https://sts.amazonaws.com/",
        allowedAccountIds: "",
        allowedPrincipalArns: "",
        accessTokenTTL: 3600,
        accessTokenMaxTTL: 7200,
        accessTokenNumUsesLimit: 0,
        accessTokenPeriod: 0,
        accessTokenTrustedIps: [{ ipAddress: "0.0.0.0/0" }],
        ...awsAuth
      }),
      transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn({})),
      updateById,
      create,
      delete: vi.fn()
    } as never,
    identityDAL: {
      findById: vi.fn().mockResolvedValue({ id: IDENTITY_ID, orgId: ORG_ID, name: "aws-identity" })
    } as never,
    orgDAL: {
      findById: vi.fn().mockResolvedValue({ id: ORG_ID, name: "org", slug: "org", rootOrgId: null, parentOrgId: null })
    } as never,
    membershipIdentityDAL: {
      update: vi.fn().mockResolvedValue(undefined),
      getIdentityById: vi.fn().mockResolvedValue({
        scopeOrgId: ORG_ID,
        identity: { id: IDENTITY_ID, orgId: ORG_ID, projectId: null, authMethods }
      })
    } as never,
    keyStore: { setItemWithExpiryNX: vi.fn().mockResolvedValue(null) } as never,
    identityAccessTokenDAL: {} as never,
    permissionService: {} as never,
    licenseService: { getPlan: vi.fn().mockResolvedValue({ ipAllowlisting: true }) } as never,
    identityAccessTokenService: {
      issueIdentityAccessToken,
      invalidateTrustedIpsCache: vi.fn().mockResolvedValue(undefined)
    } as never,
    eventEmitter: { emit: vi.fn() } as never
  });

  return { service, updateById, create, issueIdentityAccessToken };
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("awsAuthService.login without a trust binding", () => {
  const stsCaller = {
    Account: ACCOUNT_ID,
    Arn: `arn:aws:sts::${ACCOUNT_ID}:assumed-role/app-role/session`,
    UserId: "AROA"
  };

  const login = (awsAuth: Partial<TAwsAuthRow>) => {
    const { service, issueIdentityAccessToken } = makeService(awsAuth);
    request.mockResolvedValue({
      data: { GetCallerIdentityResponse: { GetCallerIdentityResult: stsCaller } }
    });
    const headers = {
      Authorization: "AWS4-HMAC-SHA256 Credential=AKIA/20260101/us-east-1/sts/aws4_request, SignedHeaders=host"
    };
    return {
      result: service.login({
        identityId: IDENTITY_ID,
        iamHttpRequestMethod: "POST",
        iamRequestBody: Buffer.from("Action=GetCallerIdentity&Version=2011-06-15").toString("base64"),
        iamRequestHeaders: Buffer.from(JSON.stringify(headers)).toString("base64")
      } as never),
      issueIdentityAccessToken
    };
  };

  test("allows an identity with no account ID or principal ARN and logs a warning", async () => {
    const { result } = login({});

    await expect(result).resolves.toMatchObject({ accessToken: ACCESS_TOKEN });
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining(IDENTITY_ID));
  });

  test("does not warn when an allow list is set", async () => {
    const { result } = login({ allowedAccountIds: ACCOUNT_ID });

    await expect(result).resolves.toMatchObject({ accessToken: ACCESS_TOKEN });
    expect(logger.warn).not.toHaveBeenCalled();
  });

  test("still enforces an allow list that is set", async () => {
    const { result } = login({ allowedAccountIds: "999999999999" });

    await expect(result).rejects.toMatchObject({ detail: { reasonCode: "account_id_not_allowed" } });
  });

  test("replays only a POST to the regional STS endpoint with the signature headers", async () => {
    const { result } = login({ allowedAccountIds: ACCOUNT_ID });

    await expect(result).resolves.toMatchObject({ accessToken: ACCESS_TOKEN });
    expect(request).toHaveBeenCalledWith({
      method: "POST",
      url: "https://sts.us-east-1.amazonaws.com",
      headers: {
        authorization: "AWS4-HMAC-SHA256 Credential=AKIA/20260101/us-east-1/sts/aws4_request, SignedHeaders=host"
      },
      data: "Action=GetCallerIdentity&Version=2011-06-15"
    });
  });

  test("refuses a crafted request before contacting AWS", async () => {
    const { service } = makeService({ allowedAccountIds: ACCOUNT_ID });
    const headers = {
      Authorization: "AWS4-HMAC-SHA256 Credential=x/x/s3/x/aws4_request",
      authorization: null,
      Host: "attacker-bucket.s3.amazonaws.com",
      "Content-Length": "0"
    };

    await expect(
      service.login({
        identityId: IDENTITY_ID,
        iamHttpRequestMethod: "GET",
        iamRequestBody: Buffer.from("GET /caller.json HTTP/1.1\r\nX-Swallow: ").toString("base64"),
        iamRequestHeaders: Buffer.from(JSON.stringify(headers)).toString("base64")
      } as never)
    ).rejects.toThrow("Signed STS request must be a POST of Action=GetCallerIdentity");
    expect(request).not.toHaveBeenCalled();
  });
});

// Attach and update are the only places a binding can be saved. The permission service is an empty object, so a
// call that got past the binding check would throw a TypeError instead of the binding message.
describe("awsAuthService trust binding on write", () => {
  const BINDING_MESSAGE = "Configure at least one allowed AWS account ID or principal ARN";

  const attach = (body: Record<string, unknown>) => {
    const { service, create } = makeService({}, []);
    return {
      result: service.attachAwsAuth({
        identityId: IDENTITY_ID,
        actorOrgId: ORG_ID,
        stsEndpoint: "https://sts.amazonaws.com/",
        allowedAccountIds: "",
        allowedPrincipalArns: "",
        accessTokenTTL: 3600,
        accessTokenMaxTTL: 7200,
        accessTokenNumUsesLimit: 0,
        accessTokenTrustedIps: [],
        ...body
      } as never),
      create
    };
  };

  const update = (existing: Partial<TAwsAuthRow>, body: Record<string, unknown>) => {
    const { service, updateById } = makeService(existing, [IdentityAuthMethod.AWS_AUTH]);
    return {
      result: service.updateAwsAuth({ identityId: IDENTITY_ID, actorOrgId: ORG_ID, ...body } as never),
      updateById
    };
  };

  test("attach rejects an identity with no account ID or principal ARN", async () => {
    const { result, create } = attach({});

    await expect(result).rejects.toThrow(BINDING_MESSAGE);
    expect(create).not.toHaveBeenCalled();
  });

  test("update rejects clearing the last allow list", async () => {
    const { result, updateById } = update({ allowedAccountIds: ACCOUNT_ID }, { allowedAccountIds: "" });

    await expect(result).rejects.toThrow(BINDING_MESSAGE);
    expect(updateById).not.toHaveBeenCalled();
  });

  test("update rejects a change to an identity that has no binding and does not add one", async () => {
    const { result } = update({}, { accessTokenTTL: 1800 });

    await expect(result).rejects.toThrow(BINDING_MESSAGE);
  });

  test("update allows clearing one list while the other stays set", async () => {
    const { result, updateById } = update(
      { allowedAccountIds: ACCOUNT_ID, allowedPrincipalArns: ROLE_ARN },
      { allowedAccountIds: "" }
    );

    await expect(result).resolves.toBeDefined();
    expect(updateById.mock.calls[0][1]).toMatchObject({ allowedAccountIds: "" });
  });

  test("a TTL-only update leaves the stored lists alone", async () => {
    const { result, updateById } = update({ allowedAccountIds: ACCOUNT_ID }, { accessTokenTTL: 1800 });

    await expect(result).resolves.toBeDefined();
    const written = updateById.mock.calls[0][1] as Record<string, unknown>;
    expect(written.accessTokenTTL).toBe(1800);
    expect(written.allowedAccountIds).toBeUndefined();
    expect(written.allowedPrincipalArns).toBeUndefined();
  });
});
