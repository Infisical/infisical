import { CertificateAuthorityUsageMode } from "@aws-sdk/client-acm-pca";

import { API_CSR_PASSTHROUGH_TEMPLATE_ARN } from "./aws-pca-certificate-authority-enums";
import { resolveAwsPcaTemplateArn, validateAwsPcaCaIssuanceInputs } from "./aws-pca-certificate-authority-validators";

describe("validateAwsPcaCaIssuanceInputs", () => {
  test.each([undefined, null, { isCA: false }, { isCA: false, pathLength: 9 }])(
    "accepts a non-CA request (%p)",
    (basicConstraints) => {
      expect(() => validateAwsPcaCaIssuanceInputs({ basicConstraints })).not.toThrow();
    }
  );

  test.each([0, 1, 2, 3])("accepts a CA request with path length %i", (pathLength) => {
    expect(() => validateAwsPcaCaIssuanceInputs({ basicConstraints: { isCA: true, pathLength } })).not.toThrow();
  });

  test.each([undefined, null])("rejects a CA request with an unlimited path length (%p)", (pathLength) => {
    expect(() => validateAwsPcaCaIssuanceInputs({ basicConstraints: { isCA: true, pathLength } })).toThrow(
      /path length between 0 and 3 is required/i
    );
  });

  test.each([4, 10, -1, 1.5])("rejects a CA request with an out-of-range path length (%p)", (pathLength) => {
    expect(() => validateAwsPcaCaIssuanceInputs({ basicConstraints: { isCA: true, pathLength } })).toThrow(
      /between 0 and 3/i
    );
  });
});

describe("resolveAwsPcaTemplateArn", () => {
  test("uses the end-entity template for a leaf request", () => {
    expect(resolveAwsPcaTemplateArn({ basicConstraints: { isCA: false } })).toBe(API_CSR_PASSTHROUGH_TEMPLATE_ARN);
    expect(resolveAwsPcaTemplateArn({})).toBe(API_CSR_PASSTHROUGH_TEMPLATE_ARN);
  });

  test.each([0, 1, 2, 3])("uses the matching subordinate CA template for path length %i", (pathLength) => {
    expect(resolveAwsPcaTemplateArn({ basicConstraints: { isCA: true, pathLength } })).toBe(
      `arn:aws:acm-pca:::template/SubordinateCACertificate_PathLen${pathLength}_APICSRPassthrough/V1`
    );
  });

  test("rejects CA issuance from a short-lived certificate CA", () => {
    expect(() =>
      resolveAwsPcaTemplateArn({
        basicConstraints: { isCA: true, pathLength: 0 },
        usageMode: CertificateAuthorityUsageMode.SHORT_LIVED_CERTIFICATE
      })
    ).toThrow(/short-lived certificate mode/i);
  });

  test("allows leaf issuance from a short-lived certificate CA", () => {
    expect(
      resolveAwsPcaTemplateArn({
        basicConstraints: { isCA: false },
        usageMode: CertificateAuthorityUsageMode.SHORT_LIVED_CERTIFICATE
      })
    ).toBe(API_CSR_PASSTHROUGH_TEMPLATE_ARN);
  });

  test("rejects an out-of-range path length rather than falling back to the end-entity template", () => {
    expect(() => resolveAwsPcaTemplateArn({ basicConstraints: { isCA: true, pathLength: 4 } })).toThrow(
      /between 0 and 3/i
    );
  });
});
