import {
  buildCertificateNameSchemaTestName,
  buildManagedCertificateNameRegexSource,
  certificateNameSchemaHasFreeTextPlaceholder,
  compileCertificateNameSchema,
  sanitizeCertificateNameValue,
  shortenUuid
} from "./pki-sync-certificate-name-fns";
import { PkiSync } from "./pki-sync-enums";

const CERT_ID = "550e8400-e29b-41d4-a716-446655440000";
const CERT_ID_CLEAN = "550e8400e29b41d4a716446655440000";
const CERT_ID_SHORT = shortenUuid(CERT_ID);
const PROFILE_ID = "11111111-2222-3333-4444-555555555555";
const PROFILE_ID_CLEAN = "11111111222233334444555555555555";
const APP_ID = "abcdef00-1111-2222-3333-444444444444";
const APP_ID_CLEAN = "abcdef00111122223333444444444444";

describe("shortenUuid", () => {
  test("encodes a UUID as a fixed 22-char base62 string", () => {
    expect(shortenUuid(CERT_ID)).toBe("2aUyqjCzEIiEcYMKj7TZtw");
    expect(shortenUuid(CERT_ID)).toHaveLength(22);
  });

  test("is stable regardless of dashes in the input", () => {
    expect(shortenUuid(CERT_ID)).toBe(shortenUuid(CERT_ID.replace(/-/g, "")));
  });

  test("left-pads small values to keep a fixed width", () => {
    expect(shortenUuid("00000000-0000-0000-0000-000000000000")).toBe("0".repeat(22));
  });

  test("only ever emits base62 (alphanumeric) characters", () => {
    expect(shortenUuid(APP_ID)).toMatch(/^[0-9A-Za-z]{22}$/);
  });

  test("falls back to the dash-stripped value when the input is not a UUID", () => {
    expect(shortenUuid("not-a-uuid")).toBe("notauuid");
  });
});

describe("compileCertificateNameSchema", () => {
  test("strips dashes from the certificate ID", () => {
    expect(compileCertificateNameSchema("Infisical-{{certificateId}}", { certificateId: CERT_ID })).toBe(
      `Infisical-${CERT_ID_CLEAN}`
    );
  });

  test("resolves {{shortCertificateId}} to the 22-char base62 form", () => {
    expect(compileCertificateNameSchema("Infisical-{{shortCertificateId}}", { certificateId: CERT_ID })).toBe(
      `Infisical-${CERT_ID_SHORT}`
    );
  });

  test("substitutes the common name (FQDN) verbatim when no destination is given", () => {
    expect(
      compileCertificateNameSchema("{{commonName}}-{{certificateId}}", {
        certificateId: CERT_ID,
        commonName: "app.example.com"
      })
    ).toBe(`app.example.com-${CERT_ID_CLEAN}`);
  });

  describe("per-destination common-name sanitization", () => {
    test("Azure Key Vault: dots (forbidden) become hyphens", () => {
      expect(
        compileCertificateNameSchema(
          "cert-{{commonName}}",
          { certificateId: CERT_ID, commonName: "app.example.com" },
          PkiSync.AzureKeyVault
        )
      ).toBe("cert-app-example-com");
    });

    test("Chef: dots become hyphens", () => {
      expect(
        compileCertificateNameSchema(
          "{{commonName}}",
          { certificateId: CERT_ID, commonName: "app.example.com" },
          PkiSync.Chef
        )
      ).toBe("app-example-com");
    });

    test("NetScaler: dots are allowed, so the FQDN is preserved", () => {
      expect(
        compileCertificateNameSchema(
          "{{commonName}}-{{certificateId}}",
          { certificateId: CERT_ID, commonName: "app.example.com" },
          PkiSync.NetScaler
        )
      ).toBe(`app.example.com-${CERT_ID_CLEAN}`);
    });

    test("wildcard CN: '*' is sanitized for every destination", () => {
      expect(
        compileCertificateNameSchema(
          "{{commonName}}",
          { certificateId: CERT_ID, commonName: "*.example.com" },
          PkiSync.NetScaler
        )
      ).toBe("-.example.com");
    });
  });

  test("substitutes the application name (sanitized per destination)", () => {
    expect(
      compileCertificateNameSchema(
        "{{applicationName}}-{{certificateId}}",
        { certificateId: CERT_ID, applicationName: "My App!" },
        PkiSync.NetScaler
      )
    ).toBe(`My-App--${CERT_ID_CLEAN}`);
  });

  test("resolves application name to empty when the sync has no application", () => {
    expect(compileCertificateNameSchema("app-{{applicationName}}-{{certificateId}}", { certificateId: CERT_ID })).toBe(
      `app--${CERT_ID_CLEAN}`
    );
  });

  test("substitutes the profile ID (dashes stripped)", () => {
    expect(compileCertificateNameSchema("{{profileId}}", { certificateId: CERT_ID, profileId: PROFILE_ID })).toBe(
      PROFILE_ID_CLEAN
    );
  });

  test("falls back to the certificate ID when the certificate has no profile", () => {
    expect(compileCertificateNameSchema("{{profileId}}", { certificateId: CERT_ID, profileId: null })).toBe(
      CERT_ID_CLEAN
    );
  });

  test("substitutes the application ID (dashes stripped)", () => {
    expect(
      compileCertificateNameSchema("{{applicationId}}-cert", { certificateId: CERT_ID, applicationId: APP_ID })
    ).toBe(`${APP_ID_CLEAN}-cert`);
  });

  test("resolves application ID to empty when the sync has no application", () => {
    expect(compileCertificateNameSchema("app-{{applicationId}}-{{certificateId}}", { certificateId: CERT_ID })).toBe(
      `app--${CERT_ID_CLEAN}`
    );
  });

  test("resolves common name to empty when absent", () => {
    expect(compileCertificateNameSchema("{{commonName}}x{{certificateId}}", { certificateId: CERT_ID })).toBe(
      `x${CERT_ID_CLEAN}`
    );
  });

  test("removed placeholders ({{environment}}, {{friendlyName}}) resolve to empty, not literal braces", () => {
    const result = compileCertificateNameSchema("a{{environment}}{{friendlyName}}b-{{certificateId}}", {
      certificateId: CERT_ID
    });
    expect(result).toBe(`ab-${CERT_ID_CLEAN}`);
    expect(result).not.toContain("{{");
  });
});

describe("buildCertificateNameSchemaTestName", () => {
  const UUID = "0".repeat(32);
  const SHORT_UUID = "0".repeat(22);

  test("substitutes full placeholders with 32-char and {{shortCertificateId}} with 22-char stand-ins", () => {
    expect(
      buildCertificateNameSchemaTestName(
        "{{certificateId}}-{{shortCertificateId}}-{{profileId}}-{{applicationId}}-{{applicationName}}-{{commonName}}"
      )
    ).toBe(`${UUID}-${SHORT_UUID}-${UUID}-${UUID}-application-name-common-name`);
  });

  test("two full UUID placeholders alone already exceed NetScaler's 63-char limit", () => {
    expect(buildCertificateNameSchemaTestName("{{profileId}}-{{certificateId}}").length).toBeGreaterThan(63);
  });

  test("{{shortCertificateId}} keeps a combined schema within NetScaler's 63-char limit", () => {
    expect(buildCertificateNameSchemaTestName("{{applicationId}}-{{shortCertificateId}}").length).toBeLessThanOrEqual(
      63
    );
  });

  test("leaves removed placeholders untouched so destination validation rejects them", () => {
    const testName = buildCertificateNameSchemaTestName("{{environment}}-{{friendlyName}}-{{certificateId}}");
    // The leftover braces are forbidden characters for every destination, so validation fails.
    expect(testName).toContain("{{environment}}");
    expect(testName).toContain("{{friendlyName}}");
  });
});

describe("sanitizeCertificateNameValue", () => {
  test("replaces destination-forbidden characters with hyphens", () => {
    // AWS Secrets Manager forbids dots/spaces/wildcards in its charset
    expect(sanitizeCertificateNameValue("app.example.com", PkiSync.AwsSecretsManager)).toBe("app-example-com");
    expect(sanitizeCertificateNameValue("*.example.com", PkiSync.AwsSecretsManager)).toBe("--example-com");
  });

  test("preserves dots for destinations that allow them (NetScaler/F5)", () => {
    expect(sanitizeCertificateNameValue("app.example.com", PkiSync.NetScaler)).toBe("app.example.com");
  });

  test("no-op without a destination", () => {
    expect(sanitizeCertificateNameValue("app.example.com")).toBe("app.example.com");
  });
});

describe("buildManagedCertificateNameRegexSource", () => {
  const fragments = { uuid: "[0-9a-f]{32}", shortUuid: "[0-9A-Za-z]{22}", freeText: "[a-zA-Z0-9._-]*" };

  test("substitutes placeholders and escapes literal regex characters", () => {
    expect(buildManagedCertificateNameRegexSource("cert.{{certificateId}}", fragments)).toBe("cert\\.[0-9a-f]{32}");
    expect(buildManagedCertificateNameRegexSource("{{commonName}}-{{certificateId}}", fragments)).toBe(
      "[a-zA-Z0-9._-]*-[0-9a-f]{32}"
    );
  });

  test("uses the short fragment for {{shortCertificateId}}", () => {
    expect(buildManagedCertificateNameRegexSource("cert-{{shortCertificateId}}", fragments)).toBe(
      "cert-[0-9A-Za-z]{22}"
    );
  });

  test("treats the application name as a free-text fragment", () => {
    expect(buildManagedCertificateNameRegexSource("{{applicationName}}-{{certificateId}}", fragments)).toBe(
      "[a-zA-Z0-9._-]*-[0-9a-f]{32}"
    );
  });

  test("treats a sentinel-like literal as a literal, not a wildcard (no token-collision injection)", () => {
    const source = buildManagedCertificateNameRegexSource(
      "__INFISICAL_COMMON_NAME_PLACEHOLDER__-{{certificateId}}",
      fragments
    );
    expect(source).toBe("__INFISICAL_COMMON_NAME_PLACEHOLDER__-[0-9a-f]{32}");
    expect(source).not.toContain("[a-zA-Z0-9._-]*");
  });
});

describe("certificateNameSchemaHasFreeTextPlaceholder", () => {
  test("true for schemas containing a free-text placeholder ({{commonName}} or {{applicationName}})", () => {
    expect(certificateNameSchemaHasFreeTextPlaceholder("{{commonName}}-{{certificateId}}")).toBe(true);
    expect(certificateNameSchemaHasFreeTextPlaceholder("{{applicationName}}-{{certificateId}}")).toBe(true);
    expect(certificateNameSchemaHasFreeTextPlaceholder("Infisical-{{certificateId}}")).toBe(false);
    expect(certificateNameSchemaHasFreeTextPlaceholder("{{profileId}}-{{applicationId}}-{{certificateId}}")).toBe(
      false
    );
    expect(certificateNameSchemaHasFreeTextPlaceholder(undefined)).toBe(false);
  });
});
