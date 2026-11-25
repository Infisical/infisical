import { CertKeyAlgorithm, CertSignatureAlgorithm } from "@app/services/certificate/certificate-types";
import { CertKeySource } from "@app/services/signer/signer-enums";

import { TExternalCaKeySource } from "./ca-key-source-types";

export const isExternalCaKeySource = (keySource: string | null | undefined): keySource is TExternalCaKeySource =>
  Boolean(keySource) && keySource !== CertKeySource.Infisical;

export const AWS_KMS_REQUIRED_SIGNATURE_ALGORITHMS: Partial<Record<CertKeyAlgorithm, CertSignatureAlgorithm>> = {
  [CertKeyAlgorithm.ECDSA_P256]: CertSignatureAlgorithm.ECDSA_SHA256,
  [CertKeyAlgorithm.ECDSA_P384]: CertSignatureAlgorithm.ECDSA_SHA384,
  [CertKeyAlgorithm.ECDSA_P521]: CertSignatureAlgorithm.ECDSA_SHA512
};

export const findCaKeySourceRequiredSignatureAlgorithm = ({
  keySource,
  caKeyAlgorithm
}: {
  keySource?: string | null;
  caKeyAlgorithm?: string | null;
}) =>
  keySource === CertKeySource.AwsKms && caKeyAlgorithm
    ? AWS_KMS_REQUIRED_SIGNATURE_ALGORITHMS[caKeyAlgorithm as CertKeyAlgorithm]
    : undefined;
