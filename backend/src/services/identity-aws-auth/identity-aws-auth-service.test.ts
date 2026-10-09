import { beforeEach, describe, expect, test, vi } from "vitest";

import { identityAwsAuthServiceFactory } from "./identity-aws-auth-service";

const { request, config } = vi.hoisted(() => ({
  request: vi.fn(),
  config: { OTEL_TELEMETRY_COLLECTION_ENABLED: false } as Record<string, unknown>
}));

vi.mock("@app/lib/config/request", () => ({ request }));

vi.mock("@app/lib/config/env", () => ({ getConfig: () => config }));

vi.mock("@fastify/request-context", () => ({
  requestContext: { get: vi.fn(() => undefined) }
}));

const IDENTITY_ID = "5d3a8b2e-7c61-4b0f-9f3e-2a1c4d6e8f90";
const ORG_ID = "org-id";
const ACCOUNT_ID = "123456789012";
const USER_ARN = `arn:aws:iam::${ACCOUNT_ID}:user/app`;
const ROOT_ARN = `arn:aws:iam::${ACCOUNT_ID}:root`;

const makeService = (awsAuth: Record<string, unknown> = {}) => {
  const issueIdentityAccessToken = vi.fn().mockResolvedValue({
    accessToken: "access-token",
    identityAccessToken: { id: "access-token-id" }
  });

  const service = identityAwsAuthServiceFactory({
    identityAwsAuthDAL: {
      findOne: vi.fn().mockResolvedValue({
        identityId: IDENTITY_ID,
        stsEndpoint: "https://sts.amazonaws.com/",
        allowedAccountIds: ACCOUNT_ID,
        allowedPrincipalArns: "",
        accessTokenTTL: 3600,
        accessTokenMaxTTL: 7200,
        accessTokenNumUsesLimit: 0,
        accessTokenPeriod: 0,
        accessTokenTrustedIps: [{ ipAddress: "0.0.0.0/0" }],
        ...awsAuth
      })
    } as never,
    identityDAL: {
      findById: vi.fn().mockResolvedValue({ id: IDENTITY_ID, orgId: ORG_ID, name: "aws-identity" })
    } as never,
    orgDAL: {
      findById: vi.fn().mockResolvedValue({ id: ORG_ID, name: "org", slug: "org", rootOrgId: null, parentOrgId: null })
    } as never,
    membershipIdentityDAL: { update: vi.fn().mockResolvedValue(undefined) } as never,
    keyStore: { setItemWithExpiryNX: vi.fn().mockResolvedValue(null) } as never,
    identityAccessTokenDAL: {} as never,
    permissionService: {} as never,
    licenseService: {} as never,
    identityAccessTokenService: { issueIdentityAccessToken } as never,
    eventEmitter: { emit: vi.fn() } as never
  });

  return { service, issueIdentityAccessToken };
};

const signedRequest = (region = "us-east-1") => ({
  identityId: IDENTITY_ID,
  iamHttpRequestMethod: "POST",
  iamRequestBody: Buffer.from("Action=GetCallerIdentity&Version=2011-06-15").toString("base64"),
  iamRequestHeaders: Buffer.from(
    JSON.stringify({
      Authorization: `AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20261006/${region}/sts/aws4_request, SignedHeaders=host;x-amz-date, Signature=abc`,
      "X-Amz-Date": "20261006T000000Z"
    })
  ).toString("base64")
});

const stsReturns = (arn: string) =>
  request.mockResolvedValue({
    data: { GetCallerIdentityResponse: { GetCallerIdentityResult: { Account: ACCOUNT_ID, Arn: arn, UserId: "AIDA" } } }
  });

beforeEach(() => {
  vi.clearAllMocks();
  delete config.AWS_ENDPOINT_URL;
  delete config.AWS_ENDPOINT_URL_STS;
  delete config.AWS_IGNORE_CONFIGURED_ENDPOINT_URLS;
});

describe("awsAuthService.login STS verification endpoint", () => {
  test("verifies against the caller's regional AWS STS endpoint by default", async () => {
    stsReturns(USER_ARN);
    const { service } = makeService();

    await expect(service.login(signedRequest("eu-west-1"))).resolves.toMatchObject({ accessToken: "access-token" });
    expect(request).toHaveBeenCalledWith(expect.objectContaining({ url: "https://sts.eu-west-1.amazonaws.com" }));
  });

  test("verifies against AWS_ENDPOINT_URL_STS / AWS_ENDPOINT_URL when the operator sets them", async () => {
    stsReturns(USER_ARN);
    config.AWS_ENDPOINT_URL = "http://localstack:4566";
    const { service } = makeService();

    await expect(service.login(signedRequest())).resolves.toMatchObject({ accessToken: "access-token" });
    expect(request).toHaveBeenCalledWith(expect.objectContaining({ url: "http://localstack:4566" }));
  });

  // The identity's stsEndpoint is tenant-controlled; it must never be handed to the plain HTTP client.
  test("never sends the request to a tenant-configured stsEndpoint", async () => {
    stsReturns(USER_ARN);
    const { service } = makeService({ stsEndpoint: "http://127.0.0.1:8080/" });

    await service.login(signedRequest());
    expect(request).toHaveBeenCalledWith(expect.objectContaining({ url: "https://sts.us-east-1.amazonaws.com" }));
    expect(request).not.toHaveBeenCalledWith(expect.objectContaining({ url: "http://127.0.0.1:8080/" }));
  });
});

describe("awsAuthService.login root principals", () => {
  test("rejects an account root principal with 401 before issuing a token", async () => {
    stsReturns(ROOT_ARN);
    const { service, issueIdentityAccessToken } = makeService();

    const result = service.login(signedRequest());
    await expect(result).rejects.toThrow("Access denied: AWS account root principals cannot use AWS Auth.");
    await expect(result).rejects.toMatchObject({
      detail: { reasonCode: "root_principal_not_supported", identityId: IDENTITY_ID, orgId: ORG_ID }
    });
    expect(issueIdentityAccessToken).not.toHaveBeenCalled();
  });

  test("rejects a root principal even when a principal ARN allowlist is configured", async () => {
    stsReturns(ROOT_ARN);
    const { service, issueIdentityAccessToken } = makeService({
      allowedAccountIds: "",
      allowedPrincipalArns: `arn:aws:iam::${ACCOUNT_ID}:user/*`
    });

    await expect(service.login(signedRequest())).rejects.toMatchObject({
      detail: { reasonCode: "root_principal_not_supported" }
    });
    expect(issueIdentityAccessToken).not.toHaveBeenCalled();
  });
});
