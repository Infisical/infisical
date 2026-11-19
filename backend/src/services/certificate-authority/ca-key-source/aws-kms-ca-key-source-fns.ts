import { KeySpec, SigningAlgorithmSpec } from "@aws-sdk/client-kms";

import { crypto } from "@app/lib/crypto/cryptography";
import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { CertKeyAlgorithm } from "@app/services/certificate/certificate-types";

import { keyAlgorithmToAlgCfg } from "../certificate-authority-fns";

export const AWS_KMS_KEY_SPEC_BY_ALGORITHM: Partial<Record<CertKeyAlgorithm, KeySpec>> = {
  [CertKeyAlgorithm.RSA_2048]: KeySpec.RSA_2048,
  [CertKeyAlgorithm.RSA_3072]: KeySpec.RSA_3072,
  [CertKeyAlgorithm.RSA_4096]: KeySpec.RSA_4096,
  [CertKeyAlgorithm.ECDSA_P256]: KeySpec.ECC_NIST_P256,
  [CertKeyAlgorithm.ECDSA_P384]: KeySpec.ECC_NIST_P384,
  [CertKeyAlgorithm.ECDSA_P521]: KeySpec.ECC_NIST_P521,
  [CertKeyAlgorithm.ML_DSA_44]: KeySpec.ML_DSA_44,
  [CertKeyAlgorithm.ML_DSA_65]: KeySpec.ML_DSA_65,
  [CertKeyAlgorithm.ML_DSA_87]: KeySpec.ML_DSA_87
};

const AWS_KMS_DIGEST_SIGNING_BY_HASH: Record<
  string,
  { rsa: SigningAlgorithmSpec; ecdsa: SigningAlgorithmSpec; nodeHash: string }
> = {
  "SHA-256": {
    rsa: SigningAlgorithmSpec.RSASSA_PKCS1_V1_5_SHA_256,
    ecdsa: SigningAlgorithmSpec.ECDSA_SHA_256,
    nodeHash: "sha256"
  },
  "SHA-384": {
    rsa: SigningAlgorithmSpec.RSASSA_PKCS1_V1_5_SHA_384,
    ecdsa: SigningAlgorithmSpec.ECDSA_SHA_384,
    nodeHash: "sha384"
  },
  "SHA-512": {
    rsa: SigningAlgorithmSpec.RSASSA_PKCS1_V1_5_SHA_512,
    ecdsa: SigningAlgorithmSpec.ECDSA_SHA_512,
    nodeHash: "sha512"
  }
};

export const resolveAwsKmsDigestSigning = (keyAlgorithm: CertKeyAlgorithm, hash: string) => {
  const keyAlgCfg = keyAlgorithmToAlgCfg(keyAlgorithm);
  const isEcdsa = keyAlgCfg.name === "ECDSA";
  if (isEcdsa && hash !== keyAlgCfg.hash) {
    throw new BadRequestError({
      message: `AWS KMS signs ${keyAlgorithm} keys only with ${keyAlgCfg.hash}, so the signature algorithm cannot use ${hash}. Choose a ${keyAlgCfg.hash} signature algorithm for this certificate authority.`
    });
  }

  const signing = AWS_KMS_DIGEST_SIGNING_BY_HASH[hash];
  if (!signing) {
    throw new BadRequestError({
      message: `Signature hash "${hash}" is not supported for AWS KMS-backed certificate authorities.`
    });
  }
  return { signingAlgorithmSpec: isEcdsa ? signing.ecdsa : signing.rsa, nodeHash: signing.nodeHash };
};

export const computeMlDsaExternalMu = (rawPublicKey: Uint8Array, message: Buffer): Buffer => {
  const tr = crypto.nativeCrypto.createHash("shake256", { outputLength: 64 }).update(rawPublicKey).digest();
  return crypto.nativeCrypto
    .createHash("shake256", { outputLength: 64 })
    .update(tr)
    .update(Buffer.from([0, 0]))
    .update(message)
    .digest();
};

export const parseAwsKmsKeyArnRegion = (keyArn: string) => {
  const region = keyArn.split(":")[3];
  if (!keyArn.startsWith("arn:") || !region) {
    throw new BadRequestError({ message: `AWS KMS key reference '${keyArn}' is not a valid key ARN.` });
  }
  return region;
};

const AWS_KMS_ERROR_MESSAGES: Record<string, string> = {
  AccessDeniedException:
    "AWS denied the request. Grant the AWS connection's IAM principal kms:CreateKey, kms:TagResource, kms:GetPublicKey, kms:Sign, and kms:ScheduleKeyDeletion.",
  DisabledException: "The AWS KMS key is disabled. Enable it in AWS KMS and try again.",
  KMSInvalidStateException: "The AWS KMS key is disabled or pending deletion. Restore it in AWS KMS and try again.",
  NotFoundException: "The AWS KMS key no longer exists or is not in the connection's AWS account and region.",
  UnsupportedOperationException: "AWS KMS does not support this key algorithm in the selected region.",
  UnrecognizedClientException: "AWS rejected the AWS connection's credentials. Check the connection and try again.",
  InvalidSignatureException: "AWS rejected the AWS connection's credentials. Check the connection and try again.",
  ExpiredTokenException: "The AWS connection's credentials have expired. Check the connection and try again.",
  ThrottlingException: "AWS KMS is throttling requests. Try again shortly.",
  KMSInternalException: "AWS KMS had an internal error. Try again shortly.",
  DependencyTimeoutException: "AWS KMS timed out. Try again shortly."
};

export const toAwsKmsError = (error: unknown, operation: string): Error => {
  if (error instanceof BadRequestError) return error;

  const { name } = error as { name?: string };
  logger.error(error, `AWS KMS ${operation} failed [errorName=${name}]`);

  const known = name ? AWS_KMS_ERROR_MESSAGES[name] : undefined;
  return new BadRequestError({
    message: `Failed to ${operation} in AWS KMS: ${known ?? `AWS returned ${name ?? "an unexpected error"}.`}`
  });
};
