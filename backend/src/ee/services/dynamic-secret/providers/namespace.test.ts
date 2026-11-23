import crypto, { webcrypto } from "node:crypto";

import * as x509 from "@peculiar/x509";
import { AxiosError } from "axios";
import { beforeAll, beforeEach, describe, expect, test, vi } from "vitest";

import { TDynamicSecrets } from "@app/db/schemas";
import { BadRequestError } from "@app/lib/errors";

import { NamespaceAuthType } from "./models";
import { getNamespaceOidcFederation, NamespaceProvider } from "./namespace";

type TPost = (
  url: string,
  body: Record<string, unknown>,
  config: { headers: Record<string, string> }
) => Promise<unknown>;

const { mockedPost, appConfig } = vi.hoisted(() => ({
  mockedPost: vi.fn<TPost>(),
  appConfig: { SITE_URL: "https://app.test" as string | undefined }
}));

vi.mock("@app/lib/config/request", () => ({ request: { post: mockedPost } }));

vi.mock("@app/lib/config/env", () => ({ getConfig: () => appConfig }));

vi.mock("@app/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

const PROVISIONER_TOKEN = "nsrt_provisioner-token.value";
const CHILD_TOKEN = "nsrt_child-token.value";
const IAM = "https://iam.namespaceapis.com";
const CREATE_URL = `${IAM}/namespace.cloud.iam.v1beta.TokenService/CreateRevokableToken`;
const EXCHANGE_URL = `${IAM}/namespace.cloud.iam.v1beta.TenantService/ExchangeTenantTokenForClientCert`;
const REVOKE_URL = `${IAM}/namespace.cloud.iam.v1beta.TokenService/RevokeRevokableToken`;
const FEDERATION_URL = "https://private-api.global.namespaceapis.com/nsl.tenants.TenantsService/ExchangeOIDCToken";

const ORG_ID = "org-1";
const PROJECT_ID = "proj-1";
const TENANT_ID = "tenant_test";
const OIDC_TOKEN = "header.payload-signed-by-infisical.signature";
const TENANT_TOKEN = "nsct_tenant-token.value";
const DEFAULT_AUDIENCE = "https://federation.namespaceapis.com";

const dynamicSecret = { id: "ds-1", name: "namespace-ingress", type: "namespace" } as TDynamicSecrets;
const inputs = { method: NamespaceAuthType.ProvisionerToken, provisionerToken: PROVISIONER_TOKEN };
const federationInputs = { method: NamespaceAuthType.Federation, tenantId: TENANT_ID };
const metadata = { projectId: PROJECT_ID };

const signDynamicSecretToken = vi.fn(async () => OIDC_TOKEN);
const findById = vi.fn(async () => ({ id: PROJECT_ID, orgId: ORG_ID }));
const provider = () =>
  NamespaceProvider({ oidcIssuerService: { signDynamicSecretToken }, projectDAL: { findById } as never });

const createArgs = (expireAt: number, providerInputs: object = inputs) => ({
  inputs: providerInputs,
  expireAt,
  identity: { name: "tester" },
  dynamicSecret,
  metadata
});

const connectError = (status: number, code: string, message: string) =>
  new AxiosError(`Request failed with status code ${status}`, "ERR_BAD_REQUEST", undefined, undefined, {
    status,
    data: { code, message },
    statusText: "",
    headers: {},
    config: {} as never
  });

const alg = { name: "ECDSA", namedCurve: "P-256", hash: "SHA-256" };
let caKeys: CryptoKeyPair;
let intermediatePem: string;

const signClientCert = async (publicKeyPem: string, notAfter: Date) => {
  const der = crypto.createPublicKey(publicKeyPem).export({ type: "spki", format: "der" });
  const publicKey = (await webcrypto.subtle.importKey("spki", der, alg, true, ["verify"])) as unknown as CryptoKey;
  const cert = await x509.X509CertificateGenerator.create({
    serialNumber: "01",
    subject: "O=tenant_test, OU=tenantcert, CN=tenantcert-tenant_test-abc",
    issuer: "CN=Test Namespace CA",
    notBefore: new Date(Date.now() - 60_000),
    notAfter,
    signingAlgorithm: alg,
    publicKey,
    signingKey: caKeys.privateKey
  });
  return `${cert.toString("pem")}\n${intermediatePem}`;
};

const mockProvisionerNamespace = () => {
  let expiresAt = "";
  mockedPost.mockImplementation(async (url, body) => {
    if (url === CREATE_URL) {
      expiresAt = body.expiresAt as string;
      return { data: { bearerToken: CHILD_TOKEN, token: { tokenId: "tok_child", expiresAt } } };
    }
    if (url === EXCHANGE_URL) {
      return {
        data: { clientCertificatePem: await signClientCert(body.publicKeyPem as string, new Date(expiresAt)) }
      };
    }
    if (url === REVOKE_URL) return { data: {} };
    throw new Error(`unexpected url ${url}`);
  });
};

const mockFederatedNamespace = (expireAt: number) => {
  mockedPost.mockImplementation(async (url, body) => {
    if (url === FEDERATION_URL) return { data: { tenant_token: TENANT_TOKEN, tenant: { id: TENANT_ID } } };
    if (url === EXCHANGE_URL) {
      return { data: { clientCertificatePem: await signClientCert(body.publicKeyPem as string, new Date(expireAt)) } };
    }
    throw new Error(`unexpected url ${url}`);
  });
};

const expectFullChain = (pem: string) => {
  const blocks = pem.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g) ?? [];
  expect(blocks).toHaveLength(2);
  const [leaf, intermediate] = blocks as [string, string];
  expect(new crypto.X509Certificate(leaf).subject).toContain("CN=tenantcert-tenant_test-abc");
  expect(intermediate).toBe(intermediatePem.trim());
};

beforeAll(async () => {
  x509.cryptoProvider.set(webcrypto as unknown as Crypto);
  caKeys = (await webcrypto.subtle.generateKey(alg, true, ["sign", "verify"])) as CryptoKeyPair;
  intermediatePem = (
    await x509.X509CertificateGenerator.createSelfSigned({
      serialNumber: "02",
      name: "CN=Test Namespace CA",
      notBefore: new Date(Date.now() - 86_400_000),
      notAfter: new Date(Date.now() + 86_400_000),
      signingAlgorithm: alg,
      keys: caKeys
    })
  ).toString("pem");
});

beforeEach(() => {
  vi.clearAllMocks();
  mockedPost.mockReset();
  appConfig.SITE_URL = "https://app.test";
});

describe("NamespaceProvider with a provisioner token", () => {
  test("create mints a child token and exchanges it for a certificate matching the returned key", async () => {
    mockProvisionerNamespace();
    const expireAt = Date.parse("2026-11-22T15:00:00.000Z");

    const result = await provider().create(createArgs(expireAt));

    const [createCall, exchangeCall] = mockedPost.mock.calls;
    expect(createCall[0]).toBe(CREATE_URL);
    expect(createCall[1]).toMatchObject({
      expiresAt: "2026-11-22T15:00:00.000Z",
      access: { grants: [{ resourceType: "ingress", resourceId: "*", actions: ["access"] }] }
    });
    expect(createCall[2]).toMatchObject({ "axios-retry": { retries: 0 } });
    expect(exchangeCall[2].headers).toMatchObject({ Authorization: `Bearer ${CHILD_TOKEN}` });
    expect(exchangeCall[2]).toMatchObject({ "axios-retry": { retries: 0 } });

    const data = result.data as Record<string, string>;
    expect(result.entityId).toBe("tok_child");
    const privateKey = crypto.createPrivateKey(data.PRIVATE_KEY);
    expect(new crypto.X509Certificate(data.CLIENT_CERTIFICATE).checkPrivateKey(privateKey)).toBe(true);
    expectFullChain(data.CLIENT_CERTIFICATE);
  });

  test("create revokes the child token when the exchange fails, without the token in the error", async () => {
    mockedPost
      .mockResolvedValueOnce({ data: { bearerToken: CHILD_TOKEN, token: { tokenId: "tok_child" } } })
      .mockRejectedValueOnce(connectError(500, "internal", `token ${CHILD_TOKEN} broke`))
      .mockResolvedValueOnce({ data: {} });

    await expect(provider().create(createArgs(Date.now() + 60_000))).rejects.toThrow(
      "Failed to create Namespace client certificate: token [REDACTED] broke"
    );
    expect(mockedPost.mock.calls[2][0]).toBe(REVOKE_URL);
    expect(mockedPost.mock.calls[2][1]).toEqual({ tokenId: "tok_child" });
  });

  test("revoke treats a token Namespace no longer has as revoked", async () => {
    mockedPost.mockRejectedValueOnce(connectError(404, "not_found", "token not found"));

    await expect(provider().revoke(inputs, "tok_child", metadata)).resolves.toEqual({ entityId: "tok_child" });
  });

  test("rejects an auth method change while the dynamic secret has active leases", async () => {
    await expect(
      provider().validateProviderInputs(federationInputs, {
        ...metadata,
        previousInputs: inputs,
        hasActiveLeases: true
      })
    ).rejects.toThrow("The auth method can't be changed while this dynamic secret has active leases");
  });

  test("rejects a new provisioner token while the dynamic secret has active leases, because revokes use it", async () => {
    const leased = { ...metadata, previousInputs: inputs, hasActiveLeases: true };

    await expect(
      provider().validateProviderInputs({ ...inputs, provisionerToken: "nsrt_other-tenant" }, leased)
    ).rejects.toThrow("The provisioner token can't be changed while this dynamic secret has active leases");
    await expect(provider().validateProviderInputs(inputs, leased)).resolves.toMatchObject(inputs);
  });
});

describe("NamespaceProvider with federation", () => {
  test("create signs a token for the dynamic secret and exchanges it for a tenant token lasting the lease", async () => {
    const expireAt = Date.now() + 15 * 60 * 1000;
    mockFederatedNamespace(expireAt);

    const result = await provider().create(createArgs(expireAt, federationInputs));

    expect(signDynamicSecretToken).toHaveBeenCalledWith({
      dynamicSecret,
      orgId: ORG_ID,
      projectId: PROJECT_ID,
      audience: DEFAULT_AUDIENCE
    });
    const [federationUrl, federationBody] = mockedPost.mock.calls[0];
    expect(federationUrl).toBe(FEDERATION_URL);
    expect(federationBody).toMatchObject({ tenant_id: TENANT_ID, oidc_token: OIDC_TOKEN });
    expect(Number((federationBody.duration as string).replace(/s$/, ""))).toBeGreaterThanOrEqual(15 * 60 - 2);
    expect(mockedPost.mock.calls[1][2].headers).toMatchObject({ Authorization: `Bearer ${TENANT_TOKEN}` });
    expect(mockedPost.mock.calls[0][2]).toMatchObject({ "axios-retry": { retries: 0 } });
    expect(mockedPost.mock.calls[1][2]).toMatchObject({ "axios-retry": { retries: 0 } });

    const data = result.data as Record<string, string>;
    expect(result.entityId).toBe("cert:01");
    expectFullChain(data.CLIENT_CERTIFICATE);
  });

  test("create refuses a lease longer than 24 hours before calling Namespace", async () => {
    await expect(provider().create(createArgs(Date.now() + 25 * 60 * 60 * 1000, federationInputs))).rejects.toThrow(
      "Choose a lease TTL of 24 hours or less"
    );
    expect(mockedPost).not.toHaveBeenCalled();
  });

  test("create surfaces unauthenticated with the trust relationship to add, without the OIDC token", async () => {
    mockedPost.mockRejectedValueOnce(connectError(401, "unauthenticated", `bad token ${OIDC_TOKEN}`));

    const promise = provider().create(createArgs(Date.now() + 60_000, federationInputs));

    await expect(promise).rejects.toBeInstanceOf(BadRequestError);
    await expect(promise).rejects.toThrow(
      `Failed to create Namespace client certificate: bad token [REDACTED]. Check that the Namespace tenant tenant_test has a trust relationship with issuer https://app.test/api/v1/oidc-issuer/organizations/${ORG_ID}, subject dynamic-secret:ds-1, and audience ${DEFAULT_AUDIENCE}`
    );
  });

  test("revoke of a cert: lease is a no-op", async () => {
    await expect(provider().revoke(federationInputs, "cert:01", metadata)).resolves.toEqual({ entityId: "cert:01" });
    expect(mockedPost).not.toHaveBeenCalled();
  });

  test("validateConnection skips the exchange on create, when the dynamic secret has no ID yet", async () => {
    await expect(provider().validateConnection(federationInputs, metadata)).resolves.toBe(true);
    expect(mockedPost).not.toHaveBeenCalled();
  });
});

describe("getNamespaceOidcFederation", () => {
  test("returns the org issuer, the dynamic secret subject, and the audience for federation", () => {
    expect(getNamespaceOidcFederation(federationInputs, { id: "ds-1", orgId: ORG_ID })).toEqual({
      issuerUrl: `https://app.test/api/v1/oidc-issuer/organizations/${ORG_ID}`,
      subject: "dynamic-secret:ds-1",
      audience: DEFAULT_AUDIENCE
    });
  });

  test("returns the trust values with the default audience for provisioner token inputs", () => {
    expect(getNamespaceOidcFederation(inputs, { id: "ds-1", orgId: ORG_ID })).toEqual({
      issuerUrl: `https://app.test/api/v1/oidc-issuer/organizations/${ORG_ID}`,
      subject: "dynamic-secret:ds-1",
      audience: DEFAULT_AUDIENCE
    });
  });
});
