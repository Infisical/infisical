import { describe, expect, it } from "vitest";

import { INFISICAL_CORE_METER_ATTRIBUTES } from "./telemetry-attributes";

// An attribute missing from the allowlist is dropped by the SDK View without erroring, so the
// only thing standing between a typo and silently unlabelled data is a check like this one.
describe("OCSP metric attributes", () => {
  it.each(["ocsp.status", "ocsp.cert_status", "ocsp.cache"])(
    "should carry %s on the InfisicalCore allowlist",
    (attribute) => {
      expect(INFISICAL_CORE_METER_ATTRIBUTES).toContain(attribute);
    }
  );

  it("should no longer carry the flattened ocsp.result attribute", () => {
    expect(INFISICAL_CORE_METER_ATTRIBUTES).not.toContain("ocsp.result");
  });

  it("should keep every attribute bounded, with no per-tenant or per-actor identifier", () => {
    const ocspAttributes = INFISICAL_CORE_METER_ATTRIBUTES.filter((a) => a.startsWith("ocsp."));

    expect(ocspAttributes).toHaveLength(3);
    for (const attribute of ocspAttributes) {
      expect(attribute).not.toMatch(/id$|org|project|actor|user|ip|serial/i);
    }
  });
});
