import { UnauthorizedError } from "@app/lib/errors";

import { validateGcpAllowlists } from "./gcp-auth-fns";
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

describe("validateGcpAllowlists", () => {
  test("refuses a config with no allowlist at all", () => {
    expect(reasonCodeOf(() => validate({}))).toBe("no_allowlist_configured");
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

  // Zone names are a global namespace, so a zone-only config restricts nobody.
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

  // A GKE workload identity token carries no compute_engine claim. Skipping the project check
  // there would authenticate any Google service account against a project-only allowlist.
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
