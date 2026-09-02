import {
  certKeyAlgorithms,
  SIGNATURE_ALGORITHMS_OPTIONS
} from "@app/hooks/api/certificates/constants";
import { CertificateRenewalKeySource } from "@app/hooks/api/certificates/enums";
import { TCertificate, TRenewCertificateAttributes } from "@app/hooks/api/certificates/types";
import {
  CertExtendedKeyUsageType,
  CertKeyUsageType,
  CertSubjectAlternativeNameType,
  CertSubjectAttributeType
} from "@app/pages/cert-manager/PoliciesPage/components/CertificatePoliciesTab/shared/certificate-constants";

import type { RenewalFormData } from "./CertificateRenewalModal";
import {
  filterUsages,
  formatSubjectAltNames,
  getAttributeValue,
  sanTypeCandidatesFromValue,
  SUBJECT_ATTR_MAP
} from "./certificateUtils";
import type { TemplateConstraints } from "./useCertificatePolicy";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const usageByCollapsedName = <T extends string>(values: T[], aliases: Record<string, T> = {}) =>
  new Map<string, T>([
    ...values.map((value) => [value.replace(/_/g, "").toLowerCase(), value] as [string, T]),
    ...(Object.entries(aliases) as [string, T][])
  ]);

const KNOWN_SIGNATURE_ALGORITHMS = new Set<string>(
  SIGNATURE_ALGORITHMS_OPTIONS.map((o) => o.value)
);
const KNOWN_KEY_ALGORITHMS = new Set<string>(certKeyAlgorithms.map((o) => o.value as string));

const KEY_USAGE_BY_NAME = usageByCollapsedName(Object.values(CertKeyUsageType));
const EXTENDED_KEY_USAGE_BY_NAME = usageByCollapsedName(Object.values(CertExtendedKeyUsageType), {
  anyextendedkeyusage: CertExtendedKeyUsageType.ANY_PURPOSE
});

const toUsageFormKeys = (usages: string[] | undefined, known: Map<string, string>) =>
  Object.fromEntries(
    (usages ?? []).map((usage) => [known.get(usage.replace(/_/g, "").toLowerCase()) ?? usage, true])
  );

const deriveTtlFromCertificate = (cert: TCertificate): string => {
  const spanMs = new Date(cert.notAfter).getTime() - new Date(cert.notBefore).getTime();
  if (!Number.isFinite(spanMs) || spanMs <= 0) return "";

  const days = Math.floor(spanMs / MS_PER_DAY);
  if (days > 0) return `${days}d`;

  const hours = Math.max(1, Math.floor(spanMs / (60 * 60 * 1000)));
  return `${hours}h`;
};

const resolveSanType = (
  value: string,
  allowedSanTypes: CertSubjectAlternativeNameType[]
): CertSubjectAlternativeNameType => {
  const candidates = sanTypeCandidatesFromValue(value);
  if (!allowedSanTypes.length) return candidates[0];
  return candidates.find((candidate) => allowedSanTypes.includes(candidate)) ?? candidates[0];
};

const parseCertificateSans = (
  cert: TCertificate,
  allowedSanTypes: CertSubjectAlternativeNameType[]
): { type: CertSubjectAlternativeNameType; value: string }[] => {
  const raw = cert.subjectAltNames || cert.altNames || "";
  return raw
    .split(",")
    .map((san) => san.trim())
    .filter(Boolean)
    .map((value) => ({ type: resolveSanType(value, allowedSanTypes), value }));
};

const buildSubjectAttributes = (cert: TCertificate) => {
  const attributes: { type: CertSubjectAttributeType; value: string }[] = [];

  SUBJECT_ATTR_MAP.forEach(({ attrType, requestKey }) => {
    const value = requestKey === "commonName" ? cert.commonName : cert.subject?.[requestKey];
    if (value) attributes.push({ type: attrType, value });
  });

  cert.subject?.domainComponents?.forEach((dc) => {
    if (dc) attributes.push({ type: CertSubjectAttributeType.DOMAIN_COMPONENT, value: dc });
  });

  return attributes;
};

/**
 * Policy-allowed options plus any the certificate already carries, so a usage the policy has since
 * dropped stays visible and removable rather than being submitted from an unrendered checkbox.
 */
export const unionUsageOptions = <T extends { value: string }>(
  allowed: T[],
  all: readonly T[],
  presentCsv: string
): T[] => {
  const present = presentCsv ? presentCsv.split(",").filter(Boolean) : [];
  const missing = present.filter((v) => !allowed.some((o) => o.value === v));
  return [...allowed, ...all.filter((o) => missing.includes(o.value))];
};

export const buildRenewalFormDefaults = (
  cert: TCertificate,
  constraints: TemplateConstraints
): RenewalFormData => ({
  keySource: CertificateRenewalKeySource.New,
  csr: "",
  ttl: deriveTtlFromCertificate(cert),
  subjectAttributes: buildSubjectAttributes(cert),
  subjectAltNames: parseCertificateSans(cert, constraints.allowedSanTypes),
  basicConstraints: {
    isCA: Boolean(cert.basicConstraints?.isCA),
    pathLength: cert.basicConstraints?.pathLength ?? null
  },
  signatureAlgorithm: KNOWN_SIGNATURE_ALGORITHMS.has(cert.signatureAlgorithm ?? "")
    ? (cert.signatureAlgorithm as string)
    : "",
  keyAlgorithm: KNOWN_KEY_ALGORITHMS.has(cert.keyAlgorithm ?? "")
    ? (cert.keyAlgorithm as string)
    : "",
  keyUsages: toUsageFormKeys(cert.keyUsages, KEY_USAGE_BY_NAME),
  extendedKeyUsages: toUsageFormKeys(cert.extendedKeyUsages, EXTENDED_KEY_USAGE_BY_NAME),
  customExtensions: (cert.customExtensions ?? [])
    .filter((extension) => extension.displayValue !== undefined)
    .map((extension) => ({ oid: extension.oid, value: extension.displayValue as string }))
});

const buildBasicConstraints = (
  formData: RenewalFormData,
  constraints: TemplateConstraints
): TRenewCertificateAttributes["basicConstraints"] => {
  if (!constraints.templateAllowsCA) return undefined;

  const isCA = constraints.templateRequiresCA || formData.basicConstraints.isCA;
  const { pathLength } = formData.basicConstraints;

  return { isCA, ...(isCA && pathLength !== null && pathLength !== undefined && { pathLength }) };
};

export const buildRenewalRequestAttributes = ({
  formData,
  constraints,
  isExternalTemplateProfile = false
}: {
  formData: RenewalFormData;
  constraints: TemplateConstraints;
  isExternalTemplateProfile?: boolean;
}): TRenewCertificateAttributes => {
  // The CSR carries its own basic constraints and the CSR step offers no control over them, so
  // sending the previous certificate's would silently override what the caller actually signed.
  if (formData.keySource === CertificateRenewalKeySource.Csr) {
    return { ttl: formData.ttl };
  }

  const customExtensions = (formData.customExtensions ?? [])
    .filter((extension) => extension.oid.trim())
    .map((extension) => ({ oid: extension.oid.trim(), value: extension.value }));

  const basicConstraints = buildBasicConstraints(formData, constraints);

  const attributes: TRenewCertificateAttributes = isExternalTemplateProfile
    ? {
        ...(formData.keySource !== CertificateRenewalKeySource.Reuse &&
          formData.keyAlgorithm && { keyAlgorithm: formData.keyAlgorithm })
      }
    : {
        ttl: formData.ttl,
        keyUsages: filterUsages(formData.keyUsages as Record<string, boolean>),
        extendedKeyUsages: filterUsages(formData.extendedKeyUsages as Record<string, boolean>),
        ...(formData.signatureAlgorithm && { signatureAlgorithm: formData.signatureAlgorithm }),
        ...(formData.keySource !== CertificateRenewalKeySource.Reuse &&
          formData.keyAlgorithm && { keyAlgorithm: formData.keyAlgorithm }),
        ...(basicConstraints && { basicConstraints })
      };

  attributes.customExtensions = customExtensions;

  if (constraints.shouldShowSubjectSection) {
    SUBJECT_ATTR_MAP.forEach(({ attrType, requestKey }) => {
      attributes[requestKey] = getAttributeValue(formData.subjectAttributes, attrType) || null;
    });

    attributes.domainComponents = formData.subjectAttributes
      .filter((attr) => attr.type === CertSubjectAttributeType.DOMAIN_COMPONENT)
      .map((attr) => attr.value.trim())
      .filter(Boolean);
  }

  if (constraints.shouldShowSanSection) {
    attributes.altNames = formatSubjectAltNames(formData.subjectAltNames);
  }

  return attributes;
};
