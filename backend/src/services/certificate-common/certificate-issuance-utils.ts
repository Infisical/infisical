import * as x509 from "@peculiar/x509";
import RE2 from "re2";

import { crypto } from "@app/lib/crypto/cryptography";
import { BadRequestError } from "@app/lib/errors";
import { ms } from "@app/lib/ms";
import { CertKeyAlgorithm, CertKeyType, CertSignatureAlgorithm } from "@app/services/certificate/certificate-types";
import { TCertificateAuthorityWithAssociatedCa } from "@app/services/certificate-authority/certificate-authority-dal";
import { CaType } from "@app/services/certificate-authority/certificate-authority-enums";
import {
  createDistinguishedName,
  createSerialNumber,
  keyAlgorithmToAlgCfg,
  signatureAlgorithmToAlgCfg
} from "@app/services/certificate-authority/certificate-authority-fns";

import { CertExtendedKeyUsageType, CertKeyUsageType, CertSubjectAlternativeNameType } from "./certificate-constants";
import {
  bufferToString,
  buildCertificateSubjectFromTemplate,
  buildSubjectAlternativeNamesFromTemplate,
  convertExtendedKeyUsageArrayToLegacy,
  convertKeyUsageArrayToLegacy
} from "./certificate-utils";

/**
 * Parses a TTL string (e.g., "30d", "24h", "60m") and returns the equivalent in days
 */
export const parseTtlToDays = (ttl: string): number => {
  const match = ttl.match(new RE2("^(\\d+)([dhm])$"));
  if (!match) {
    throw new BadRequestError({ message: `Invalid TTL format: ${ttl}` });
  }

  const [, value, unit] = match;
  const numValue = parseInt(value, 10);

  switch (unit) {
    case "d":
      return numValue;
    case "h":
      return Math.ceil(numValue / 24);
    case "m":
      return Math.ceil(numValue / (24 * 60));
    default:
      throw new BadRequestError({ message: `Unsupported TTL unit: ${unit}` });
  }
};

/**
 * Calculates the renewal threshold in days, ensuring it doesn't exceed the certificate TTL
 */
export const calculateRenewalThreshold = (
  profileRenewBeforeDays: number | undefined,
  certificateTtlInDays: number
): number | undefined => {
  if (!profileRenewBeforeDays) {
    return undefined;
  }

  if (certificateTtlInDays > profileRenewBeforeDays) {
    return profileRenewBeforeDays;
  }

  return Math.max(1, certificateTtlInDays - 1);
};

/**
 * Checks if the renewal timing is valid (renewal date must be at least tomorrow)
 */
export const isValidRenewalTiming = (renewBeforeDays: number, certificateExpiryDate: Date): boolean => {
  const renewalDate = new Date(certificateExpiryDate.getTime() - renewBeforeDays * 24 * 60 * 60 * 1000);
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);

  return renewalDate >= tomorrow;
};

/**
 * Calculates the final renewBeforeDays value based on profile config and certificate TTL
 */
export const calculateFinalRenewBeforeDays = (
  profile: { apiConfig?: { autoRenew?: boolean; renewBeforeDays?: number } },
  ttl: string,
  certificateExpiryDate: Date
): number | undefined => {
  if (!profile.apiConfig?.autoRenew || !profile.apiConfig.renewBeforeDays) {
    return undefined;
  }

  const certificateTtlInDays = parseTtlToDays(ttl);
  const renewBeforeDays = calculateRenewalThreshold(profile.apiConfig.renewBeforeDays, certificateTtlInDays);

  if (!renewBeforeDays) {
    return undefined;
  }

  return isValidRenewalTiming(renewBeforeDays, certificateExpiryDate) ? renewBeforeDays : undefined;
};

/**
 * Validates that the CA supports the requested operation (only internal CAs support direct operations)
 */
export const validateCaSupport = (ca: TCertificateAuthorityWithAssociatedCa, operation: string): CaType => {
  const caType = (ca.externalCa?.type as CaType) ?? CaType.INTERNAL;
  if (caType !== CaType.INTERNAL) {
    throw new BadRequestError({ message: `Only internal CAs support ${operation}` });
  }
  return caType;
};

/**
 * Validates that the CA's key algorithm is compatible with the template's signature algorithms
 */
export const validateAlgorithmCompatibility = (
  ca: TCertificateAuthorityWithAssociatedCa,
  template: {
    algorithms?: {
      signature?: string[];
    };
  }
): void => {
  if (!template.algorithms?.signature || template.algorithms.signature.length === 0) {
    return;
  }

  const caKeyAlgorithm = ca.internalCa?.keyAlgorithm;
  if (!caKeyAlgorithm) {
    throw new BadRequestError({ message: "CA key algorithm not found" });
  }

  const compatibleAlgorithms =
    template.algorithms?.signature?.filter((sigAlg: string) => {
      const parts = sigAlg.split("-");
      if (parts.length === 0) {
        return false;
      }
      const keyType = parts[parts.length - 1];

      if (caKeyAlgorithm.startsWith("RSA")) {
        return keyType === CertKeyType.RSA;
      }

      if (caKeyAlgorithm.startsWith("EC")) {
        return keyType === CertKeyType.ECDSA;
      }

      return false;
    }) || [];

  if (compatibleAlgorithms.length === 0) {
    throw new BadRequestError({
      message: `Template signature algorithms (${template.algorithms?.signature?.join(", ") || "none"}) are not compatible with CA key algorithm (${caKeyAlgorithm})`
    });
  }
};

/**
 * Gets the effective algorithms with fallbacks
 */
export const getEffectiveAlgorithms = (
  requestSignatureAlgorithm?: CertSignatureAlgorithm,
  requestKeyAlgorithm?: CertKeyAlgorithm,
  originalSignatureAlgorithm?: CertSignatureAlgorithm,
  originalKeyAlgorithm?: CertKeyAlgorithm
): { signatureAlgorithm: CertSignatureAlgorithm; keyAlgorithm: CertKeyAlgorithm } => {
  return {
    signatureAlgorithm: requestSignatureAlgorithm || originalSignatureAlgorithm || CertSignatureAlgorithm.RSA_SHA256,
    keyAlgorithm: requestKeyAlgorithm || originalKeyAlgorithm || CertKeyAlgorithm.RSA_2048
  };
};

/**
 * Combines key usage flags into a single number
 */
export const combineKeyUsageFlags = (keyUsages: string[]): number => {
  return keyUsages.reduce((acc: number, usage) => {
    const flag = x509.KeyUsageFlags[usage as keyof typeof x509.KeyUsageFlags];
    // eslint-disable-next-line no-bitwise
    return typeof flag === "number" ? acc | flag : acc;
  }, 0);
};

/**
 * Extracts certificate PEM string from various buffer formats
 */
export const extractCertificateFromBuffer = (certData: Buffer | { rawData: Buffer } | string): string => {
  if (typeof certData === "string") return certData;
  if (Buffer.isBuffer(certData)) return bufferToString(certData);
  if (certData && typeof certData === "object" && "rawData" in certData && Buffer.isBuffer(certData.rawData)) {
    return bufferToString(certData.rawData);
  }
  return bufferToString(certData as unknown as Buffer);
};

/**
 * Detects the SAN type based on the value format
 */
export const detectSanType = (value: string): { type: CertSubjectAlternativeNameType; value: string } => {
  const isIpv4 = new RE2("^\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}$").test(value);
  const isIpv6 = new RE2("^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$").test(value);

  if (isIpv4 || isIpv6) {
    return {
      type: CertSubjectAlternativeNameType.IP_ADDRESS,
      value
    };
  }

  if (new RE2("^[^@]+@[^@]+\\.[^@]+$").test(value)) {
    return {
      type: CertSubjectAlternativeNameType.EMAIL,
      value
    };
  }

  if (new RE2("^[a-zA-Z][a-zA-Z0-9+.-]*:").test(value)) {
    return {
      type: CertSubjectAlternativeNameType.URI,
      value
    };
  }

  return {
    type: CertSubjectAlternativeNameType.DNS_NAME,
    value
  };
};

export type TSelfSignedCertificateRequest = {
  commonName?: string;
  keyUsages?: CertKeyUsageType[];
  extendedKeyUsages?: CertExtendedKeyUsageType[];
  altNames?: Array<{
    type: CertSubjectAlternativeNameType;
    value: string;
  }>;
  validity: { ttl: string };
  notBefore?: Date;
  notAfter?: Date;
};

export type TCertificatePolicy = {
  subject?: Array<{
    type: string;
    allowed?: string[];
    required?: string[];
    denied?: string[];
  }>;
  sans?: Array<{
    type: string;
    allowed?: string[];
    required?: string[];
    denied?: string[];
  }>;
};

export type TSelfSignedCertificateResult = {
  certificate: Buffer;
  privateKey: Buffer;
  serialNumber: string;
  notBefore: Date;
  notAfter: Date;
  certificateSubject: Record<string, unknown>;
  subjectAlternativeNames: Array<{
    type: CertSubjectAlternativeNameType;
    value: string;
  }>;
};

/**
 * Generates a self-signed certificate
 */
export const generateSelfSignedCertificate = async ({
  certificateRequest,
  policy,
  effectiveSignatureAlgorithm,
  effectiveKeyAlgorithm
}: {
  certificateRequest: TSelfSignedCertificateRequest;
  policy?: TCertificatePolicy | null;
  effectiveSignatureAlgorithm: CertSignatureAlgorithm;
  effectiveKeyAlgorithm: CertKeyAlgorithm;
}): Promise<TSelfSignedCertificateResult> => {
  const certificateSubject = buildCertificateSubjectFromTemplate(certificateRequest, policy?.subject);
  const subjectAlternativeNames = buildSubjectAlternativeNamesFromTemplate(
    { subjectAlternativeNames: certificateRequest.altNames },
    policy?.sans
  );

  const keyGenAlg = keyAlgorithmToAlgCfg(effectiveKeyAlgorithm);
  const keyPair = await crypto.nativeCrypto.subtle.generateKey(keyGenAlg, true, ["sign", "verify"]);

  const signatureAlgorithmConfig = signatureAlgorithmToAlgCfg(effectiveSignatureAlgorithm, effectiveKeyAlgorithm);

  const notBeforeDate = certificateRequest.notBefore ? new Date(certificateRequest.notBefore) : new Date();

  let notAfterDate: Date;
  if (certificateRequest.notAfter) {
    notAfterDate = new Date(certificateRequest.notAfter);
  } else if (certificateRequest.validity.ttl) {
    notAfterDate = new Date(new Date().getTime() + ms(certificateRequest.validity.ttl));
  } else {
    throw new BadRequestError({
      message: "Either notAfter date or TTL must be provided for certificate validity"
    });
  }

  const serialNumber = createSerialNumber();
  const dn = createDistinguishedName({
    commonName: certificateSubject.common_name,
    organization: certificateSubject.organization,
    ou: certificateSubject.organizational_unit,
    country: certificateSubject.country,
    province: certificateSubject.state_or_province_name,
    locality: certificateSubject.locality_name
  });

  const cert = await x509.X509CertificateGenerator.createSelfSigned({
    name: dn,
    serialNumber,
    notBefore: notBeforeDate,
    notAfter: notAfterDate,
    signingAlgorithm: signatureAlgorithmConfig,
    keys: keyPair,
    extensions: [
      new x509.BasicConstraintsExtension(false, undefined, false),
      ...(certificateRequest.keyUsages?.length
        ? [
            new x509.KeyUsagesExtension(
              combineKeyUsageFlags(convertKeyUsageArrayToLegacy(certificateRequest.keyUsages) || []),
              false
            )
          ]
        : []),
      ...(certificateRequest.extendedKeyUsages?.length
        ? [
            new x509.ExtendedKeyUsageExtension(
              (convertExtendedKeyUsageArrayToLegacy(certificateRequest.extendedKeyUsages) || []).map(
                (eku) => x509.ExtendedKeyUsage[eku]
              ),
              false
            )
          ]
        : []),
      ...(subjectAlternativeNames
        ? [
            new x509.SubjectAlternativeNameExtension(
              certificateRequest.altNames?.map((san) => {
                switch (san.type) {
                  case CertSubjectAlternativeNameType.DNS_NAME:
                    return { type: "dns" as const, value: san.value };
                  case CertSubjectAlternativeNameType.IP_ADDRESS:
                    return { type: "ip" as const, value: san.value };
                  case CertSubjectAlternativeNameType.EMAIL:
                    return { type: "email" as const, value: san.value };
                  case CertSubjectAlternativeNameType.URI:
                    return { type: "url" as const, value: san.value };
                  default:
                    throw new BadRequestError({
                      message: `Unsupported Subject Alternative Name type: ${san.type as string}`
                    });
                }
              }) || [],
              false
            )
          ]
        : [])
    ]
  });

  const certificatePem = cert.toString("pem");
  const privateKeyObj = crypto.nativeCrypto.KeyObject.from(keyPair.privateKey);
  const privateKeyPem = privateKeyObj.export({ format: "pem", type: "pkcs8" }) as string;

  return {
    certificate: Buffer.from(certificatePem),
    privateKey: Buffer.from(privateKeyPem),
    serialNumber,
    notBefore: notBeforeDate,
    notAfter: notAfterDate,
    certificateSubject,
    subjectAlternativeNames: certificateRequest.altNames || []
  };
};
