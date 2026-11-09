import { TCertificateAuthorityWithAssociatedCa } from "@app/services/certificate-authority/certificate-authority-dal";
import { CertKeyAlgorithm } from "@app/services/certificate/certificate-types";

import { resolveCsrSignatureAlgorithmForCaKey, validateAlgorithmCompatibility } from "./certificate-issuance-utils";

const caWithKeyAlgorithm = (keyAlgorithm: CertKeyAlgorithm): TCertificateAuthorityWithAssociatedCa =>
  ({ internalCa: { keyAlgorithm } }) as unknown as TCertificateAuthorityWithAssociatedCa;

describe("validateAlgorithmCompatibility", () => {
  // Stored policies use both orderings for the same algorithm, so compatibility must match either.
  test.each(["SHA256-RSA", "RSA-SHA256"])("accepts RSA signature '%s' for an RSA CA", (sig) => {
    expect(() =>
      validateAlgorithmCompatibility(caWithKeyAlgorithm(CertKeyAlgorithm.RSA_2048), {
        algorithms: { signature: [sig] }
      })
    ).not.toThrow();
  });

  test.each(["SHA384-ECDSA", "ECDSA-SHA384"])("accepts ECDSA signature '%s' for an EC CA", (sig) => {
    expect(() =>
      validateAlgorithmCompatibility(caWithKeyAlgorithm(CertKeyAlgorithm.ECDSA_P384), {
        algorithms: { signature: [sig] }
      })
    ).not.toThrow();
  });

  test("rejects an ECDSA signature algorithm for an RSA CA", () => {
    expect(() =>
      validateAlgorithmCompatibility(caWithKeyAlgorithm(CertKeyAlgorithm.RSA_2048), {
        algorithms: { signature: ["SHA256-ECDSA"] }
      })
    ).toThrow();
  });

  test("rejects an RSA signature algorithm for an EC CA", () => {
    expect(() =>
      validateAlgorithmCompatibility(caWithKeyAlgorithm(CertKeyAlgorithm.ECDSA_P256), {
        algorithms: { signature: ["SHA256-RSA"] }
      })
    ).toThrow();
  });

  test("is a no-op when the template specifies no signature algorithms", () => {
    expect(() =>
      validateAlgorithmCompatibility(caWithKeyAlgorithm(CertKeyAlgorithm.RSA_2048), { algorithms: { signature: [] } })
    ).not.toThrow();
    expect(() => validateAlgorithmCompatibility(caWithKeyAlgorithm(CertKeyAlgorithm.RSA_2048), {})).not.toThrow();
  });
});

describe("resolveCsrSignatureAlgorithmForCaKey", () => {
  test.each([
    ["RSA-SHA384", CertKeyAlgorithm.RSA_2048, "RSA-SHA384"],
    ["ECDSA-SHA512", CertKeyAlgorithm.ECDSA_P256, "ECDSA-SHA512"],
    ["ML-DSA-44", CertKeyAlgorithm.ML_DSA_44, "ML-DSA-44"]
  ])("keeps the CSR's %s when the %s CA can sign with it", (csrSig, caKey, expected) => {
    expect(resolveCsrSignatureAlgorithmForCaKey(csrSig, caKey)).toBe(expected);
  });

  test.each([
    ["ECDSA-SHA256", CertKeyAlgorithm.RSA_4096, "RSA-SHA256"],
    ["RSA-SHA256", CertKeyAlgorithm.ECDSA_P256, "ECDSA-SHA256"],
    ["RSA-SHA256", CertKeyAlgorithm.ECDSA_P384, "ECDSA-SHA384"],
    ["ML-DSA-65", CertKeyAlgorithm.ECDSA_P521, "ECDSA-SHA512"],
    ["ECDSA-SHA256", CertKeyAlgorithm.ML_DSA_65, "ML-DSA-65"],
    ["ML-DSA-65", CertKeyAlgorithm.ML_DSA_44, "ML-DSA-44"],
    ["RSA-SHA256", CertKeyAlgorithm.SLH_DSA_SHA2_128F, "SLH-DSA-SHA2-128f"]
  ])("signs a %s CSR with the %s CA key's default", (csrSig, caKey, expected) => {
    expect(resolveCsrSignatureAlgorithmForCaKey(csrSig, caKey)).toBe(expected);
  });

  test("uses the CA key's default when the CSR algorithm is unknown", () => {
    expect(resolveCsrSignatureAlgorithmForCaKey(undefined, CertKeyAlgorithm.RSA_2048)).toBe("RSA-SHA256");
  });
});
