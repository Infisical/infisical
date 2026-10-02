import * as x509 from "@peculiar/x509";

import { PkiSyncError } from "../pki-sync-errors";
import { GCP_CERTIFICATE_MANAGER_SUPPORTED_KEY_ALGORITHMS } from "./gcp-certificate-manager-pki-sync-constants";

const RSA_ALGORITHM_NAMES = ["RSASSA-PKCS1-v1_5", "RSA-PSS", "RSAES-PKCS1-v1_5"];

export const inferCertificateKeyAlgorithm = (certPem: string): string => {
  try {
    const { algorithm } = new x509.X509Certificate(certPem).publicKey;

    if (RSA_ALGORITHM_NAMES.includes(algorithm.name)) {
      const { modulusLength } = algorithm as { modulusLength?: number };
      return `RSA-${modulusLength ?? "unknown"}`;
    }

    if (algorithm.name === "ECDSA" || algorithm.name === "EC") {
      const { namedCurve } = algorithm as { namedCurve?: string };
      return `ECDSA-${(namedCurve ?? "unknown").replace("P-", "P")}`;
    }

    return algorithm.name;
  } catch (error) {
    throw new PkiSyncError({
      shouldRetry: false,
      message: `Failed to parse certificate to determine its key algorithm: ${
        error instanceof Error ? error.message : String(error)
      }`
    });
  }
};

export const assertKeyAlgorithmSupported = (certPem: string) => {
  const algorithm = inferCertificateKeyAlgorithm(certPem);

  if (!(GCP_CERTIFICATE_MANAGER_SUPPORTED_KEY_ALGORITHMS as readonly string[]).includes(algorithm)) {
    throw new PkiSyncError({
      shouldRetry: false,
      message: `Certificate uses key algorithm "${algorithm}", which GCP Certificate Manager does not support. Supported algorithms: ${GCP_CERTIFICATE_MANAGER_SUPPORTED_KEY_ALGORITHMS.join(", ")}.`
    });
  }

  return algorithm;
};
