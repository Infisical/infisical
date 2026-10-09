import { buildManagedCertNamePattern } from "./palo-alto-networks-pki-sync-fns";

const SHORT_ID = "3hFkQ9xZr2mVw8LpT0aBcD";

describe("Palo Alto Networks buildManagedCertNamePattern (orphan cleanup detection)", () => {
  test("defaults to the INF-{{shortCertificateId}} schema", () => {
    const pattern = buildManagedCertNamePattern(undefined);
    expect(pattern.test(`INF-${SHORT_ID}`)).toBe(true);
    expect(pattern.test("mgmt-cert")).toBe(false);
  });

  test("never treats the imported CA chain objects as managed leaf certificates", () => {
    const pattern = buildManagedCertNamePattern(undefined);
    expect(pattern.test("INF-CA-0123456789abcdef01234567")).toBe(false);
  });
});
