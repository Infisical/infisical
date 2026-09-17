import { beforeEach, describe, expect, test, vi } from "vitest";

import { identityGcpAuthServiceFactory } from "./identity-gcp-auth-service";
import { TGcpIdentityDetails } from "./identity-gcp-auth-types";

const { validateIamIdentity, validateIdTokenIdentity } = vi.hoisted(() => ({
  validateIamIdentity: vi.fn(),
  validateIdTokenIdentity: vi.fn()
}));

vi.mock("./identity-gcp-auth-fns", () => ({ validateIamIdentity, validateIdTokenIdentity }));

vi.mock("@app/lib/config/env", () => ({
  getConfig: () => ({ OTEL_TELEMETRY_COLLECTION_ENABLED: false })
}));

vi.mock("@fastify/request-context", () => ({
  requestContext: { get: vi.fn(() => undefined) }
}));

const IDENTITY_ID = "5d3a8b2e-7c61-4b0f-9f3e-2a1c4d6e8f90";
const ORG_ID = "org-id";
const ACCESS_TOKEN = "access-token";

const SERVICE_ACCOUNT = "gce-sa@my-project.iam.gserviceaccount.com";
const OTHER_SERVICE_ACCOUNT = "other-sa@other-project.iam.gserviceaccount.com";

const computeEngineDetails = {
  instance_creation_timestamp: 1700000000,
  instance_id: "3802628075545820873",
  instance_name: "test-instance",
  project_id: "my-project",
  project_number: 123456789,
  zone: "us-central1-a"
};

type TGcpAuthRow = {
  type: "gce" | "iam";
  allowedServiceAccounts: string | null;
  allowedProjects: string | null;
  allowedZones: string | null;
};

const makeService = (gcpAuth: Partial<TGcpAuthRow> = {}) => {
  const issueIdentityAccessToken = vi.fn().mockResolvedValue({
    accessToken: ACCESS_TOKEN,
    identityAccessToken: { id: "access-token-id" }
  });

  const service = identityGcpAuthServiceFactory({
    identityGcpAuthDAL: {
      findOne: vi.fn().mockResolvedValue({
        identityId: IDENTITY_ID,
        type: "gce",
        allowedServiceAccounts: null,
        allowedProjects: null,
        allowedZones: null,
        accessTokenTTL: 3600,
        accessTokenMaxTTL: 7200,
        accessTokenNumUsesLimit: 0,
        accessTokenPeriod: 0,
        accessTokenTrustedIps: [{ ipAddress: "0.0.0.0/0" }],
        ...gcpAuth
      })
    } as never,
    identityDAL: {
      findById: vi.fn().mockResolvedValue({ id: IDENTITY_ID, orgId: ORG_ID, name: "gce-identity" })
    } as never,
    orgDAL: {
      findById: vi.fn().mockResolvedValue({ id: ORG_ID, name: "org", slug: "org", rootOrgId: null, parentOrgId: null })
    } as never,
    membershipIdentityDAL: { update: vi.fn().mockResolvedValue(undefined) } as never,
    keyStore: { setItemWithExpiryNX: vi.fn().mockResolvedValue(null) } as never,
    identityAccessTokenDAL: {} as never,
    permissionService: {} as never,
    licenseService: {} as never,
    identityAccessTokenService: { issueIdentityAccessToken } as never
  });

  return { service, issueIdentityAccessToken };
};

const login = (gcpAuth: Partial<TGcpAuthRow>, details: TGcpIdentityDetails) => {
  const { service, issueIdentityAccessToken } = makeService(gcpAuth);
  validateIdTokenIdentity.mockResolvedValue(details);
  validateIamIdentity.mockResolvedValue(details);
  return { result: service.login({ identityId: IDENTITY_ID, jwt: "gcp-jwt" }), issueIdentityAccessToken };
};

beforeEach(() => {
  vi.clearAllMocks();
});

// A GCE ID token only carries google.compute_engine when it was minted by the metadata server on
// an instance. A token minted any other way by an allowed service account would otherwise sail
// past the project and zone allow lists, because `undefined === undefined` never matches an entry
// but the checks below read through an optional chain. Refusing the login is what keeps the
// allow lists from silently becoming a service-account-only check.
describe("gcpAuthService.login GCE Compute Engine detail requirement", () => {
  test("rejects a token with no Compute Engine details when projects are restricted", async () => {
    const { result, issueIdentityAccessToken } = login(
      { type: "gce", allowedProjects: "my-project" },
      { email: SERVICE_ACCOUNT, computeEngineDetails: undefined }
    );

    await expect(result).rejects.toThrow("Access denied: GCP identity token is missing the Compute Engine details");
    await expect(result).rejects.toMatchObject({
      detail: { reasonCode: "compute_engine_details_missing", identityId: IDENTITY_ID, orgId: ORG_ID }
    });
    expect(issueIdentityAccessToken).not.toHaveBeenCalled();
  });

  test("rejects a token with no Compute Engine details when zones are restricted", async () => {
    const { result } = login(
      { type: "gce", allowedZones: "us-central1-a" },
      { email: SERVICE_ACCOUNT, computeEngineDetails: undefined }
    );

    await expect(result).rejects.toMatchObject({ detail: { reasonCode: "compute_engine_details_missing" } });
  });

  // Nothing about the identity depends on where the token came from, so requiring GCE details
  // here would break every unrestricted GCE configuration in the field.
  test("allows a token with no Compute Engine details when neither projects nor zones are restricted", async () => {
    const { result } = login({ type: "gce" }, { email: SERVICE_ACCOUNT, computeEngineDetails: undefined });

    await expect(result).resolves.toMatchObject({ accessToken: ACCESS_TOKEN });
  });

  // IAM tokens are signed service account JWTs and never carry GCE details, so the guard must
  // stay scoped to the gce type even when the stale project and zone columns are populated.
  test("allows an IAM login even while project and zone columns are populated", async () => {
    const { result } = login(
      { type: "iam", allowedProjects: "my-project", allowedZones: "us-central1-a" },
      { email: SERVICE_ACCOUNT }
    );

    await expect(result).resolves.toMatchObject({ accessToken: ACCESS_TOKEN });
  });
});

describe("gcpAuthService.login GCE allow lists", () => {
  test("allows a token whose project and zone are both allowed", async () => {
    const { result } = login(
      {
        type: "gce",
        allowedServiceAccounts: `${OTHER_SERVICE_ACCOUNT}, ${SERVICE_ACCOUNT}`,
        allowedProjects: "other-project, my-project",
        allowedZones: "us-east1-b, us-central1-a"
      },
      { email: SERVICE_ACCOUNT, computeEngineDetails }
    );

    await expect(result).resolves.toMatchObject({ accessToken: ACCESS_TOKEN });
  });

  test("rejects a service account outside the allow list", async () => {
    const { result } = login(
      { type: "gce", allowedServiceAccounts: OTHER_SERVICE_ACCOUNT },
      { email: SERVICE_ACCOUNT, computeEngineDetails }
    );

    await expect(result).rejects.toMatchObject({ detail: { reasonCode: "service_account_not_allowed" } });
  });

  test("rejects an instance running in a project outside the allow list", async () => {
    const { result } = login(
      { type: "gce", allowedProjects: "other-project" },
      { email: SERVICE_ACCOUNT, computeEngineDetails }
    );

    await expect(result).rejects.toMatchObject({ detail: { reasonCode: "project_not_allowed" } });
  });

  test("rejects an instance running in a zone outside the allow list", async () => {
    const { result } = login(
      { type: "gce", allowedZones: "us-east1-b" },
      { email: SERVICE_ACCOUNT, computeEngineDetails }
    );

    await expect(result).rejects.toMatchObject({ detail: { reasonCode: "zone_not_allowed" } });
  });
});
