import RE2 from "re2";

import { buildIntermediateIdentifier, buildManagedCertNamePattern } from "./kemp-loadmaster-pki-sync-fns";

const HEX = "550e8400e29b41d4a716446655440000";

// Self-signed test CA with subject CN "Test CA".
const TEST_CA_PEM = `-----BEGIN CERTIFICATE-----
MIIDBTCCAe2gAwIBAgIUao3kOQBkH3sANDG5ANZHZxIC1BYwDQYJKoZIhvcNAQEL
BQAwEjEQMA4GA1UEAwwHVGVzdCBDQTAeFw0yNjA3MTcwMzQ3MjhaFw0yNjA3MTkw
MzQ3MjhaMBIxEDAOBgNVBAMMB1Rlc3QgQ0EwggEiMA0GCSqGSIb3DQEBAQUAA4IB
DwAwggEKAoIBAQCoSkMNKQB6L9HD+ENlnKFmd+/A8RaDwvcQkPEu5Z/TQSvPAPIv
sC5a8UKTrXXJ69NuGVmae8TgZlxihv3o0Z2F5/BT3+nYZ2aTbHXCIhlNc4lGa30Q
4Xrqt39/1XL0ym4r4ehEeqcu4tSD4kAHv1VRAeKGzHrq3M8C2xF6Sk9WDKWm9Gzk
oFhXdHaoqFSb6wwq5gzdMYZjUTkZSEkpyGXD1TAVihP46vQa1t1oTh30PJ7zpVA9
7B28Gajwcg7QI+BUcG2xNb1MyfuisDO4I/r/Cc2WMeIy66vY9ZLrEnsuRqGHkAe7
0iX9EjjZvPJHMRFhJwOjBl7v3m6g73Tg8IpZAgMBAAGjUzBRMB0GA1UdDgQWBBSp
fMdz2ME+miLUnx9+bKp2wd388jAfBgNVHSMEGDAWgBSpfMdz2ME+miLUnx9+bKp2
wd388jAPBgNVHRMBAf8EBTADAQH/MA0GCSqGSIb3DQEBCwUAA4IBAQAF60yyYITU
NP/lo090LzRfJjyIlbxak5qfTNgSAEjjc83Ta/00rXhUYnzXWVZ3Xk1EDEtiwnor
CvgSMLonv63+dUx0lXTMPbbz/pRBYYu2rPiRzMzvh/m53WWXZ0QXsRXFamKAs3mB
gCv8Is6ku7qJ8dIMV5BVpl5iX1GCjRpEXYJLMnVmh/u5ekeiRwrldL+66yacNc6n
0GNb0XwliIjXpyXWd5SRGhWpANyphjXpTzY5zCm6oAqrqQnf91k7N3lJQz2ugbCM
KAiy0HrJdJahbGfhFMfEjGSzHaByj+Suki9ufwzq5Bvl0u9OIp9PFPvBZskUYG1T
cpEmHIN8/vxJ
-----END CERTIFICATE-----`;

describe("Kemp buildManagedCertNamePattern (orphan cleanup detection)", () => {
  test("default pattern matches Infisical names and renewal suffixes, not unrelated certs", () => {
    const pattern = buildManagedCertNamePattern(undefined);
    expect(pattern.test(`Infisical-${HEX}`)).toBe(true);
    expect(pattern.test(`Infisical-${HEX}-1`)).toBe(true);
    expect(pattern.test("wildcard-prod-cert")).toBe(false);
    expect(pattern.test(`Other-${HEX}`)).toBe(false);
  });

  test("schema-based pattern anchors on the resolved placeholders", () => {
    const pattern = buildManagedCertNamePattern("Infisical-{{certificateId}}");
    expect(pattern.test(`Infisical-${HEX}`)).toBe(true);
    expect(pattern.test("Infisical-notavalidid")).toBe(false);
  });
});

describe("Kemp buildIntermediateIdentifier", () => {
  test("compiles {{fingerprint}} to a stable, content-addressed 24-char hex", () => {
    const a = buildIntermediateIdentifier(TEST_CA_PEM, "Infisical-ca-{{fingerprint}}");
    const b = buildIntermediateIdentifier(TEST_CA_PEM, "Infisical-ca-{{fingerprint}}");
    expect(a).toBe(b);
    expect(new RE2("^Infisical-ca-[0-9a-f]{24}$").test(a)).toBe(true);
    expect(buildIntermediateIdentifier("different-content", "Infisical-ca-{{fingerprint}}")).not.toBe(a);
  });

  test("compiles {{commonName}} from the certificate subject, sanitizing to Kemp-safe characters", () => {
    // CN is "Test CA", the space is sanitized to a dash.
    expect(
      new RE2("^Test-CA-[0-9a-f]{24}$").test(buildIntermediateIdentifier(TEST_CA_PEM, "{{commonName}}-{{fingerprint}}"))
    ).toBe(true);
  });

  test("falls back to 'ca' for {{commonName}} when the certificate cannot be parsed", () => {
    expect(buildIntermediateIdentifier("not-a-real-pem", "{{commonName}}")).toBe("ca");
  });
});
