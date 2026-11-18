import { AxiosError, AxiosHeaders } from "axios";

import { BadRequestError, NotFoundError } from "@app/lib/errors";

import { GcpConnectionMethod } from "./gcp-connection-enums";
import {
  getGcpConnectionAuthToken,
  getGcpConnectionFederatedCredential,
  validateGcpConnectionCredentials
} from "./gcp-connection-fns";
import { TGcpConnectionAuthDeps, TGcpConnectionConfig, TGcpConnectionForAuth } from "./gcp-connection-types";

const config = vi.hoisted(() => ({ SITE_URL: "https://app.test" as string | undefined }));
vi.mock("@app/lib/config/env", () => ({ getConfig: () => config }));

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

const post = vi.hoisted(() => vi.fn());
vi.mock("@app/lib/config/request", () => ({ request: { post, get: vi.fn() } }));

const stored = vi.hoisted(() => ({ credentials: {} as Record<string, unknown> }));
vi.mock("@app/services/app-connection/app-connection-fns", () => ({
  getAppConnectionMethodName: (method: string) => method,
  decryptAppConnectionCredentials: vi.fn(async () => stored.credentials),
  encryptAppConnectionCredentials: vi.fn(async ({ credentials }: { credentials: unknown }) =>
    Buffer.from(JSON.stringify(credentials))
  )
}));

const STS_URL = "https://sts.googleapis.com/v1/token";
const PROVIDER = "projects/123456789/locations/global/workloadIdentityPools/infisical/providers/infisical-org";
const SERVICE_ACCOUNT = "sync@acme.iam.gserviceaccount.com";
const ORG_ID = "22222222-2222-2222-2222-222222222222";
const PROJECT_ID = "project-a";
const CONNECTION = { id: "11111111-1111-1111-1111-111111111111", name: "gcp-wif" };
const SA_TOKEN_EXPIRY = "2030-01-01T00:00:00Z";

const signToken = vi.fn(async () => "signed-jwt");
const oidcIssuerService = { signToken };

const googleError = (status: number, data: unknown) =>
  new AxiosError("Request failed", "ERR_BAD_REQUEST", undefined, undefined, {
    status,
    statusText: "",
    data,
    headers: {},
    config: { headers: new AxiosHeaders() }
  });

const googleResponds = ({ sts, iam }: { sts?: unknown; iam?: unknown } = {}) =>
  post.mockImplementation(async (url: string) => {
    if (url === STS_URL) {
      if (sts instanceof Error) throw sts;
      return { data: sts ?? { access_token: "federated-token", expires_in: 297 } };
    }
    if (iam instanceof Error) throw iam;
    return { data: iam ?? { accessToken: "sa-token", expireTime: SA_TOKEN_EXPIRY } };
  });

const wifConfig = (overrides: Partial<TGcpConnectionConfig> = {}) =>
  ({
    app: "gcp",
    method: GcpConnectionMethod.WorkloadIdentityFederation,
    credentials: { workloadIdentityProvider: PROVIDER, serviceAccountEmail: SERVICE_ACCOUNT },
    orgId: ORG_ID,
    projectId: PROJECT_ID,
    connection: CONNECTION,
    ...overrides
  }) as TGcpConnectionConfig;

beforeEach(() => {
  config.SITE_URL = "https://app.test";
  post.mockReset();
  signToken.mockClear();
  googleResponds();
});

describe("getGcpConnectionFederatedCredential", () => {
  test("returns the issuer, subject and audience to configure in GCP", () => {
    expect(
      getGcpConnectionFederatedCredential({ id: CONNECTION.id, orgId: ORG_ID, workloadIdentityProvider: PROVIDER })
    ).toEqual({
      issuerUrl: `https://app.test/api/v1/oidc-issuer/organizations/${ORG_ID}`,
      subjectIdentifier: `app-connection:${CONNECTION.id}`,
      audience: `https://iam.googleapis.com/${PROVIDER}`
    });
  });

  test("returns no issuer when SITE_URL is not set", () => {
    config.SITE_URL = undefined;

    expect(
      getGcpConnectionFederatedCredential({ id: CONNECTION.id, orgId: ORG_ID, workloadIdentityProvider: PROVIDER })
        .issuerUrl
    ).toBeNull();
  });
});

describe("validateGcpConnectionCredentials with workload identity federation", () => {
  test("creates the connection without contacting GCP, which cannot trust a connection that does not exist yet", async () => {
    const credentials = await validateGcpConnectionCredentials(wifConfig({ connection: undefined }), oidcIssuerService);

    expect(credentials).toEqual({ workloadIdentityProvider: PROVIDER, serviceAccountEmail: SERVICE_ACCOUNT });
    expect(signToken).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
  });

  test("refuses when SITE_URL is not an https URL GCP can fetch the keys from", async () => {
    config.SITE_URL = "http://localhost:8080";

    await expect(validateGcpConnectionCredentials(wifConfig(), oidcIssuerService)).rejects.toThrow(
      /requires SITE_URL to be this instance's public https URL/
    );
    expect(post).not.toHaveBeenCalled();
  });

  test("signs a token for the connection, exchanges it, and impersonates the service account on reconnect", async () => {
    const credentials = await validateGcpConnectionCredentials(wifConfig(), oidcIssuerService);

    expect(signToken).toHaveBeenCalledWith({
      appConnection: { ...CONNECTION, orgId: ORG_ID, projectId: PROJECT_ID },
      audience: `https://iam.googleapis.com/${PROVIDER}`
    });
    expect(post).toHaveBeenNthCalledWith(
      1,
      STS_URL,
      expect.objectContaining({
        audience: `//iam.googleapis.com/${PROVIDER}`,
        subjectToken: "signed-jwt",
        subjectTokenType: "urn:ietf:params:oauth:token-type:jwt"
      })
    );
    expect(post).toHaveBeenNthCalledWith(
      2,
      `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(SERVICE_ACCOUNT)}:generateAccessToken`,
      expect.anything(),
      { headers: { Authorization: "Bearer federated-token" } }
    );
    expect(credentials).toEqual({
      workloadIdentityProvider: PROVIDER,
      serviceAccountEmail: SERVICE_ACCOUNT,
      accessToken: "sa-token",
      expiresAt: Date.parse(SA_TOKEN_EXPIRY)
    });
  });

  test("uses the federated token directly when no service account is set", async () => {
    const credentials = await validateGcpConnectionCredentials(
      wifConfig({ credentials: { workloadIdentityProvider: PROVIDER } } as Partial<TGcpConnectionConfig>),
      oidcIssuerService
    );

    expect(post).toHaveBeenCalledTimes(1);
    expect(credentials).toMatchObject({ workloadIdentityProvider: PROVIDER, accessToken: "federated-token" });
  });

  test("names the provider, Google's reason and the issuer when the token exchange is refused", async () => {
    googleResponds({
      sts: googleError(400, {
        error: "invalid_grant",
        error_description: "The audience in ID Token [x] does not match the expected audience."
      })
    });

    const error = await validateGcpConnectionCredentials(wifConfig(), oidcIssuerService).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(BadRequestError);
    expect((error as BadRequestError).message).toBe(
      `GCP workload identity provider '${PROVIDER}' rejected the connection's token: The audience in ID Token [x] does not match the expected audience. Check that the provider exists and trusts the issuer 'https://app.test/api/v1/oidc-issuer/organizations/${ORG_ID}'.`
    );
  });

  test("tells the user which subject to grant when GCP denies the service account", async () => {
    googleResponds({
      iam: googleError(403, { error: { message: "Permission 'iam.serviceAccounts.getAccessToken' denied" } })
    });

    await expect(validateGcpConnectionCredentials(wifConfig(), oidcIssuerService)).rejects.toThrow(
      `GCP denied the connection access to service account '${SERVICE_ACCOUNT}'. Grant the Workload Identity User role (roles/iam.workloadIdentityUser) on the service account to the connection's principal, subject 'app-connection:${CONNECTION.id}'.`
    );
  });
});

describe("getGcpConnectionAuthToken with workload identity federation", () => {
  const updateById = vi.fn();
  const findById = vi.fn();
  const deps = {
    appConnectionDAL: { findById, updateById },
    kmsService: {},
    oidcIssuerService
  } as unknown as TGcpConnectionAuthDeps;
  const connection = {
    id: CONNECTION.id,
    orgId: ORG_ID,
    method: GcpConnectionMethod.WorkloadIdentityFederation,
    credentials: {}
  } as unknown as TGcpConnectionForAuth;

  beforeEach(() => {
    updateById.mockReset();
    findById.mockReset();
    findById.mockResolvedValue({
      ...CONNECTION,
      orgId: ORG_ID,
      projectId: PROJECT_ID,
      encryptedCredentials: Buffer.from("encrypted")
    });
  });

  const storeCredentials = ({ minutesLeft, serviceAccountEmail }: { minutesLeft: number; serviceAccountEmail?: string }) => {
    stored.credentials = {
      workloadIdentityProvider: PROVIDER,
      serviceAccountEmail,
      accessToken: "cached-token",
      expiresAt: Date.now() + minutesLeft * 60 * 1000
    };
  };

  test("reuses the cached token while it has more than five minutes left", async () => {
    storeCredentials({ minutesLeft: 30, serviceAccountEmail: SERVICE_ACCOUNT });

    await expect(getGcpConnectionAuthToken(connection, deps)).resolves.toBe("cached-token");
    expect(signToken).not.toHaveBeenCalled();
    expect(updateById).not.toHaveBeenCalled();
  });

  test("exchanges and stores a new token when the cached one is about to expire", async () => {
    storeCredentials({ minutesLeft: 4, serviceAccountEmail: SERVICE_ACCOUNT });

    await expect(getGcpConnectionAuthToken(connection, deps)).resolves.toBe("sa-token");

    expect(updateById).toHaveBeenCalledTimes(1);
    const [id, { encryptedCredentials }] = updateById.mock.calls[0] as [string, { encryptedCredentials: Buffer }];
    expect(id).toBe(CONNECTION.id);
    expect(JSON.parse(encryptedCredentials.toString())).toMatchObject({
      workloadIdentityProvider: PROVIDER,
      accessToken: "sa-token",
      expiresAt: Date.parse(SA_TOKEN_EXPIRY)
    });
  });

  test("reuses a federated token for most of its five minute life when there is no service account", async () => {
    storeCredentials({ minutesLeft: 4 });

    await expect(getGcpConnectionAuthToken(connection, deps)).resolves.toBe("cached-token");
    expect(signToken).not.toHaveBeenCalled();
  });

  test("refuses with not found when the connection no longer exists", async () => {
    findById.mockResolvedValue(undefined);

    await expect(getGcpConnectionAuthToken(connection, deps)).rejects.toBeInstanceOf(NotFoundError);
  });
});
