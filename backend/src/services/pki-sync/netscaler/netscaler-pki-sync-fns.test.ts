import { buildManagedCertNamePattern } from "./netscaler-pki-sync-fns";

const HEX = "550e8400e29b41d4a716446655440000";

describe("NetScaler buildManagedCertNamePattern (orphan cleanup detection)", () => {
  describe("default pattern (no schema configured)", () => {
    const pattern = buildManagedCertNamePattern(undefined);

    test("matches default Infisical names and their renewal suffixes", () => {
      expect(pattern.test(`Infisical-${HEX}`)).toBe(true);
      expect(pattern.test(`Infisical-${HEX}-1`)).toBe(true);
    });

    // Deletion safety: never treat a non-Infisical certkey as managed.
    test("does NOT match unrelated certkeys", () => {
      expect(pattern.test("wildcard-prod-cert")).toBe(false);
      expect(pattern.test(`Other-${HEX}`)).toBe(false);
      expect(pattern.test(`Infisical-${HEX}.bad`)).toBe(false);
    });
  });

  describe('schema "Infisical-{{certificateId}}"', () => {
    const pattern = buildManagedCertNamePattern("Infisical-{{certificateId}}");

    test("matches managed names, rejects unrelated", () => {
      expect(pattern.test(`Infisical-${HEX}`)).toBe(true);
      expect(pattern.test("Infisical-notavalidid")).toBe(false);
      expect(pattern.test("totally-unrelated")).toBe(false);
    });
  });

  describe('schema "{{commonName}}-{{certificateId}}" (FQDN naming)', () => {
    const pattern = buildManagedCertNamePattern("{{commonName}}-{{certificateId}}");

    test("matches FQDN-based names anchored by the cert ID", () => {
      expect(pattern.test(`app.example.com-${HEX}`)).toBe(true);
    });

    test("still requires the trailing 32-hex cert ID", () => {
      expect(pattern.test("app.example.com-nothex")).toBe(false);
    });
  });

  describe("schema with profile and application IDs", () => {
    const pattern = buildManagedCertNamePattern("{{applicationId}}-{{profileId}}-{{certificateId}}");

    test("matches names built from all three UUID placeholders", () => {
      expect(pattern.test(`${HEX}-${HEX}-${HEX}`)).toBe(true);
    });

    test("rejects when a UUID segment is malformed", () => {
      expect(pattern.test(`${HEX}-nothex-${HEX}`)).toBe(false);
    });
  });
});
