import { UnauthorizedError } from "@app/lib/errors";
import { validateIamIdentity, validateIdTokenIdentity } from "@app/services/identity-gcp-auth/identity-gcp-auth-fns";

import { assertIamTokenLifetime, validateGcpAllowlists, verifyGcpTokenAndExtractCaller } from "./gcp-auth-fns";
import { GcpAuthType } from "./resource-auth-method-fns";

const SERVICE_ACCOUNT = "gateway@my-project.iam.gserviceaccount.com";

const computeEngineDetails = {
  instance_creation_timestamp: 0,
  instance_id: "1",
  instance_name: "gw",
  project_id: "my-project",
  project_number: 1,
  zone: "us-central1-a"
};

const validate = (overrides: Partial<Parameters<typeof validateGcpAllowlists>[0]>) =>
  validateGcpAllowlists({
    type: GcpAuthType.Gce,
    identityDetails: { email: SERVICE_ACCOUNT, computeEngineDetails },
    allowedServiceAccounts: "",
    allowedProjects: "",
    allowedZones: "",
    errorContext: {},
    ...overrides
  });

const reasonCodeOf = (fn: () => void) => {
  try {
    fn();
  } catch (err) {
    if (err instanceof UnauthorizedError) return err.detail?.reasonCode;
    throw err;
  }
  return undefined;
};

describe("assertIamTokenLifetime", () => {
  const now = 1_700_000_000;

  test("refuses a token with no expiry", () => {
    expect(assertIamTokenLifetime({}, now)).toBe("missing_expiry");
  });

  test("refuses a null payload", () => {
    expect(assertIamTokenLifetime(null, now)).toBe("missing_expiry");
  });

  test("refuses an expired token", () => {
    expect(assertIamTokenLifetime({ exp: now - 1 }, now)).toBe("expired");
  });

  test("refuses an expiry beyond the 12 hour cap", () => {
    expect(assertIamTokenLifetime({ exp: now + 12 * 60 * 60 + 1 }, now)).toBe("lifetime_too_long");
  });

  test("accepts an expiry inside the cap", () => {
    expect(assertIamTokenLifetime({ exp: now + 600 }, now)).toBeNull();
  });
});

describe("validateGcpAllowlists", () => {
  test("refuses a config with no allowlist at all", () => {
    expect(reasonCodeOf(() => validate({}))).toBe("no_allowlist_configured");
  });

  test("accepts a Compute Engine default service account", () => {
    expect(() =>
      validate({
        identityDetails: { email: "846740905972-compute@developer.gserviceaccount.com" },
        allowedServiceAccounts: "846740905972-compute@developer.gserviceaccount.com"
      })
    ).not.toThrow();
  });

  test("accepts a service account on the allowlist", () => {
    expect(() =>
      validate({ allowedServiceAccounts: `other@x.iam.gserviceaccount.com, ${SERVICE_ACCOUNT}` })
    ).not.toThrow();
  });

  test("refuses a service account off the allowlist", () => {
    expect(reasonCodeOf(() => validate({ allowedServiceAccounts: "other@x.iam.gserviceaccount.com" }))).toBe(
      "service_account_not_allowed"
    );
  });

  test("refuses a zone-only config", () => {
    expect(reasonCodeOf(() => validate({ allowedZones: "us-central1-a" }))).toBe("no_allowlist_configured");
  });

  test("refuses a zone-only config even when the zone matches", () => {
    expect(reasonCodeOf(() => validate({ allowedZones: "us-central1-a,europe-west1-b" }))).toBe(
      "no_allowlist_configured"
    );
  });

  test("accepts a zone alongside a service account", () => {
    expect(() => validate({ allowedServiceAccounts: SERVICE_ACCOUNT, allowedZones: "us-central1-a" })).not.toThrow();
  });

  test("accepts a matching project and zone", () => {
    expect(() => validate({ allowedProjects: "my-project", allowedZones: "us-central1-a" })).not.toThrow();
  });

  test("refuses a project off the allowlist", () => {
    expect(reasonCodeOf(() => validate({ allowedProjects: "other-project" }))).toBe("project_not_allowed");
  });

  test("refuses a zone off the allowlist", () => {
    expect(
      reasonCodeOf(() => validate({ allowedServiceAccounts: SERVICE_ACCOUNT, allowedZones: "europe-west1-b" }))
    ).toBe("zone_not_allowed");
  });

  test("refuses a project allowlist when the token carries no Compute Engine details", () => {
    expect(
      reasonCodeOf(() =>
        validate({
          identityDetails: { email: SERVICE_ACCOUNT },
          allowedProjects: "my-project"
        })
      )
    ).toBe("compute_engine_details_missing");
  });

  test("refuses a project allowlist on an IAM-signed token", () => {
    expect(
      reasonCodeOf(() =>
        validate({
          type: GcpAuthType.Iam,
          identityDetails: { email: SERVICE_ACCOUNT },
          allowedProjects: "my-project"
        })
      )
    ).toBe("compute_engine_details_missing");
  });

  test("accepts an IAM-signed token restricted by service account alone", () => {
    expect(() =>
      validate({
        type: GcpAuthType.Iam,
        identityDetails: { email: SERVICE_ACCOUNT },
        allowedServiceAccounts: SERVICE_ACCOUNT
      })
    ).not.toThrow();
  });
});

vi.mock("@app/services/identity-gcp-auth/identity-gcp-auth-fns", () => ({
  validateIdTokenIdentity: vi.fn(),
  validateIamIdentity: vi.fn()
}));

// Neither the logger nor the crypto layer is initialised in the unit environment.
vi.mock("@app/lib/logger", () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));
vi.mock("@app/lib/crypto", () => ({
  crypto: {
    jwt: () => ({
      decode: (token: string) =>
        JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString()) as Record<string, unknown>
    })
  }
}));

describe("verifyGcpTokenAndExtractCaller", () => {
  const errorContext = { resourceId: "gw-1", orgId: "org-1" };
  const futureExp = Math.floor(Date.now() / 1000) + 600;
  const jwtWith = (payload: object) => `x.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.y`;

  beforeEach(() => {
    vi.mocked(validateIdTokenIdentity).mockReset();
    vi.mocked(validateIamIdentity).mockReset();
  });

  test("dispatches the gce type to the ID token validator", async () => {
    vi.mocked(validateIdTokenIdentity).mockResolvedValue({ email: SERVICE_ACCOUNT, computeEngineDetails: undefined });
    await verifyGcpTokenAndExtractCaller({ type: "gce", jwt: "t", audience: "gw-1", errorContext });
    expect(validateIdTokenIdentity).toHaveBeenCalledWith({ audience: "gw-1", jwt: "t" });
    expect(validateIamIdentity).not.toHaveBeenCalled();
  });

  test("dispatches the iam type to the signed JWT validator", async () => {
    vi.mocked(validateIamIdentity).mockResolvedValue({ email: SERVICE_ACCOUNT });
    const jwt = jwtWith({ sub: SERVICE_ACCOUNT, aud: "gw-1", exp: futureExp });
    await verifyGcpTokenAndExtractCaller({ type: "iam", jwt, audience: "gw-1", errorContext });
    expect(validateIamIdentity).toHaveBeenCalledWith({ audience: "gw-1", jwt });
    expect(validateIdTokenIdentity).not.toHaveBeenCalled();
  });

  test("wraps a verification failure as an unauthorized error carrying the resource id", async () => {
    vi.mocked(validateIdTokenIdentity).mockRejectedValue(new Error("bad signature"));
    await expect(
      verifyGcpTokenAndExtractCaller({ type: "gce", jwt: "t", audience: "gw-1", errorContext })
    ).rejects.toMatchObject({
      detail: { reasonCode: "gcp_token_verification_failed", resourceId: "gw-1" }
    });
  });

  test("wraps an unauthorized error raised by the validator itself", async () => {
    vi.mocked(validateIamIdentity).mockRejectedValue(new UnauthorizedError({ message: "Invalid audience" }));
    await expect(
      verifyGcpTokenAndExtractCaller({
        type: "iam",
        jwt: jwtWith({ sub: SERVICE_ACCOUNT, aud: "gw-1", exp: futureExp }),
        audience: "gw-1",
        errorContext
      })
    ).rejects.toMatchObject({
      detail: { reasonCode: "gcp_token_verification_failed", resourceId: "gw-1" }
    });
  });

  test("refuses a verified iam token whose payload has no expiry", async () => {
    vi.mocked(validateIamIdentity).mockResolvedValue({ email: SERVICE_ACCOUNT });
    await expect(
      verifyGcpTokenAndExtractCaller({
        type: "iam",
        jwt: jwtWith({ sub: SERVICE_ACCOUNT, aud: "gw-1" }),
        audience: "gw-1",
        errorContext
      })
    ).rejects.toMatchObject({ detail: { reasonCode: "gcp_token_lifetime_rejected" } });
  });
});
