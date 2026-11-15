import type { TCertificatePolicy } from "@app/hooks/api/certificatePolicies/types";
import {
  IssuerType,
  type TCertificateProfile,
  type TCertificateProfileDefaults
} from "@app/hooks/api/certificateProfiles/types";
import {
  certKeyAlgorithms,
  EXTENDED_KEY_USAGES_OPTIONS,
  KEY_USAGES_OPTIONS,
  SIGNATURE_ALGORITHMS_OPTIONS
} from "@app/hooks/api/certificates/constants";

import {
  type Criticality,
  keyToApi,
  ruleKey,
  SAN_TYPES,
  type SanType,
  signatureToApi,
  SUBJECT_TYPES,
  type SubjectType
} from "./policy-model";

export const PROFILE_SLUG_PATTERN = /^[a-z0-9-]+$/;

export const normalizeSlug = (value: string) => value.toLowerCase().replace(/\s+/g, "-");

export type DefaultEntry<T extends string> = { key: string; type: T; value: string };
export type ExtensionDefault = {
  key: string;
  oid: string;
  label?: string;
  critical: boolean;
  value: string;
};

export type ProfileDefaultsDraft = {
  ttlDays: string;
  subjectAttributes: DefaultEntry<SubjectType>[];
  sans: DefaultEntry<SanType>[];
  signatureAlgorithm: string;
  keyAlgorithm: string;
  keyUsages?: string[];
  extendedKeyUsages?: string[];
  isCA: boolean;
  pathLength: string;
  customExtensions: ExtensionDefault[];
};

export type ProfileDraft = {
  slug: string;
  description: string;
  issuerType: IssuerType;
  caId: string;
  policyId: string;
  template: string;
  defaults: ProfileDefaultsDraft;
};

export const emptyDefaults = (): ProfileDefaultsDraft => ({
  ttlDays: "",
  subjectAttributes: [],
  sans: [],
  signatureAlgorithm: "",
  keyAlgorithm: "",
  isCA: false,
  pathLength: "",
  customExtensions: []
});

const SUBJECT_FIELDS: [SubjectType, keyof TCertificateProfileDefaults][] = [
  ["common_name", "commonName"],
  ["organization", "organization"],
  ["organizational_unit", "organizationalUnit"],
  ["country", "country"],
  ["state", "state"],
  ["locality", "locality"]
];

const defaultsDraftOf = (defaults?: TCertificateProfileDefaults | null): ProfileDefaultsDraft => {
  if (!defaults) return emptyDefaults();
  return {
    ttlDays: defaults.ttlDays ? String(defaults.ttlDays) : "",
    subjectAttributes: [
      ...SUBJECT_FIELDS.flatMap(([type, field]) => {
        const value = defaults[field];
        return typeof value === "string" && value ? [{ key: ruleKey(), type, value }] : [];
      }),
      ...(defaults.domainComponents ?? []).map((value) => ({
        key: ruleKey(),
        type: "domain_component" as const,
        value
      }))
    ],
    sans: (defaults.subjectAltNames ?? []).map((san) => ({
      key: ruleKey(),
      type: san.type as SanType,
      value: san.value
    })),
    signatureAlgorithm: defaults.signatureAlgorithm ?? "",
    keyAlgorithm: defaults.keyAlgorithm ?? "",
    keyUsages: defaults.keyUsages?.length ? defaults.keyUsages : undefined,
    extendedKeyUsages: defaults.extendedKeyUsages?.length ? defaults.extendedKeyUsages : undefined,
    isCA: Boolean(defaults.basicConstraints?.isCA),
    pathLength:
      defaults.basicConstraints?.pathLength !== undefined &&
      defaults.basicConstraints?.pathLength !== null
        ? String(defaults.basicConstraints.pathLength)
        : "",
    customExtensions: (defaults.customExtensions ?? []).map((extension) => ({
      key: ruleKey(),
      oid: extension.oid,
      label: extension.label,
      critical: Boolean(extension.critical),
      value: extension.value ?? ""
    }))
  };
};

export const profileDraftOf = (
  profile: TCertificateProfile | undefined,
  { clone, initialSlug = "" }: { clone?: boolean; initialSlug?: string } = {}
): ProfileDraft => {
  if (!profile)
    return {
      slug: normalizeSlug(initialSlug),
      description: "",
      issuerType: IssuerType.CA,
      caId: "",
      policyId: "",
      template: "",
      defaults: emptyDefaults()
    };
  const template = profile.externalConfigs?.template;
  return {
    slug: clone ? `${profile.slug}-copy` : profile.slug,
    description: profile.description ?? "",
    issuerType: profile.issuerType,
    caId: profile.caId ?? "",
    policyId: profile.certificatePolicyId,
    template: typeof template === "string" ? template : "",
    defaults: defaultsDraftOf(profile.defaults)
  };
};

export type PolicyConstraints = {
  keyUsages: string[];
  extendedKeyUsages: string[];
  requiredKeyUsages: string[];
  requiredExtendedKeyUsages: string[];
  signatureAlgorithms: { value: string; label: string }[];
  keyAlgorithms: { value: string; label: string }[];
  subjectTypes: SubjectType[];
  sanTypes: SanType[];
  customExtensions: { oid: string; label?: string; critical?: Criticality }[] | null;
  allowsCA: boolean;
};

const unique = <T>(values: T[]) => [...new Set(values)];

export const policyConstraintsOf = (policy: TCertificatePolicy): PolicyConstraints => {
  const isCA = policy.basicConstraints?.isCA ?? "denied";
  return {
    keyUsages: policy.keyUsages
      ? [...(policy.keyUsages.required ?? []), ...(policy.keyUsages.allowed ?? [])]
      : KEY_USAGES_OPTIONS.map((option) => option.value),
    extendedKeyUsages: policy.extendedKeyUsages
      ? [...(policy.extendedKeyUsages.required ?? []), ...(policy.extendedKeyUsages.allowed ?? [])]
      : EXTENDED_KEY_USAGES_OPTIONS.map((option) => option.value),
    requiredKeyUsages: policy.keyUsages?.required ?? [],
    requiredExtendedKeyUsages: policy.extendedKeyUsages?.required ?? [],
    signatureAlgorithms: policy.algorithms?.signature?.length
      ? policy.algorithms.signature.map((algorithm) => {
          const value = signatureToApi(algorithm);
          return { value, label: value };
        })
      : SIGNATURE_ALGORITHMS_OPTIONS.map((option) => ({
          value: option.value as string,
          label: option.label
        })),
    keyAlgorithms: policy.algorithms?.keyAlgorithm?.length
      ? policy.algorithms.keyAlgorithm.map((algorithm) => {
          const value = keyToApi(algorithm);
          return { value, label: value };
        })
      : certKeyAlgorithms.map((option) => ({ value: option.value as string, label: option.label })),
    subjectTypes: policy.subject
      ? unique(policy.subject.map((rule) => rule.type as SubjectType))
      : SUBJECT_TYPES,
    sanTypes: policy.sans ? unique(policy.sans.map((rule) => rule.type as SanType)) : SAN_TYPES,
    customExtensions: policy.customExtensions
      ? policy.customExtensions
          .filter((rule) => rule.oid)
          .map((rule) => ({
            oid: rule.oid,
            label: rule.label ?? undefined,
            critical: (rule.critical ?? undefined) as Criticality | undefined
          }))
      : null,
    allowsCA: isCA === "allowed" || isCA === "required"
  };
};

export const defaultsToApi = (
  defaults: ProfileDefaultsDraft,
  {
    constraints,
    externalAdcs,
    customExtensions,
    fixedTtlDays,
    signatureAlgorithm
  }: {
    constraints?: PolicyConstraints;
    externalAdcs: boolean;
    customExtensions: boolean;
    fixedTtlDays?: number;
    signatureAlgorithm: string;
  }
): TCertificateProfileDefaults | null => {
  const result: TCertificateProfileDefaults = {};
  const ttl = fixedTtlDays ?? Number.parseInt(defaults.ttlDays, 10);
  if (!externalAdcs && ttl > 0) result.ttlDays = ttl;
  if (!externalAdcs && signatureAlgorithm) result.signatureAlgorithm = signatureAlgorithm;
  if (defaults.keyAlgorithm) result.keyAlgorithm = defaults.keyAlgorithm;
  if (!externalAdcs) {
    const requiredKeyUsages = constraints?.requiredKeyUsages ?? [];
    const requiredExtended = constraints?.requiredExtendedKeyUsages ?? [];
    if (defaults.keyUsages || requiredKeyUsages.length)
      result.keyUsages = unique([...(defaults.keyUsages ?? []), ...requiredKeyUsages]);
    if (defaults.extendedKeyUsages || requiredExtended.length)
      result.extendedKeyUsages = unique([
        ...(defaults.extendedKeyUsages ?? []),
        ...requiredExtended
      ]);
  }
  const domainComponents: string[] = [];
  defaults.subjectAttributes.forEach(({ type, value }) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    if (type === "domain_component") {
      domainComponents.push(trimmed);
      return;
    }
    const field = SUBJECT_FIELDS.find(([entry]) => entry === type)?.[1];
    if (field) Object.assign(result, { [field]: trimmed });
  });
  if (domainComponents.length) result.domainComponents = domainComponents;
  const sans = defaults.sans
    .filter((san) => san.value.trim())
    .map((san) => ({ type: san.type, value: san.value.trim() }));
  if (sans.length) result.subjectAltNames = sans;
  if (customExtensions) {
    const declared = defaults.customExtensions
      .filter((extension) => extension.oid.trim())
      .map((extension) => ({
        oid: extension.oid.trim(),
        ...(extension.label?.trim() && { label: extension.label.trim() }),
        critical: extension.critical,
        ...(extension.value.trim() && { value: extension.value.trim() })
      }));
    if (declared.length) result.customExtensions = declared;
  }
  if (!externalAdcs && defaults.isCA) {
    const pathLength = Number.parseInt(defaults.pathLength, 10);
    result.basicConstraints = {
      isCA: true,
      ...(pathLength >= 0 && { pathLength })
    };
  }
  return Object.keys(result).length ? result : null;
};
