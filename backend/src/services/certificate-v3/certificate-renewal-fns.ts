import * as x509 from "@peculiar/x509";
import RE2 from "re2";

import { TCertificates } from "@app/db/schemas";
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
import { toRequestCustomExtensions, TRequestCustomExtension } from "../certificate-common/certificate-extension-fns";
import { mapEnumsForValidation } from "../certificate-common/certificate-utils";
import { TCertificateRequest } from "../certificate-policy/certificate-policy-types";
import { parseExtendedKeyUsages, parseKeyUsages } from "./certificate-v3-fns";
import { CertificateRenewalKeySource, TRenewalAttributes, TRenewalAuditChange } from "./certificate-v3-types";

export enum CertificateRenewalMode {
  SelfSigned = "self-signed",
  InternalCa = "internal-ca",
  KeyPreserving = "key-preserving",
  ExternalCa = "external-ca"
}

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

type TRenewalAuditSubject = Pick<
  TCertificates,
  | "commonName"
  | "altNames"
  | "keyUsages"
  | "extendedKeyUsages"
  | "signatureAlgorithm"
  | "keyAlgorithm"
  | "subjectOrganization"
  | "subjectOrganizationalUnit"
  | "subjectCountry"
  | "subjectState"
  | "subjectLocality"
  | "subjectDomainComponents"
  | "isCA"
  | "pathLength"
  | "notBefore"
  | "notAfter"
  | "customExtensions"
>;

const formatBasicConstraints = (isCA: boolean | null | undefined, pathLength: number | null | undefined) =>
  `isCA=${Boolean(isCA)}${pathLength === null || pathLength === undefined ? "" : ` pathLength=${pathLength}`}`;

type TRenewalAttributeDescriptor<K extends keyof TRenewalAttributes> = {
  label: string;
  csrEditable?: true;
  apply: (value: TRenewalAttributes[K]) => Partial<TCertificateRequest>;
  current: (original: TRenewalAuditSubject) => string;
  issued: (request: TCertificateRequest) => string;
};

const text = (value: string | null | undefined) => value ?? "";

const describeStoredCustomExtensions = (stored: unknown): TRequestCustomExtension[] => {
  try {
    return toRequestCustomExtensions(stored);
  } catch {
    return ((stored as { oid: string }[] | null) ?? []).map(({ oid }) => ({ oid, value: "" }));
  }
};

const customExtensionList = (extensions: TRequestCustomExtension[] | null | undefined) =>
  (extensions ?? [])
    .map((extension) => `${extension.oid}=${extension.value ?? ""}${extension.critical ? " (critical)" : ""}`)
    .join(",");
const list = (values: readonly string[] | null | undefined) => (values ?? []).join(",");

const RENEWAL_ATTRIBUTES: { [K in keyof TRenewalAttributes]-?: TRenewalAttributeDescriptor<K> } = {
  commonName: {
    label: "common name",
    apply: (value) => ({ commonName: value ?? undefined }),
    current: (original) => text(original.commonName),
    issued: (request) => text(request.commonName)
  },
  organization: {
    label: "organization",
    apply: (value) => ({ organization: value ?? undefined }),
    current: (original) => text(original.subjectOrganization),
    issued: (request) => text(request.organization)
  },
  organizationalUnit: {
    label: "organizational unit",
    apply: (value) => ({ organizationalUnit: value ?? undefined }),
    current: (original) => text(original.subjectOrganizationalUnit),
    issued: (request) => text(request.organizationalUnit)
  },
  country: {
    label: "country",
    apply: (value) => ({ country: value ?? undefined }),
    current: (original) => text(original.subjectCountry),
    issued: (request) => text(request.country)
  },
  state: {
    label: "state",
    apply: (value) => ({ state: value ?? undefined }),
    current: (original) => text(original.subjectState),
    issued: (request) => text(request.state)
  },
  locality: {
    label: "locality",
    apply: (value) => ({ locality: value ?? undefined }),
    current: (original) => text(original.subjectLocality),
    issued: (request) => text(request.locality)
  },
  domainComponents: {
    label: "domain components",
    apply: (value) => ({ domainComponents: value ?? undefined }),
    current: (original) => text(original.subjectDomainComponents),
    issued: (request) => list(request.domainComponents)
  },
  altNames: {
    label: "subject alternative names",
    apply: (value) => ({ subjectAlternativeNames: value }),
    current: (original) => text(original.altNames),
    issued: (request) => (request.subjectAlternativeNames ?? []).map((san) => san.value).join(",")
  },
  keyUsages: {
    label: "key usages",
    apply: (value) => ({ keyUsages: value }),
    current: (original) => list(parseKeyUsages(original.keyUsages)),
    issued: (request) => list(request.keyUsages)
  },
  extendedKeyUsages: {
    label: "extended key usages",
    apply: (value) => ({ extendedKeyUsages: value }),
    current: (original) => list(parseExtendedKeyUsages(original.extendedKeyUsages)),
    issued: (request) => list(request.extendedKeyUsages)
  },
  signatureAlgorithm: {
    label: "signature algorithm",
    apply: (value) => ({ signatureAlgorithm: value }),
    current: (original) => text(original.signatureAlgorithm),
    issued: (request) => text(request.signatureAlgorithm)
  },
  keyAlgorithm: {
    label: "key algorithm",
    apply: (value) => ({ keyAlgorithm: value }),
    current: (original) => text(original.keyAlgorithm),
    issued: (request) => text(request.keyAlgorithm)
  },
  ttl: {
    label: "TTL",
    csrEditable: true,
    apply: (value) => ({ validity: { ttl: value as string } }),
    current: (original) => certificateSpanToTtl(original.notBefore, original.notAfter),
    issued: (request) => text(request.validity?.ttl)
  },
  basicConstraints: {
    label: "basic constraints",
    csrEditable: true,
    apply: (value) => ({ basicConstraints: value }),
    current: (original) => formatBasicConstraints(original.isCA, original.pathLength),
    issued: (request) => formatBasicConstraints(request.basicConstraints?.isCA, request.basicConstraints?.pathLength)
  },
  customExtensions: {
    label: "custom extensions",
    csrEditable: true,
    apply: (value) => ({ customExtensions: value }),
    current: (original) => customExtensionList(describeStoredCustomExtensions(original.customExtensions)),
    issued: (request) => customExtensionList(request.customExtensions)
  }
};

const RENEWAL_ATTRIBUTE_KEYS = Object.keys(RENEWAL_ATTRIBUTES) as (keyof TRenewalAttributes)[];

const suppliedAttributeKeys = (attributes: TRenewalAttributes) =>
  RENEWAL_ATTRIBUTE_KEYS.filter((key) => attributes[key] !== undefined);

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

export const isCertificateContentEdit = ({
  keySource,
  attributes
}: {
  keySource: CertificateRenewalKeySource;
  attributes?: TRenewalAttributes;
}): boolean => {
  if (keySource === CertificateRenewalKeySource.Csr) return true;
  if (!attributes) return false;

  return suppliedAttributeKeys(attributes).length > 0;
};

export const assertCsrRenewalAttributes = (attributes?: TRenewalAttributes) => {
  if (!attributes) return;

  const rejected = suppliedAttributeKeys(attributes)
    .filter((key) => !RENEWAL_ATTRIBUTES[key].csrEditable)
    .map((key) => RENEWAL_ATTRIBUTES[key].label);

  if (rejected.length > 0) {
    const settable = RENEWAL_ATTRIBUTE_KEYS.filter((key) => RENEWAL_ATTRIBUTES[key].csrEditable).map(
      (key) => RENEWAL_ATTRIBUTES[key].label
    );
    throw new BadRequestError({
      message: `The CSR is the source of truth for ${rejected.join(", ")}. Update the CSR instead, or renew without one. Only ${settable.join(", ")} can be set alongside a CSR.`
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

  return suppliedAttributeKeys(attributes).reduce<TCertificateRequest>(
    (request, key) => ({
      ...request,
      ...(RENEWAL_ATTRIBUTES[key] as TRenewalAttributeDescriptor<typeof key>).apply(attributes[key])
    }),
    original
  );
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

export const buildRenewalAuditChanges = (
  original: TRenewalAuditSubject,
  issuedRequest: TCertificateRequest
): TRenewalAuditChange[] =>
  RENEWAL_ATTRIBUTE_KEYS.map((field) => ({
    field,
    from: RENEWAL_ATTRIBUTES[field].current(original),
    to: RENEWAL_ATTRIBUTES[field].issued(issuedRequest)
  })).filter(({ from, to }) => from !== to);

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
