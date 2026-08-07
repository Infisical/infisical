import * as x509 from "@peculiar/x509";
import RE2 from "re2";

import { crypto } from "@app/lib/crypto/cryptography";
import { derivePublicKeyFromSecret, getPqcCrypto, isPqcCryptoKey } from "@app/lib/crypto/pqc";
import { isPqcAlgorithm } from "@app/lib/crypto/pqc/pqc-utils";
import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { ms } from "@app/lib/ms";
import { CertKeyAlgorithm, CertStatus, mapSanTypeToX509Type } from "@app/services/certificate/certificate-types";
import { TCertificateAuthorityWithAssociatedCa } from "@app/services/certificate-authority/certificate-authority-dal";
import { CaCapability, CaStatus, CaType } from "@app/services/certificate-authority/certificate-authority-enums";
import {
  createDistinguishedName,
  keyAlgorithmToAlgCfg
} from "@app/services/certificate-authority/certificate-authority-fns";
import { caSupportsCapability } from "@app/services/certificate-authority/certificate-authority-maps";

import { CertKeyUsageType } from "../certificate-common/certificate-constants";
import {
  extractAlgorithmsFromCSR,
  extractCertificateRequestFromCSR
} from "../certificate-common/certificate-csr-utils";
import { mapEnumsForValidation } from "../certificate-common/certificate-utils";
import { TCertificateRequest } from "../certificate-policy/certificate-policy-types";
import { CertificateRenewalKeySource, TRenewalAttributes } from "./certificate-v3-types";

export enum CertificateRenewalMode {
  SelfSigned = "self-signed",
  InternalCa = "internal-ca",
  KeyPreserving = "key-preserving",
  ExternalCa = "external-ca"
}

const CSR_RENEWAL_EDITABLE_ATTRIBUTES = new Set<keyof TRenewalAttributes>(["ttl", "basicConstraints"]);

const RENEWAL_ATTRIBUTE_LABELS: Record<keyof TRenewalAttributes, string> = {
  commonName: "common name",
  organization: "organization",
  organizationalUnit: "organizational unit",
  country: "country",
  state: "state",
  locality: "locality",
  domainComponents: "domain components",
  altNames: "subject alternative names",
  keyUsages: "key usages",
  extendedKeyUsages: "extended key usages",
  signatureAlgorithm: "signature algorithm",
  keyAlgorithm: "key algorithm",
  ttl: "TTL",
  basicConstraints: "basic constraints"
};

export const resolveRenewalKeySource = ({
  renewalKeySource,
  csr
}: {
  renewalKeySource?: CertificateRenewalKeySource;
  csr?: string;
}): CertificateRenewalKeySource => {
  const keySource = renewalKeySource ?? CertificateRenewalKeySource.New;

  if (keySource === CertificateRenewalKeySource.Csr && !csr) {
    throw new BadRequestError({
      message: `A certificate signing request is required when renewing with renewalKeySource '${CertificateRenewalKeySource.Csr}'.`
    });
  }

  if (keySource !== CertificateRenewalKeySource.Csr && csr) {
    throw new BadRequestError({
      message: `A certificate signing request can only be supplied with renewalKeySource '${CertificateRenewalKeySource.Csr}', not '${keySource}'.`
    });
  }

  return keySource;
};

export const assertCsrRenewalAttributes = (attributes?: TRenewalAttributes) => {
  if (!attributes) return;

  const rejected = (Object.keys(attributes) as (keyof TRenewalAttributes)[])
    .filter((key) => attributes[key] !== undefined && !CSR_RENEWAL_EDITABLE_ATTRIBUTES.has(key))
    .map((key) => RENEWAL_ATTRIBUTE_LABELS[key] ?? key);

  if (rejected.length > 0) {
    throw new BadRequestError({
      message: `The CSR is the source of truth for ${rejected.join(", ")}. Update the CSR instead, or renew without one. Only TTL and basic constraints can be set alongside a CSR.`
    });
  }
};

/**
 * Renewal copies the current certificate and applies only what the caller explicitly changed.
 * Profile defaults are deliberately not consulted: they describe what a *new* certificate should
 * look like, and applying them here would silently rewrite fields the caller never touched.
 *
 * A key present with a `null` value clears the field; an absent key keeps the original value.
 */
export const buildRenewalCertificateRequest = ({
  original,
  attributes
}: {
  original: TCertificateRequest;
  attributes?: TRenewalAttributes;
}): TCertificateRequest => {
  if (!attributes) return original;

  return {
    ...original,
    ...(attributes.commonName !== undefined && { commonName: attributes.commonName ?? undefined }),
    ...(attributes.organization !== undefined && { organization: attributes.organization ?? undefined }),
    ...(attributes.organizationalUnit !== undefined && {
      organizationalUnit: attributes.organizationalUnit ?? undefined
    }),
    ...(attributes.country !== undefined && { country: attributes.country ?? undefined }),
    ...(attributes.state !== undefined && { state: attributes.state ?? undefined }),
    ...(attributes.locality !== undefined && { locality: attributes.locality ?? undefined }),
    ...(attributes.domainComponents !== undefined && {
      domainComponents: attributes.domainComponents ?? undefined
    }),
    ...(attributes.altNames !== undefined && { subjectAlternativeNames: attributes.altNames }),
    ...(attributes.keyUsages !== undefined && { keyUsages: attributes.keyUsages }),
    ...(attributes.extendedKeyUsages !== undefined && { extendedKeyUsages: attributes.extendedKeyUsages }),
    ...(attributes.signatureAlgorithm !== undefined && { signatureAlgorithm: attributes.signatureAlgorithm }),
    ...(attributes.keyAlgorithm !== undefined && { keyAlgorithm: attributes.keyAlgorithm }),
    ...(attributes.ttl !== undefined && { validity: { ttl: attributes.ttl } }),
    ...(attributes.basicConstraints !== undefined && { basicConstraints: attributes.basicConstraints })
  };
};

export const buildCsrRenewalCertificateRequest = ({
  csr,
  attributes
}: {
  csr: string;
  attributes?: TRenewalAttributes;
}): TCertificateRequest => {
  const csrRequest = mapEnumsForValidation(extractCertificateRequestFromCSR(csr));
  const { keyAlgorithm, signatureAlgorithm } = extractAlgorithmsFromCSR(csr);

  const requestedBasicConstraints = attributes?.basicConstraints ?? csrRequest.basicConstraints;
  const isCA =
    requestedBasicConstraints?.isCA === true ||
    (csrRequest.keyUsages?.includes(CertKeyUsageType.KEY_CERT_SIGN) ?? false);

  const basicConstraints = isCA
    ? { isCA: true, pathLength: requestedBasicConstraints?.pathLength }
    : requestedBasicConstraints;

  return {
    ...csrRequest,
    keyAlgorithm,
    signatureAlgorithm,
    ...(attributes?.ttl && { validity: { ttl: attributes.ttl } }),
    ...(basicConstraints && { basicConstraints })
  };
};

export const certificateSpanToTtl = (notBefore: Date, notAfter: Date): string => {
  const diffMs = notAfter.getTime() - notBefore.getTime();

  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days > 0) return `${days}d`;

  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  if (hours > 0) return `${hours}h`;

  const minutes = Math.floor(diffMs / (1000 * 60));
  if (minutes > 0) return `${minutes}m`;

  return `${Math.floor(diffMs / 1000)}s`;
};

export const buildRenewalDistinguishedName = (certificateRequest: TCertificateRequest): string =>
  createDistinguishedName({
    commonName: certificateRequest.commonName,
    organization: certificateRequest.organization,
    ou: certificateRequest.organizationalUnit,
    country: certificateRequest.country,
    province: certificateRequest.state,
    locality: certificateRequest.locality,
    domainComponents: certificateRequest.domainComponents
  });

const pemBodyToDer = (pem: string): Buffer =>
  Buffer.from(pem.replace(new RE2("-----(BEGIN|END)[^-]+-----", "g"), "").replace(new RE2("\\s", "g"), ""), "base64");

export const importKeyPairFromPem = async ({
  privateKeyPem,
  keyAlgorithm
}: {
  privateKeyPem: string;
  keyAlgorithm: CertKeyAlgorithm;
}): Promise<CryptoKeyPair> => {
  const algorithm = keyAlgorithmToAlgCfg(keyAlgorithm);
  const isPqc = isPqcAlgorithm(keyAlgorithm);
  const cryptoEngine = isPqc ? getPqcCrypto() : crypto.nativeCrypto;

  try {
    if (isPqc) {
      const privateKeyDer = pemBodyToDer(privateKeyPem);
      const privateKey = await cryptoEngine.subtle.importKey("pkcs8", privateKeyDer, algorithm, true, ["sign"]);
      if (!isPqcCryptoKey(privateKey)) {
        throw new Error(`Expected a PQC key handle for ${keyAlgorithm}`);
      }
      const { spkiDer } = await derivePublicKeyFromSecret(privateKey.algorithm.name, privateKey.rawKey);
      const publicKey = await cryptoEngine.subtle.importKey("spki", spkiDer, algorithm, true, ["verify"]);
      return { privateKey, publicKey };
    }

    const privateKeyObject = crypto.nativeCrypto.createPrivateKey({
      key: privateKeyPem,
      format: "pem",
      type: "pkcs8"
    });
    const publicKeyObject = crypto.nativeCrypto.createPublicKey(privateKeyObject);

    const privateKey = await cryptoEngine.subtle.importKey(
      "pkcs8",
      privateKeyObject.export({ format: "der", type: "pkcs8" }),
      algorithm,
      true,
      ["sign"]
    );
    const publicKey = await cryptoEngine.subtle.importKey(
      "spki",
      publicKeyObject.export({ format: "der", type: "spki" }),
      algorithm,
      true,
      ["verify"]
    );
    return { privateKey, publicKey };
  } catch (err) {
    logger.error(err, `Failed to import a stored ${keyAlgorithm} private key for renewal`);
    throw new BadRequestError({
      message: `The stored private key could not be reused for renewal because its algorithm '${keyAlgorithm}' is not supported by this server. Renew with a new key pair, or supply a CSR generated from the existing key.`
    });
  }
};

export const buildCsrFromExistingKey = async ({
  privateKeyPem,
  keyAlgorithm,
  certificateRequest
}: {
  privateKeyPem: string;
  keyAlgorithm: CertKeyAlgorithm;
  certificateRequest: TCertificateRequest;
}): Promise<string> => {
  const algorithm = keyAlgorithmToAlgCfg(keyAlgorithm);
  const { privateKey, publicKey } = await importKeyPairFromPem({ privateKeyPem, keyAlgorithm });

  const altNames = (certificateRequest.subjectAlternativeNames ?? []).map((san) => ({
    type: mapSanTypeToX509Type(san.type),
    value: san.value
  }));

  const csrObj = await x509.Pkcs10CertificateRequestGenerator.create({
    name: buildRenewalDistinguishedName(certificateRequest),
    keys: { privateKey, publicKey },
    signingAlgorithm: algorithm,
    ...(altNames.length > 0 && {
      extensions: [new x509.SubjectAlternativeNameExtension(altNames, false)]
    })
  });

  return csrObj.toString("pem");
};

export const validateRenewalEligibility = (
  certificate: {
    id: string;
    status: string;
    notBefore: Date;
    notAfter: Date;
    revokedAt?: Date | null;
    renewedByCertificateId?: string | null;
    profileId?: string | null;
    caId?: string | null;
    pkiSubscriberId?: string | null;
  },
  ca: TCertificateAuthorityWithAssociatedCa,
  requestedTtl?: string
) => {
  const errors: string[] = [];

  if (certificate.status !== CertStatus.ACTIVE) {
    errors.push(`Certificate status is ${certificate.status}, must be ${CertStatus.ACTIVE}`);
  }

  const now = new Date();
  if (certificate.notAfter <= now) {
    errors.push("Certificate is already expired");
  }

  if (certificate.revokedAt) {
    errors.push("Certificate is revoked and cannot be renewed");
  }

  const caType = (ca.externalCa?.type as CaType) ?? CaType.INTERNAL;
  const isImportedCertificate = certificate.pkiSubscriberId != null && !certificate.profileId;

  if (!caSupportsCapability(caType, CaCapability.RENEW_CERTIFICATES)) {
    errors.push(`CA type ${String(caType)} does not support renewal`);
  }

  if (isImportedCertificate) {
    errors.push("Externally imported certificates cannot be renewed");
  }

  if (ca.status !== CaStatus.ACTIVE) {
    errors.push(`Certificate Authority is ${ca.status}, must be ${CaStatus.ACTIVE}`);
  }

  if (certificate.renewedByCertificateId) {
    errors.push("Certificate has already been renewed");
  }

  const certificateTtlInDays = requestedTtl
    ? Math.ceil(ms(requestedTtl) / (24 * 60 * 60 * 1000))
    : Math.ceil((certificate.notAfter.getTime() - certificate.notBefore.getTime()) / (24 * 60 * 60 * 1000));

  if (ca.internalCa?.notAfter) {
    const caExpiryDate = new Date(ca.internalCa.notAfter);
    const proposedCertExpiryDate = new Date(now.getTime() + certificateTtlInDays * 24 * 60 * 60 * 1000);

    if (proposedCertExpiryDate > caExpiryDate) {
      errors.push(
        `New certificate would expire (${proposedCertExpiryDate.toISOString()}) after its issuing CA (${caExpiryDate.toISOString()})`
      );
    }
  }

  return {
    isEligible: errors.length === 0,
    errors
  };
};
