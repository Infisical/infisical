import {
  AsymmetricKeyAlgorithm,
  HmacAlgorithm,
  SigningAlgorithm,
  SymmetricKeyAlgorithm
} from "@app/hooks/api/cmeks";

type KeyAlgorithm = AsymmetricKeyAlgorithm | SymmetricKeyAlgorithm | HmacAlgorithm;

export const compatibleSigningAlgorithmsForKeyAlgorithm = (
  algorithm: KeyAlgorithm
): SigningAlgorithm[] => {
  return Object.values(SigningAlgorithm).filter((a) => {
    if (algorithm?.startsWith("ML_DSA")) return (a as string) === (algorithm as string);
    if (algorithm?.startsWith("RSA")) return a.toLowerCase().startsWith("rsa");
    if (algorithm === AsymmetricKeyAlgorithm.ECC_NIST_EDWARDS25519)
      return a.toLowerCase().startsWith("ed25519");
    return a.toLowerCase().startsWith("ecdsa");
  });
};

// Temporary compatibility for the original misspelled export.
export const comptableSigningAlgoritmsForKeyAlgorithm = compatibleSigningAlgorithmsForKeyAlgorithm;
