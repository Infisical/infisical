import { matchesCertificateNameSchema } from "./pki-sync-fns";

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
