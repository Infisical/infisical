import { CertificateRenewalKeySource } from "@app/hooks/api/certificates/enums";
import { TCertificate, TRenewCertificateAttributes } from "@app/hooks/api/certificates/types";
import {
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
  signatureAlgorithm: cert.signatureAlgorithm ?? "",
  keyAlgorithm: cert.keyAlgorithm ?? "",
  keyUsages: Object.fromEntries((cert.keyUsages ?? []).map((usage) => [usage, true])),
  extendedKeyUsages: Object.fromEntries(
    (cert.extendedKeyUsages ?? []).map((usage) => [usage, true])
  )
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
  constraints
}: {
  formData: RenewalFormData;
  constraints: TemplateConstraints;
}): TRenewCertificateAttributes => {
  // The CSR carries its own basic constraints and the CSR step offers no control over them, so
  // sending the previous certificate's would silently override what the caller actually signed.
  if (formData.keySource === CertificateRenewalKeySource.Csr) {
    return { ttl: formData.ttl };
  }

  const basicConstraints = buildBasicConstraints(formData, constraints);

  const attributes: TRenewCertificateAttributes = {
    ttl: formData.ttl,
    keyUsages: filterUsages(formData.keyUsages as Record<string, boolean>),
    extendedKeyUsages: filterUsages(formData.extendedKeyUsages as Record<string, boolean>),
    ...(formData.signatureAlgorithm && { signatureAlgorithm: formData.signatureAlgorithm }),
    ...(formData.keySource !== CertificateRenewalKeySource.Reuse &&
      formData.keyAlgorithm && { keyAlgorithm: formData.keyAlgorithm }),
    ...(basicConstraints && { basicConstraints })
  };

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
