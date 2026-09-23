import { PkiSync } from "./pki-sync-enums";
import { hasAnyPkiSyncFilter } from "./pki-sync-filter-fns";
import {
  assertFiltersCannotExceedCertificateCap,
  assertPkiSyncCanHoldCertificateCount,
  getPkiSyncCertificateCap,
  getPkiSyncProviderCapabilities,
  matchesCertificateNameSchema,
  parsePkiSyncErrorMessage
} from "./pki-sync-fns";

// A dash-stripped UUID (what {{certificateId}}, {{profileId}}, {{applicationId}} resolve to).
const HEX = "550e8400e29b41d4a716446655440000";
const OTHER_HEX = "abcdef001111222233334444aaaaaaaa";

describe("matchesCertificateNameSchema (managed-certificate detection for cleanup)", () => {
  test("with no schema, treats every name as a candidate", () => {
    expect(matchesCertificateNameSchema("literally-anything", undefined)).toBe(true);
  });

  describe('schema "Infisical-{{certificateId}}"', () => {
    const schema = "Infisical-{{certificateId}}";

    test("matches a name Infisical produced", () => {
      expect(matchesCertificateNameSchema(`Infisical-${HEX}`, schema)).toBe(true);
    });

    test("matches any cert ID, not just one specific cert (so renewed/other certs are cleaned up)", () => {
      expect(matchesCertificateNameSchema(`Infisical-${OTHER_HEX}`, schema)).toBe(true);
    });

    test("rejects a name with a non-hex ID segment", () => {
      expect(matchesCertificateNameSchema("Infisical-not-a-real-id", schema)).toBe(false);
    });

    test("rejects an ID that is not exactly 32 hex chars", () => {
      expect(matchesCertificateNameSchema(`Infisical-${HEX.slice(0, 31)}`, schema)).toBe(false);
    });

    test("rejects extra prefix or suffix (anchored match)", () => {
      expect(matchesCertificateNameSchema(`prod-Infisical-${HEX}`, schema)).toBe(false);
      expect(matchesCertificateNameSchema(`Infisical-${HEX}-extra`, schema)).toBe(false);
    });

    // Deletion safety: a certificate that did NOT come from this schema must never be considered managed.
    test("does NOT match unrelated certificates", () => {
      expect(matchesCertificateNameSchema("my-own-prod-cert", schema)).toBe(false);
      expect(matchesCertificateNameSchema("acme-com-2024", schema)).toBe(false);
      expect(matchesCertificateNameSchema("", schema)).toBe(false);
    });
  });

  test("matches profile-ID based names", () => {
    expect(matchesCertificateNameSchema(`p-${HEX}`, "p-{{profileId}}")).toBe(true);
    expect(matchesCertificateNameSchema("p-notaprofile", "p-{{profileId}}")).toBe(false);
  });

  test("matches application-ID based names", () => {
    expect(matchesCertificateNameSchema(`${HEX}-cert`, "{{applicationId}}-cert")).toBe(true);
    expect(matchesCertificateNameSchema("xyz-cert", "{{applicationId}}-cert")).toBe(false);
  });

  describe('schema "{{commonName}}-{{certificateId}}"', () => {
    const schema = "{{commonName}}-{{certificateId}}";

    test("matches arbitrary common names anchored by the cert ID", () => {
      expect(matchesCertificateNameSchema(`app.example.com-${HEX}`, schema)).toBe(true);
      expect(matchesCertificateNameSchema(`anything.here-${HEX}`, schema)).toBe(true);
    });

    // The wildcard is for the common-name slot only; the cert-ID anchor still has to match.
    test("still requires a valid cert ID, so it does not match every name", () => {
      expect(matchesCertificateNameSchema("app.example.com-nothex", schema)).toBe(false);
    });
  });

  test("treats regex-special literal characters in the schema as literals", () => {
    const schema = "cert.{{certificateId}}.pem";
    expect(matchesCertificateNameSchema(`cert.${HEX}.pem`, schema)).toBe(true);
    // The '.' must be literal, not a regex any-char.
    expect(matchesCertificateNameSchema(`certX${HEX}Ypem`, schema)).toBe(false);
  });

  test("no longer expands {{environment}} (removed placeholder)", () => {
    // {{environment}} is treated as a literal now, so a name where it was substituted with 'global' won't match.
    expect(matchesCertificateNameSchema(`global-${HEX}`, "{{environment}}-{{certificateId}}")).toBe(false);
  });

  test("matches UUIDs whether dash-stripped or raw (AWS Secrets Manager stores the dashed form)", () => {
    const dashed = "550e8400-e29b-41d4-a716-446655440000";
    expect(matchesCertificateNameSchema(`infisical-${HEX}`, "infisical-{{certificateId}}")).toBe(true);
    expect(matchesCertificateNameSchema(`infisical-${dashed}`, "infisical-{{certificateId}}")).toBe(true);
  });

  test("common-name slot uses a constrained charset, not a greedy .*", () => {
    const schema = "{{commonName}}-{{certificateId}}";
    // a value containing characters outside the sanitized set (e.g. a space) must not match
    expect(matchesCertificateNameSchema(`weird name-${HEX}`, schema)).toBe(false);
    expect(matchesCertificateNameSchema(`weird/name-${HEX}`, schema)).toBe(false);
  });
});

describe("getPkiSyncProviderCapabilities: canRunPostSyncCommand", () => {
  // The service rejects a command on this, and the UI reads it from the API to decide whether the
  // Post-Sync Command step exists, so a destination added without it goes wrong in both places.
  const SHELL_DESTINATIONS = [PkiSync.LinuxServer, PkiSync.WindowsServer];

  test.each(SHELL_DESTINATIONS)("%s can run one", (destination) => {
    expect(getPkiSyncProviderCapabilities(destination).canRunPostSyncCommand).toBe(true);
  });

  test.each(Object.values(PkiSync).filter((destination) => !SHELL_DESTINATIONS.includes(destination)))(
    "%s cannot run one",
    (destination) => {
      expect(getPkiSyncProviderCapabilities(destination).canRunPostSyncCommand).toBe(false);
    }
  );

  test("every destination states the capability, so a new one cannot leave it undefined", () => {
    Object.values(PkiSync).forEach((destination) => {
      expect(typeof getPkiSyncProviderCapabilities(destination).canRunPostSyncCommand).toBe("boolean");
    });
  });
});

describe("parsePkiSyncErrorMessage", () => {
  // The three sync/import/remove message columns are varchar(1024), so an over-long message makes
  // the status write throw and leaves the sync stuck reporting "running".
  test("caps the message at the width of the columns it is written to", () => {
    const message = parsePkiSyncErrorMessage(new Error("x".repeat(2000)));

    expect(message).toHaveLength(1024);
    expect(message.endsWith("...")).toBe(true);
  });

  test("caps a thrown string too", () => {
    expect(parsePkiSyncErrorMessage("y".repeat(2000))).toHaveLength(1024);
  });

  test("leaves a provider message that fits the widened column alone", () => {
    const provider = `GCP rejected the certificate map entry creation: ${"detail ".repeat(60)}`;

    expect(provider.length).toBeGreaterThan(255);
    expect(parsePkiSyncErrorMessage(new Error(provider))).toBe(provider);
  });

  test("leaves a message that already fits untouched", () => {
    expect(parsePkiSyncErrorMessage(new Error("Connection refused by the destination host"))).toBe(
      "Connection refused by the destination host"
    );
  });

  test("falls back to a readable message for a non-error throw", () => {
    expect(parsePkiSyncErrorMessage({ weird: true })).toBe("An unknown error occurred during PKI sync operation");
  });
});

describe("assertPkiSyncCanHoldCertificateCount", () => {
  const multiCertSchema = { certificateNameSchema: "Infisical-{{certificateId}}" };

  test("a destination with no cap accepts any number of certificates", () => {
    expect(() =>
      assertPkiSyncCanHoldCertificateCount(PkiSync.AwsCertificateManager, multiCertSchema, undefined, 499)
    ).not.toThrow();
    expect(() =>
      assertPkiSyncCanHoldCertificateCount(PkiSync.AwsCertificateManager, multiCertSchema, undefined, 25_000)
    ).not.toThrow();
  });

  test("rejects more than one certificate on a single-certificate destination", () => {
    expect(() =>
      assertPkiSyncCanHoldCertificateCount(PkiSync.NutanixPrismCentral, multiCertSchema, undefined, 1)
    ).not.toThrow();
    expect(() =>
      assertPkiSyncCanHoldCertificateCount(PkiSync.NutanixPrismCentral, multiCertSchema, undefined, 2)
    ).toThrow("at most 1 certificate");
  });

  test("does not constrain a sync that holds one certificate", () => {
    expect(() =>
      assertPkiSyncCanHoldCertificateCount(PkiSync.LinuxServer, { certificateNameSchema: "static" }, undefined, 1)
    ).not.toThrow();
  });

  test("rejects a name schema with no placeholder once more than one certificate is held", () => {
    expect(() =>
      assertPkiSyncCanHoldCertificateCount(PkiSync.LinuxServer, { certificateNameSchema: "static" }, undefined, 2)
    ).toThrow("no placeholder");
  });

  test("rejects a sync with no name schema at all once more than one certificate is held", () => {
    expect(() => assertPkiSyncCanHoldCertificateCount(PkiSync.LinuxServer, undefined, undefined, 2)).toThrow(
      "no placeholder"
    );
  });

  test("accepts a name schema with a placeholder", () => {
    expect(() =>
      assertPkiSyncCanHoldCertificateCount(PkiSync.LinuxServer, multiCertSchema, undefined, 2)
    ).not.toThrow();
  });

  test("rejects a post-sync command that names a single certificate", () => {
    expect(() =>
      assertPkiSyncCanHoldCertificateCount(
        PkiSync.LinuxServer,
        { ...multiCertSchema, postSyncCommand: "cat {{certificatePath}}" },
        undefined,
        2
      )
    ).toThrow("certificatePath");
  });

  test("rejects a health-check command that names a single certificate", () => {
    expect(() =>
      assertPkiSyncCanHoldCertificateCount(
        PkiSync.LinuxServer,
        { ...multiCertSchema, healthCheckCommand: "openssl x509 -in {{certificatePath}}" },
        undefined,
        2
      )
    ).toThrow("certificatePath");
  });

  test("accepts a command that covers every certificate in the run", () => {
    expect(() =>
      assertPkiSyncCanHoldCertificateCount(
        PkiSync.LinuxServer,
        { ...multiCertSchema, postSyncCommand: "ls {{certificateDirectory}}" },
        undefined,
        2
      )
    ).not.toThrow();
  });

  test("ignores destinations without a config-derived cap", () => {
    expect(() =>
      assertPkiSyncCanHoldCertificateCount(PkiSync.AwsCertificateManager, multiCertSchema, { region: "us-east-2" }, 500)
    ).not.toThrow();
  });

  test("applies the GCP certificate map entry cap", () => {
    const gcp = { certificateMapBinding: { certificateMap: "my-map" } };
    expect(() =>
      assertPkiSyncCanHoldCertificateCount(PkiSync.GcpCertificateManager, multiCertSchema, gcp, 4)
    ).not.toThrow();
    expect(() => assertPkiSyncCanHoldCertificateCount(PkiSync.GcpCertificateManager, multiCertSchema, gcp, 5)).toThrow(
      "at most 4 certificates"
    );
  });
});

describe("hasAnyPkiSyncFilter", () => {
  test("is false when no filters are stored, which means the sync holds nothing", () => {
    expect(hasAnyPkiSyncFilter(null)).toBe(false);
    expect(hasAnyPkiSyncFilter(undefined)).toBe(false);
    expect(hasAnyPkiSyncFilter({})).toBe(false);
  });

  test("is true for a present filter, empty or not", () => {
    expect(hasAnyPkiSyncFilter({ profileIds: [] })).toBe(true);
    expect(hasAnyPkiSyncFilter({ certificateOrderIds: [] })).toBe(true);
    expect(hasAnyPkiSyncFilter({ metadata: [] })).toBe(true);
    expect(hasAnyPkiSyncFilter({ profileIds: ["p1"] })).toBe(true);
  });
});

describe("getPkiSyncCertificateCap", () => {
  const multiCertSchema = { certificateNameSchema: "{{certificateId}}" };

  test("no cap when the destination and options both allow many", () => {
    expect(getPkiSyncCertificateCap(PkiSync.AwsCertificateManager, multiCertSchema, {})).toBeUndefined();
  });

  test("caps at 1 for a destination that holds one certificate", () => {
    expect(getPkiSyncCertificateCap(PkiSync.NutanixPrismCentral, multiCertSchema, {})).toBe(1);
  });

  test("caps at 1 when the name schema has no placeholder", () => {
    expect(getPkiSyncCertificateCap(PkiSync.LinuxServer, { certificateNameSchema: "static" }, {})).toBe(1);
  });

  test("caps at 1 when a host command names a single certificate", () => {
    expect(
      getPkiSyncCertificateCap(
        PkiSync.LinuxServer,
        { ...multiCertSchema, postSyncCommand: "cat {{certificatePath}}" },
        {}
      )
    ).toBe(1);
  });

  test("caps at the GCP map-entry limit when a certificate map is bound", () => {
    expect(
      getPkiSyncCertificateCap(PkiSync.GcpCertificateManager, multiCertSchema, {
        certificateMapBinding: { certificateMap: "my-map" }
      })
    ).toBe(4);
  });

  test("takes the smallest applicable cap", () => {
    expect(
      getPkiSyncCertificateCap(
        PkiSync.GcpCertificateManager,
        { certificateNameSchema: "static" },
        {
          certificateMapBinding: { certificateMap: "my-map" }
        }
      )
    ).toBe(1);
  });
});

describe("assertFiltersCannotExceedCertificateCap", () => {
  const single = { certificateNameSchema: "static" };
  const many = { certificateNameSchema: "{{certificateId}}" };
  const assertSingle = (filters: Parameters<typeof assertFiltersCannotExceedCertificateCap>[3]) => () =>
    assertFiltersCannotExceedCertificateCap(PkiSync.LinuxServer, single, {}, filters);

  test("an uncapped sync accepts any filter", () => {
    expect(() =>
      assertFiltersCannotExceedCertificateCap(PkiSync.LinuxServer, many, {}, { profileIds: ["p"] })
    ).not.toThrow();
    expect(() => assertFiltersCannotExceedCertificateCap(PkiSync.LinuxServer, many, {}, null)).not.toThrow();
  });

  test("a single certificate order is accepted", () => {
    expect(assertSingle({ certificateOrderIds: ["o"] })).not.toThrow();
  });

  test("an empty list is accepted, since it matches nothing", () => {
    expect(assertSingle({ certificateOrderIds: [] })).not.toThrow();
  });

  test("a certificate order combined with a growable filter is rejected", () => {
    expect(assertSingle({ certificateOrderIds: ["o"], profileIds: ["p"] })).toThrow(
      "only accepts a certificate order filter. Remove the certificate profile filter."
    );
    expect(assertSingle({ certificateOrderIds: ["o"], metadata: [{ key: "tier" }] })).toThrow(
      "only accepts a certificate order filter. Remove the metadata filter."
    );
    expect(assertSingle({ certificateOrderIds: ["o"], profileIds: ["p"], metadata: [{ key: "tier" }] })).toThrow(
      "Remove the certificate profile and metadata filter."
    );
  });

  test("two certificate orders are rejected", () => {
    expect(assertSingle({ certificateOrderIds: ["o1", "o2"] })).toThrow("can name at most 1 certificate order");
  });

  test("a profile filter on its own is rejected, because it grows as certificates are issued", () => {
    expect(assertSingle({ profileIds: ["p"] })).toThrow("only accepts a certificate order filter");
  });

  test("a metadata filter on its own is rejected", () => {
    expect(assertSingle({ metadata: [{ key: "tier", value: "prod" }] })).toThrow(
      "only accepts a certificate order filter"
    );
  });

  test("a capped sync rejects a growable filter whatever its own cap is", () => {
    const gcp = { certificateMapBinding: { certificateMap: "my-map" } };
    expect(() =>
      assertFiltersCannotExceedCertificateCap(PkiSync.GcpCertificateManager, many, gcp, {
        certificateOrderIds: ["o1"],
        profileIds: ["p"]
      })
    ).toThrow("holds at most 4 certificates, so it only accepts a certificate order filter");
  });

  test("no filters at all is accepted, since a sync with no filters holds nothing", () => {
    expect(assertSingle(null)).not.toThrow();
    expect(assertSingle(undefined)).not.toThrow();
    expect(assertSingle({})).not.toThrow();
  });

  test("four certificate orders are accepted under the GCP map-entry cap but five are not", () => {
    const gcp = { certificateMapBinding: { certificateMap: "my-map" } };
    const four = ["o1", "o2", "o3", "o4"];
    expect(() =>
      assertFiltersCannotExceedCertificateCap(PkiSync.GcpCertificateManager, many, gcp, { certificateOrderIds: four })
    ).not.toThrow();
    expect(() =>
      assertFiltersCannotExceedCertificateCap(PkiSync.GcpCertificateManager, many, gcp, {
        certificateOrderIds: [...four, "e"]
      })
    ).toThrow("can name at most 4 certificate orders");
  });
});
