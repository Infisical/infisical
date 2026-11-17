import { BadRequestError } from "@app/lib/errors";
import { pick } from "@app/lib/fn";
import { ms } from "@app/lib/ms";
import { CertExtendedKeyUsage, CertKeyUsage } from "@app/services/certificate/certificate-types";

import { createDistinguishedName } from "../certificate-authority/certificate-authority-fns";
import {
  CertExtendedKeyUsageType,
  CertKeyUsageType,
  mapLegacyExtendedKeyUsageToStandard,
  mapLegacyKeyUsageToStandard,
  CUSTOM_EXTENSION_PRESET_OIDS
} from "../certificate-common/certificate-constants";
import { buildSubjectOverrideForCsr } from "../certificate-common/certificate-csr-utils";
import {
  describeCustomExtensionValue,
  findCustomExtensionRuleValueError,
  TCustomExtensionRule,
  TResolvedCustomExtension
} from "../certificate-common/certificate-extension-fns";
import { TCertificateRequest } from "../certificate-policy/certificate-policy-types";
import { TCertificateProfileDefaults } from "../certificate-profile/certificate-profile-types";
import { TIssuerNameOverride } from "./certificate-v3-types";

export const calculateRenewalThreshold = (
  profileRenewBeforeDays: number | undefined,
  certificateTtlInDays: number
): number | undefined => {
  if (profileRenewBeforeDays === undefined) {
    return undefined;
  }

  if (profileRenewBeforeDays >= certificateTtlInDays) {
    // If renewBeforeDays >= TTL, renew 1 day before expiry
    return Math.max(1, certificateTtlInDays - 1);
  }

  return profileRenewBeforeDays;
};

/**
 * Resolves the effective TTL to use for certificate issuance.
 *
 * Priority order:
 * 1. Request TTL (user explicitly passed)
 * 2. Profile's defaults.ttlDays (validates against policy max)
 * 3. Flow-specific default (for ACME, EST, etc.)
 * 4. Error - throws if no TTL source is available
 *
 * @param requestTtl - TTL from the certificate request
 * @param profileDefaultTtlDays - Profile's default TTL in days
 * @param policyMaxValidity - Policy's maximum validity (e.g., "365d", "1y")
 * @param flowDefaultTtl - Default TTL for the enrollment flow (e.g., "47d" for ACME, "90d" for EST)
 * @returns The resolved TTL string
 * @throws BadRequestError if profile default TTL exceeds policy max validity
 * @throws BadRequestError if no TTL source is available (for API flows)
 */
export const resolveEffectiveTtl = ({
  requestTtl,
  profileDefaultTtlDays,
  policyMaxValidity,
  flowDefaultTtl
}: {
  requestTtl?: string;
  profileDefaultTtlDays?: number | null;
  policyMaxValidity?: string | null;
  flowDefaultTtl: string;
}): string => {
  // Priority 1: Request TTL (user explicitly passed)
  if (requestTtl) {
    return requestTtl;
  }

  // Priority 2: Profile's defaults.ttlDays
  if (profileDefaultTtlDays) {
    // Validate against policy's maxValidity (catch config drift)
    if (policyMaxValidity) {
      const profileTtlMs = profileDefaultTtlDays * 24 * 60 * 60 * 1000;
      const policyMaxMs = ms(policyMaxValidity);

      if (profileTtlMs > policyMaxMs) {
        throw new BadRequestError({
          message: `Profile's default TTL (${profileDefaultTtlDays} days) exceeds the policy's maximum validity (${policyMaxValidity}). Please update the profile or policy to fix this configuration mismatch.`
        });
      }
    }
    return `${profileDefaultTtlDays}d`;
  }

  // Priority 3: Flow default (for ACME, EST, etc.)
  if (flowDefaultTtl) {
    return flowDefaultTtl;
  }

  // No TTL source available - throw error for API flows
  throw new BadRequestError({
    message: "Certificate issuance requires a valid TTL"
  });
};

/**
 * Applies profile defaults to certificate request
 * Request values always take precedence over defaults.
 * For scalar fields, key-presence distinguishes "omitted" (use default) from "explicitly set/cleared".
 * For keyUsages/extendedKeyUsages/basicConstraints, replace strategy: request array wins entirely if present.
 */
export const applyProfileDefaults = <
  T extends {
    commonName?: string;
    organization?: string;
    organizationalUnit?: string;
    country?: string;
    state?: string;
    locality?: string;
    domainComponents?: string[];
    keyAlgorithm?: string;
    signatureAlgorithm?: string;
    keyUsages?: string[];
    extendedKeyUsages?: string[];
    basicConstraints?: { isCA: boolean; pathLength?: number };
    altNames?: { type: string; value: string }[];
  }
>(
  request: T,
  defaults: TCertificateProfileDefaults | null | undefined
): T => {
  if (!defaults) return request;

  const altNames = request.altNames && request.altNames.length > 0 ? request.altNames : defaults.subjectAltNames;

  // For scalar fields, key-presence distinguishes "omitted" (use default) from "explicitly set/cleared".
  // CSR extraction (extractCertificateRequestFromCSR) omits keys for absent fields,
  // while API routes include keys with undefined values for explicitly cleared fields.
  return {
    ...request,
    commonName: "commonName" in request ? request.commonName : defaults.commonName,
    organization: "organization" in request ? request.organization : defaults.organization,
    organizationalUnit: "organizationalUnit" in request ? request.organizationalUnit : defaults.organizationalUnit,
    country: "country" in request ? request.country : defaults.country,
    state: "state" in request ? request.state : defaults.state,
    locality: "locality" in request ? request.locality : defaults.locality,
    domainComponents: "domainComponents" in request ? request.domainComponents : defaults.domainComponents,
    keyAlgorithm: "keyAlgorithm" in request ? request.keyAlgorithm : defaults.keyAlgorithm,
    signatureAlgorithm: "signatureAlgorithm" in request ? request.signatureAlgorithm : defaults.signatureAlgorithm,
    keyUsages: request.keyUsages !== undefined ? request.keyUsages : defaults.keyUsages,
    extendedKeyUsages: request.extendedKeyUsages !== undefined ? request.extendedKeyUsages : defaults.extendedKeyUsages,
    basicConstraints: request.basicConstraints !== undefined ? request.basicConstraints : defaults.basicConstraints,
    altNames
  };
};

export const applyIssuerNameOverride = (
  csrRequest: TCertificateRequest,
  issuerNameOverride: TIssuerNameOverride | undefined,
  profileDefaults: Pick<TCertificateProfileDefaults, "keyUsages" | "extendedKeyUsages"> | null | undefined
): TCertificateRequest =>
  issuerNameOverride
    ? {
        ...pick(csrRequest, ["basicConstraints"]),
        keyUsages: profileDefaults?.keyUsages?.length ? undefined : csrRequest.keyUsages,
        extendedKeyUsages: profileDefaults?.extendedKeyUsages?.length ? undefined : csrRequest.extendedKeyUsages,
        commonName: issuerNameOverride.commonName,
        subjectAlternativeNames: issuerNameOverride.altNames
      }
    : csrRequest;

const POLICY_EXEMPT_ISSUER_ADDED_OIDS: string[] = [CUSTOM_EXTENSION_PRESET_OIDS.MS_CERTIFICATE_TEMPLATE_INFORMATION];

export const assertIssuerAddedExtensionsAllowedByPolicy = (
  issuerAddedExtensions: TResolvedCustomExtension[],
  rules: TCustomExtensionRule[] | null | undefined
) => {
  const errors = issuerAddedExtensions.flatMap((extension) => {
    const rule = rules?.find((candidate) => candidate.oid === extension.oid);
    if (!rule || POLICY_EXEMPT_ISSUER_ADDED_OIDS.includes(extension.oid)) return [];
    const displayValue = describeCustomExtensionValue(extension.oid, extension.value);
    if (displayValue === null) {
      return [`Custom extension '${extension.oid}' added by the issuer cannot be checked against this policy.`];
    }
    const error = findCustomExtensionRuleValueError(extension.oid, displayValue, rule);
    return error ? [error] : [];
  });
  if (errors.length) {
    throw new BadRequestError({ message: `Certificate request validation failed: ${errors.join(", ")}` });
  }
};

export const mergeIssuerAddedExtensions = (
  resolvedExtensions: TResolvedCustomExtension[] | undefined,
  issuerAddedExtensions: TResolvedCustomExtension[]
): TResolvedCustomExtension[] => {
  const issuerAddedOids = issuerAddedExtensions.map((extension) => extension.oid);
  return [
    ...(resolvedExtensions ?? []).filter((extension) => !issuerAddedOids.includes(extension.oid)),
    ...issuerAddedExtensions
  ];
};

export const formatIssuerAltNames = (issuerNameOverride: TIssuerNameOverride | undefined) =>
  issuerNameOverride?.altNames.map((altName) => altName.value).join(",");

export const buildIssuanceSubject = (
  csr: string,
  request: Pick<
    TCertificateRequest,
    "commonName" | "organization" | "organizationalUnit" | "country" | "state" | "locality" | "domainComponents"
  >,
  issuerNameOverride: TIssuerNameOverride | undefined
) =>
  issuerNameOverride
    ? createDistinguishedName({
        commonName: request.commonName,
        organization: request.organization,
        ou: request.organizationalUnit,
        country: request.country,
        province: request.state,
        locality: request.locality,
        domainComponents: request.domainComponents
      })
    : buildSubjectOverrideForCsr(csr, request);

export const parseKeyUsages = (keyUsages: unknown): CertKeyUsageType[] => {
  if (!keyUsages) return [];

  const validKeyUsages = [...Object.values(CertKeyUsageType), ...Object.values(CertKeyUsage)] as string[];

  const normalize = (usage: string): CertKeyUsageType | null => {
    if (validKeyUsages.includes(usage)) {
      return mapLegacyKeyUsageToStandard(usage as CertKeyUsageType);
    }
    return null;
  };

  let raw: string[];

  if (Array.isArray(keyUsages)) {
    raw = keyUsages.filter((u): u is string => typeof u === "string");
  } else if (typeof keyUsages === "string") {
    raw = keyUsages.split(",").map((u) => u.trim());
  } else {
    return [];
  }

  return raw.map((u) => normalize(u)).filter((u): u is CertKeyUsageType => u !== null);
};

export const parseExtendedKeyUsages = (extendedKeyUsages: unknown): CertExtendedKeyUsageType[] => {
  if (!extendedKeyUsages) return [];

  const validExtendedKeyUsages = [
    ...Object.values(CertExtendedKeyUsageType),
    ...Object.values(CertExtendedKeyUsage)
  ] as string[];

  const normalize = (usage: string): CertExtendedKeyUsageType | null => {
    if (validExtendedKeyUsages.includes(usage)) {
      return mapLegacyExtendedKeyUsageToStandard(usage as CertExtendedKeyUsageType);
    }
    return null;
  };

  let raw: string[];

  if (Array.isArray(extendedKeyUsages)) {
    raw = extendedKeyUsages.filter((u): u is string => typeof u === "string");
  } else if (typeof extendedKeyUsages === "string") {
    raw = extendedKeyUsages.split(",").map((u) => u.trim());
  } else {
    return [];
  }

  return raw.map((u) => normalize(u)).filter((u): u is CertExtendedKeyUsageType => u !== null);
};
