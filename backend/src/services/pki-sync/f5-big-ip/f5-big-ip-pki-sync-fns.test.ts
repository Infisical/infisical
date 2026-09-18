import { buildManagedCertNamePattern } from "./f5-big-ip-pki-sync-fns";

const HEX = "550e8400e29b41d4a716446655440000";

describe("F5 BIG-IP buildManagedCertNamePattern (orphan cleanup detection)", () => {
  describe("default pattern (no schema configured)", () => {
    const pattern = buildManagedCertNamePattern(undefined);

    test("matches default Infisical names and their renewal suffixes", () => {
      expect(pattern.test(`Infisical-${HEX}`)).toBe(true);
      expect(pattern.test(`Infisical-${HEX}-chain`)).toBe(true);
    });

    // Deletion safety: never treat a non-Infisical object as managed.
    test("does NOT match unrelated certificate objects", () => {
      expect(pattern.test("prod-clientssl-cert")).toBe(false);
      expect(pattern.test(`Other-${HEX}`)).toBe(false);
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

  describe("schema with application ID", () => {
    const pattern = buildManagedCertNamePattern("{{applicationId}}-{{certificateId}}");

    test("matches names built from the application + cert UUID placeholders", () => {
      expect(pattern.test(`${HEX}-${HEX}`)).toBe(true);
      expect(pattern.test(`nothex-${HEX}`)).toBe(false);
    });
  });
});
