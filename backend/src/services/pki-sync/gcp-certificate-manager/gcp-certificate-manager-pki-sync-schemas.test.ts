import { GcpCertificateManagerScope } from "./gcp-certificate-manager-pki-sync-enums";
import {
  CreateGcpCertificateManagerPkiSyncSchema,
  GcpCertificateManagerPkiSyncConfigSchema,
  GcpCertificateManagerPkiSyncOptionsSchema
} from "./gcp-certificate-manager-pki-sync-schemas";
import { assertGcpCertificateManagerConfigUpdate } from "./gcp-certificate-manager-pki-sync-update-fns";

const parseConfig = (overrides: Record<string, unknown> = {}) =>
  GcpCertificateManagerPkiSyncConfigSchema.safeParse({
    gcpProjectId: "my-prod-project",
    location: "global",
    ...overrides
  });

describe("GCP Certificate Manager certificateNameSchema validation", () => {
  const accepts = (certificateNameSchema: string) =>
    GcpCertificateManagerPkiSyncOptionsSchema.safeParse({ certificateNameSchema }).success;

  test("accepts the destination default and other lowercase schemas", () => {
    expect(accepts("infisical-{{certificateId}}")).toBe(true);
    expect(accepts("cert-{{shortCertificateId}}")).toBe(true);
    expect(accepts("infisical-{{commonName}}-{{certificateId}}")).toBe(true);
  });

  test("rejects a schema that opens with a placeholder, since GCP IDs must start with a letter", () => {
    // A hex or base62 identifier can start with a digit, which GCP rejects outright.
    expect(accepts("{{certificateId}}")).toBe(false);
    expect(accepts("{{shortCertificateId}}")).toBe(false);
    expect(accepts("{{commonName}}-{{certificateId}}")).toBe(false);
  });

  test("rejects uppercase, which GCP resource IDs do not allow", () => {
    expect(accepts("Infisical-{{certificateId}}")).toBe(false);
    expect(accepts("infisical-PROD-{{certificateId}}")).toBe(false);
  });

  test("rejects underscores, dots and spaces", () => {
    expect(accepts("infisical_{{certificateId}}")).toBe(false);
    expect(accepts("infisical.{{certificateId}}")).toBe(false);
    expect(accepts("infisical {{certificateId}}")).toBe(false);
  });

  test("requires a per-certificate identifier so names cannot collide", () => {
    expect(accepts("static-name")).toBe(false);
    expect(accepts("infisical-{{commonName}}")).toBe(false);
  });

  test("rejects schemas that compile past 63 characters", () => {
    expect(accepts(`${"a".repeat(31)}{{certificateId}}`)).toBe(true); // 31 + 32 = 63
    expect(accepts(`${"a".repeat(32)}{{certificateId}}`)).toBe(false); // 32 + 32 = 64
  });

  test("omits postSyncCommand, which has no meaning for a cloud API destination", () => {
    const parsed = GcpCertificateManagerPkiSyncOptionsSchema.safeParse({
      certificateNameSchema: "infisical-{{certificateId}}",
      postSyncCommand: "echo hi"
    });

    expect(parsed.success).toBe(true);
    expect(parsed.success && "postSyncCommand" in parsed.data).toBe(false);
  });

  test("defaults preserveItemOnRenewal to true so rotation happens in place", () => {
    const parsed = GcpCertificateManagerPkiSyncOptionsSchema.safeParse({
      certificateNameSchema: "infisical-{{certificateId}}"
    });

    expect(parsed.success && parsed.data.preserveItemOnRenewal).toBe(true);
    expect(parsed.success && parsed.data.includeRootCa).toBe(false);
  });
});

describe("GCP Certificate Manager destinationConfig validation", () => {
  test("accepts a valid global configuration and defaults the scope", () => {
    const parsed = parseConfig();
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.scope).toBe(GcpCertificateManagerScope.Default);
  });

  test("rejects malformed GCP project IDs", () => {
    expect(parseConfig({ gcpProjectId: "My-Project" }).success).toBe(false);
    expect(parseConfig({ gcpProjectId: "1project" }).success).toBe(false);
    expect(parseConfig({ gcpProjectId: "proj" }).success).toBe(false);
    expect(parseConfig({ gcpProjectId: "project-" }).success).toBe(false);
  });

  test("accepts regional locations", () => {
    expect(parseConfig({ location: "us-central1" }).success).toBe(true);
    expect(parseConfig({ location: "US-CENTRAL1" }).success).toBe(false);
  });

  test("allows ALL_REGIONS only on global certificates", () => {
    expect(parseConfig({ scope: GcpCertificateManagerScope.AllRegions }).success).toBe(true);
    expect(parseConfig({ scope: GcpCertificateManagerScope.AllRegions, location: "us-central1" }).success).toBe(false);
  });

  test("allows certificate map binding only on global certificates", () => {
    expect(parseConfig({ certificateMapBinding: { certificateMap: "prod-map" } }).success).toBe(true);
    expect(
      parseConfig({ location: "us-central1", certificateMapBinding: { certificateMap: "prod-map" } }).success
    ).toBe(false);
  });

  test("allows certificate map binding only on the default scope", () => {
    const rejected = parseConfig({
      scope: GcpCertificateManagerScope.EdgeCache,
      certificateMapBinding: { certificateMap: "prod-map" }
    });

    expect(rejected.success).toBe(false);
    expect(!rejected.success && rejected.error.issues[0].message).toContain("requires the Default scope");
    expect(
      parseConfig({
        scope: GcpCertificateManagerScope.Default,
        certificateMapBinding: { certificateMap: "prod-map" }
      }).success
    ).toBe(true);
  });

  test("validates the bound hostname", () => {
    expect(parseConfig({ certificateMapBinding: { certificateMap: "m", hostname: "app.example.com" } }).success).toBe(
      true
    );
    expect(parseConfig({ certificateMapBinding: { certificateMap: "m", hostname: "*.example.com" } }).success).toBe(
      true
    );
    expect(parseConfig({ certificateMapBinding: { certificateMap: "m", hostname: "not a hostname" } }).success).toBe(
      false
    );
  });

  test("rejects a connection ID that is not a UUID, rather than failing in the DAL", () => {
    expect(
      CreateGcpCertificateManagerPkiSyncSchema.safeParse({
        name: "gcp-sync",
        connectionId: "not-a-uuid",
        destinationConfig: { gcpProjectId: "my-prod-project", location: "global" },
        syncOptions: { certificateNameSchema: "infisical-{{certificateId}}" }
      }).success
    ).toBe(false);
  });

  test("rejects certificate map names GCP would refuse", () => {
    expect(parseConfig({ certificateMapBinding: { certificateMap: "Prod_Map" } }).success).toBe(false);
  });
});

describe("GCP Certificate Manager create schema", () => {
  const createPayload = (overrides: Record<string, unknown>) =>
    CreateGcpCertificateManagerPkiSyncSchema.safeParse({
      name: "gcp-sync",
      connectionId: "33333333-3333-3333-3333-333333333333",
      destinationConfig: { gcpProjectId: "my-prod-project", location: "global" },
      syncOptions: { certificateNameSchema: "infisical-{{certificateId}}" },
      ...overrides
    });

  test("accepts certificate map binding up to the GCP limit of four certificates", () => {
    // GCP: "There can be defined up to four certificates in each Certificate Map Entry", which is
    // how an RSA and an ECDSA certificate serve one hostname.
    const parsed = createPayload({
      destinationConfig: {
        gcpProjectId: "my-prod-project",
        location: "global",
        certificateMapBinding: { certificateMap: "prod-map", hostname: "app.example.com" }
      },
      certificateIds: [
        "11111111-1111-1111-1111-111111111111",
        "22222222-2222-2222-2222-222222222222",
        "33333333-3333-3333-3333-333333333333",
        "44444444-4444-4444-4444-444444444444"
      ]
    });

    expect(parsed.success).toBe(true);
  });

  test("rejects certificate map binding past the GCP limit of four certificates", () => {
    const parsed = createPayload({
      destinationConfig: {
        gcpProjectId: "my-prod-project",
        location: "global",
        certificateMapBinding: { certificateMap: "prod-map", hostname: "app.example.com" }
      },
      certificateIds: [
        "11111111-1111-1111-1111-111111111111",
        "22222222-2222-2222-2222-222222222222",
        "33333333-3333-3333-3333-333333333333",
        "44444444-4444-4444-4444-444444444444",
        "55555555-5555-5555-5555-555555555555"
      ]
    });

    expect(parsed.success).toBe(false);
  });

  test("accepts certificate map binding with a single certificate", () => {
    const parsed = createPayload({
      destinationConfig: {
        gcpProjectId: "my-prod-project",
        location: "global",
        certificateMapBinding: { certificateMap: "prod-map" }
      },
      certificateIds: ["11111111-1111-1111-1111-111111111111"]
    });

    expect(parsed.success).toBe(true);
  });
});

describe("assertGcpCertificateManagerConfigUpdate", () => {
  const previous = { gcpProjectId: "my-prod-project", location: "global", scope: GcpCertificateManagerScope.Default };

  test("allows updates that leave the immutable fields alone", () => {
    expect(() =>
      assertGcpCertificateManagerConfigUpdate(previous, {
        ...previous,
        certificateMapBinding: { certificateMap: "prod-map" }
      })
    ).not.toThrow();
  });

  test("rejects a location change", () => {
    expect(() => assertGcpCertificateManagerConfigUpdate(previous, { ...previous, location: "us-central1" })).toThrow(
      /location is immutable/
    );
  });

  test("rejects a scope change", () => {
    expect(() =>
      assertGcpCertificateManagerConfigUpdate(previous, { ...previous, scope: GcpCertificateManagerScope.EdgeCache })
    ).toThrow(/scope is immutable/);
  });

  test("rejects a project change", () => {
    expect(() =>
      assertGcpCertificateManagerConfigUpdate(previous, { ...previous, gcpProjectId: "other-project" })
    ).toThrow(/GCP project cannot be changed/);
  });
});

describe("GCP Certificate Manager user labels", () => {
  const parseLabels = (labels: unknown) =>
    GcpCertificateManagerPkiSyncOptionsSchema.safeParse({
      certificateNameSchema: "infisical-{{certificateId}}",
      labels
    });

  test("accepts GCP-legal label keys and values", () => {
    expect(parseLabels([{ key: "team", value: "platform" }]).success).toBe(true);
    expect(parseLabels([{ key: "cost-center_1", value: "" }]).success).toBe(true);
    expect(parseLabels(undefined).success).toBe(true);
  });

  test("rejects keys GCP would refuse", () => {
    expect(parseLabels([{ key: "Team", value: "x" }]).success).toBe(false);
    expect(parseLabels([{ key: "1team", value: "x" }]).success).toBe(false);
    expect(parseLabels([{ key: "team.name", value: "x" }]).success).toBe(false);
    expect(parseLabels([{ key: "", value: "x" }]).success).toBe(false);
    expect(parseLabels([{ key: "a".repeat(64), value: "x" }]).success).toBe(false);
  });

  test("rejects values GCP would refuse", () => {
    expect(parseLabels([{ key: "team", value: "Platform" }]).success).toBe(false);
    expect(parseLabels([{ key: "team", value: "a b" }]).success).toBe(false);
    expect(parseLabels([{ key: "team", value: "a".repeat(64) }]).success).toBe(false);
  });

  test("refuses to let a user override Infisical's own labels", () => {
    expect(parseLabels([{ key: "managed-by", value: "someone-else" }]).success).toBe(false);
    expect(parseLabels([{ key: "infisical-certificate-id", value: "abc" }]).success).toBe(false);
  });

  test("rejects duplicate keys", () => {
    const parsed = parseLabels([
      { key: "team", value: "a" },
      { key: "team", value: "b" }
    ]);
    expect(parsed.success).toBe(false);
    expect(parsed.success === false && JSON.stringify(parsed.error.issues)).toContain("Duplicate label key");
  });

  test("caps the count so Infisical's two labels always fit GCP's limit of 64", () => {
    const make = (n: number) => Array.from({ length: n }, (_, i) => ({ key: `k${i}`, value: "v" }));
    expect(parseLabels(make(62)).success).toBe(true);
    expect(parseLabels(make(63)).success).toBe(false);
  });
});
