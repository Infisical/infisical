import { SymmetricKeyAlgorithm } from "@app/lib/crypto/cipher";
import { crypto } from "@app/lib/crypto/cryptography";
import { AsymmetricKeyAlgorithm } from "@app/lib/crypto/sign";
import { BadRequestError } from "@app/lib/errors";

import { verifyKeyTypeAndAlgorithm } from "./kms-fns";
import { KmsKeyUsage } from "./kms-types";

vi.mock("@app/lib/crypto/cryptography", () => ({
  crypto: {
    isFipsModeEnabled: vi.fn(() => false)
  }
}));

describe("verifyKeyTypeAndAlgorithm", () => {
  beforeEach(() => {
    vi.mocked(crypto.isFipsModeEnabled).mockReset();
    vi.mocked(crypto.isFipsModeEnabled).mockReturnValue(false);
  });

  test("accepts symmetric algorithms for encrypt/decrypt keys and asymmetric for sign/verify keys", () => {
    expect(verifyKeyTypeAndAlgorithm(KmsKeyUsage.ENCRYPT_DECRYPT, SymmetricKeyAlgorithm.AES_GCM_256)).toBe(true);

    for (const algorithm of Object.values(AsymmetricKeyAlgorithm)) {
      expect(verifyKeyTypeAndAlgorithm(KmsKeyUsage.SIGN_VERIFY, algorithm)).toBe(true);
    }
  });

  test("rejects mismatched key usage and algorithm families", () => {
    expect(() => verifyKeyTypeAndAlgorithm(KmsKeyUsage.ENCRYPT_DECRYPT, AsymmetricKeyAlgorithm.ECC_NIST_P256)).toThrow(
      BadRequestError
    );
    expect(() => verifyKeyTypeAndAlgorithm(KmsKeyUsage.SIGN_VERIFY, SymmetricKeyAlgorithm.AES_GCM_256)).toThrow(
      BadRequestError
    );
    expect(() =>
      verifyKeyTypeAndAlgorithm(KmsKeyUsage.SIGN_VERIFY, AsymmetricKeyAlgorithm.ECC_NIST_P256, {
        forceType: KmsKeyUsage.ENCRYPT_DECRYPT
      })
    ).toThrow(BadRequestError);
  });

  test("rejects ECC_SECG_P256K1 in FIPS mode but allows it otherwise", () => {
    expect(verifyKeyTypeAndAlgorithm(KmsKeyUsage.SIGN_VERIFY, AsymmetricKeyAlgorithm.ECC_SECG_P256K1)).toBe(true);

    vi.mocked(crypto.isFipsModeEnabled).mockReturnValue(true);
    expect(() => verifyKeyTypeAndAlgorithm(KmsKeyUsage.SIGN_VERIFY, AsymmetricKeyAlgorithm.ECC_SECG_P256K1)).toThrow(
      BadRequestError
    );
  });

  test("never consults FIPS mode for other algorithms", () => {
    verifyKeyTypeAndAlgorithm(KmsKeyUsage.ENCRYPT_DECRYPT, SymmetricKeyAlgorithm.AES_GCM_256);
    verifyKeyTypeAndAlgorithm(KmsKeyUsage.SIGN_VERIFY, AsymmetricKeyAlgorithm.ECC_NIST_P256);
    verifyKeyTypeAndAlgorithm(KmsKeyUsage.SIGN_VERIFY, AsymmetricKeyAlgorithm.ML_DSA_44);

    expect(crypto.isFipsModeEnabled).not.toHaveBeenCalled();
  });
});
