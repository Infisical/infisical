import { describe, expect, it } from "vitest";

import {
  CertKeyAlgorithm,
  CertSignatureAlgorithm,
  POLICY_KEY_ALGORITHM_DOCUMENTED_VALUES,
  POLICY_KEY_ALGORITHM_VALUES,
  POLICY_SIGNATURE_ALGORITHM_DOCUMENTED_VALUES,
  POLICY_SIGNATURE_ALGORITHM_VALUES
} from "./certificate-constants";

describe("documented policy algorithm values", () => {
  it("list each key algorithm once, in the policy spelling where it has one", () => {
    expect(POLICY_KEY_ALGORITHM_DOCUMENTED_VALUES).toContain("RSA-2048");
    expect(POLICY_KEY_ALGORITHM_DOCUMENTED_VALUES).toContain("ECDSA-P256");
    expect(POLICY_KEY_ALGORITHM_DOCUMENTED_VALUES).toContain(CertKeyAlgorithm.ML_DSA_44);
    expect(POLICY_KEY_ALGORITHM_DOCUMENTED_VALUES).not.toContain(CertKeyAlgorithm.RSA_2048);
    expect(POLICY_KEY_ALGORITHM_DOCUMENTED_VALUES).not.toContain(CertKeyAlgorithm.ECDSA_P256);
    expect(POLICY_KEY_ALGORITHM_VALUES).toEqual(expect.arrayContaining(POLICY_KEY_ALGORITHM_DOCUMENTED_VALUES));
    expect(POLICY_KEY_ALGORITHM_VALUES).toContain(CertKeyAlgorithm.RSA_2048);
  });

  it("list each signature algorithm once, in the policy spelling where it has one", () => {
    expect(POLICY_SIGNATURE_ALGORITHM_DOCUMENTED_VALUES).toContain("SHA256-RSA");
    expect(POLICY_SIGNATURE_ALGORITHM_DOCUMENTED_VALUES).not.toContain(CertSignatureAlgorithm.RSA_SHA256);
    expect(POLICY_SIGNATURE_ALGORITHM_VALUES).toEqual(
      expect.arrayContaining(POLICY_SIGNATURE_ALGORITHM_DOCUMENTED_VALUES)
    );
  });
});
