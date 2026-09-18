import { CertKeyAlgorithm } from "@app/services/certificate/certificate-types";
import { TCertificateAuthorityWithAssociatedCa } from "@app/services/certificate-authority/certificate-authority-dal";

import { validateAlgorithmCompatibility } from "./certificate-issuance-utils";

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
