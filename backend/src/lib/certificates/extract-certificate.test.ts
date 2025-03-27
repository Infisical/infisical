import { extractX509CertFromChain } from "./extract-certificate";

describe("Extract Certificate Payload", () => {
  test("Single chain", () => {
    const payload = `-----BEGIN CERTIFICATE-----
MIIEZzCCA0+gAwIBAgIUDk9+HZcMHppiNy0TvoBg8/aMEqIwDQYJKoZIhvcNAQEL
BQAwDTELMAkGA1UEChMCUEgwHhcNMjQxMDI1MTU0MjAzWhcNMjUxMDI1MjE0MjAz
-----END CERTIFICATE-----`;
    const result = extractX509CertFromChain(payload);
    expect(result).toBeDefined();
    expect(result?.length).toBe(1);
    expect(result?.[0]).toEqual(payload);
  });

  test("Multiple chain", () => {
    const payload = `-----BEGIN CERTIFICATE-----
MIIEZzCCA0+gAwIBAgIUDk9+HZcMHppiNy0TvoBg8/aMEqIwDQYJKoZIhvcNAQEL
BQAwDTELMAkGA1UEChMCUEgwHhcNMjQxMDI1MTU0MjAzWhcNMjUxMDI1MjE0MjAz
-----END CERTIFICATE-----
-----BEGIN CERTIFICATE-----
MIIEZzCCA0+gAwIBAgIUDk9+HZcMHppiNy0TvoBg8/aMEqIwDQYJKoZIhvcNAQEL
-----END CERTIFICATE-----
-----BEGIN CERTIFICATE-----
MIIEZzCCA0+gAwIBAgIUDk9+HZcMHppiNy0TvoBg8/aMEqIwDQYJKoZIhvcNAQEL
-----END CERTIFICATE-----`;
    const result = extractX509CertFromChain(payload);
    expect(result).toBeDefined();
    expect(result?.length).toBe(3);
    expect(result).toEqual([
      `-----BEGIN CERTIFICATE-----
MIIEZzCCA0+gAwIBAgIUDk9+HZcMHppiNy0TvoBg8/aMEqIwDQYJKoZIhvcNAQEL
BQAwDTELMAkGA1UEChMCUEgwHhcNMjQxMDI1MTU0MjAzWhcNMjUxMDI1MjE0MjAz
-----END CERTIFICATE-----`,
      `-----BEGIN CERTIFICATE-----
MIIEZzCCA0+gAwIBAgIUDk9+HZcMHppiNy0TvoBg8/aMEqIwDQYJKoZIhvcNAQEL
-----END CERTIFICATE-----`,
      `-----BEGIN CERTIFICATE-----
MIIEZzCCA0+gAwIBAgIUDk9+HZcMHppiNy0TvoBg8/aMEqIwDQYJKoZIhvcNAQEL
-----END CERTIFICATE-----`
    ]);
  });
});
