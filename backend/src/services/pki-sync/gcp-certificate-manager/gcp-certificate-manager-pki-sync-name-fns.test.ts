import {
  buildGcpCertificateMapEntryResourceName,
  buildGcpCertificateResourceName,
  toGcpCertificateId,
  toGcpCertificateMapEntryId
} from "./gcp-certificate-manager-pki-sync-name-fns";

describe("toGcpCertificateId", () => {
  test("lowercases names the shared compiler leaves in mixed case", () => {
    expect(toGcpCertificateId("Infisical-Web.Example.COM")).toBe("infisical-web-example-com");
  });

  test("normalizes the legacy Infisical-<id> fallback name", () => {
    const hex = "550e8400e29b41d4a716446655440000";
    expect(toGcpCertificateId(`Infisical-${hex}`)).toBe(`infisical-${hex}`);
  });

  test("replaces disallowed characters and collapses the result", () => {
    expect(toGcpCertificateId("infisical_web..example")).toBe("infisical-web-example");
    expect(toGcpCertificateId("infisical/prod cert")).toBe("infisical-prod-cert");
  });

  test("trims leading and trailing hyphens", () => {
    expect(toGcpCertificateId("--infisical-cert--")).toBe("infisical-cert");
    expect(toGcpCertificateId(".infisical.")).toBe("infisical");
  });

  test("truncates to 63 characters", () => {
    expect(toGcpCertificateId("a".repeat(80))).toHaveLength(63);
  });

  test("keeps the leading letter and stays unique when the compiled name is too long", () => {
    const commonName = "a".repeat(58);
    const first = toGcpCertificateId(`infisical-${commonName}-${"1".repeat(32)}`);
    const second = toGcpCertificateId(`infisical-${commonName}-${"2".repeat(32)}`);

    // Two certificates must not collide on one GCP resource, which is what the digest suffix buys.
    expect(first).not.toBe(second);
    expect(first.length).toBeLessThanOrEqual(63);
    expect(second.length).toBeLessThanOrEqual(63);
    // GCP rejects an ID that does not start with a letter, so the schema's prefix has to survive.
    expect(first.startsWith("infisical-")).toBe(true);
    expect(second.startsWith("infisical-")).toBe(true);
  });

  test("resolves a long name to the same ID every time, so re-syncs are idempotent", () => {
    const name = `infisical-${"a".repeat(58)}-${"1".repeat(32)}`;
    expect(toGcpCertificateId(name)).toBe(toGcpCertificateId(name));
  });

  test("refuses a name that would produce an ID GCP rejects", () => {
    // A bare hex certificate ID starts with a digit most of the time; GCP requires a letter.
    expect(() => toGcpCertificateId("3f2a9c1d4e5b6a7c8d9e0f1a2b3c4d5e")).toThrow(/start with a letter/);
  });

  test("leaves an already valid ID untouched", () => {
    expect(toGcpCertificateId("infisical-abc-123")).toBe("infisical-abc-123");
  });

  test("throws when nothing usable survives normalization", () => {
    expect(() => toGcpCertificateId("!!!")).toThrow(/cannot be converted into a GCP Certificate Manager resource ID/);
    expect(() => toGcpCertificateId("")).toThrow();
  });
});

describe("toGcpCertificateMapEntryId", () => {
  test("derives a stable entry ID from the sync so renewals repoint one entry", () => {
    const syncId = "550e8400-e29b-41d4-a716-446655440000";
    expect(toGcpCertificateMapEntryId(syncId)).toBe("infisical-550e8400-e29b-41d4-a716-446655440000");
    expect(toGcpCertificateMapEntryId(syncId)).toBe(toGcpCertificateMapEntryId(syncId));
  });

  test("stays inside GCP's 63 character limit", () => {
    expect(toGcpCertificateMapEntryId("550e8400-e29b-41d4-a716-446655440000").length).toBeLessThanOrEqual(63);
  });
});

describe("resource name builders", () => {
  test("builds a fully qualified certificate name", () => {
    expect(
      buildGcpCertificateResourceName({
        gcpProjectId: "my-prod-project",
        location: "global",
        certificateId: "infisical-abc"
      })
    ).toBe("projects/my-prod-project/locations/global/certificates/infisical-abc");
  });

  test("always builds certificate map entry names under the global location", () => {
    expect(
      buildGcpCertificateMapEntryResourceName({
        gcpProjectId: "my-prod-project",
        certificateMap: "prod-map",
        entryId: "infisical-entry"
      })
    ).toBe("projects/my-prod-project/locations/global/certificateMaps/prod-map/certificateMapEntries/infisical-entry");
  });
});
