import { useEffect, useMemo, useRef, useState } from "react";
import { UseFormSetValue, UseFormWatch } from "react-hook-form";

import {
  certKeyAlgorithms,
  EXTENDED_KEY_USAGES_OPTIONS,
  getCaSignatureIncompatibilityReason,
  KEY_USAGES_OPTIONS,
  SIGNATURE_ALGORITHMS_OPTIONS
} from "@app/hooks/api/certificates/constants";
import {
  CertPolicyState,
  CertSubjectAlternativeNameType,
  CertSubjectAttributeType,
  mapPolicyKeyAlgorithmToApi,
  mapPolicySignatureAlgorithmToApi
} from "@app/pages/cert-manager/PoliciesPage/components/CertificatePoliciesTab/shared/certificate-constants";

import { buildPolicyRules, withRequiredRows } from "./certificatePolicyGuidance";
import { SubjectAltName, SubjectAttribute } from "./certificateUtils";

const convertTemplateTtlToCertificateTtl = (templateTtl: string): string => {
  const match = templateTtl.match(/^(\d+)([dmyh])$/);
  if (!match) return templateTtl;

  const [, value, unit] = match;
  const numValue = parseInt(value, 10);

  switch (unit) {
    case "m":
      return `${numValue * 30}d`;
    case "y":
      return `${numValue * 365}d`;
    case "d":
    case "h":
      return templateTtl;
    default:
      return templateTtl;
  }
};

type PolicyRow = { type: string; value: string };

const isSameRows = (current: PolicyRow[] | undefined, next: PolicyRow[]): boolean =>
  Boolean(current) &&
  current!.length === next.length &&
  current!.every((row, index) => row.type === next[index].type && row.value === next[index].value);

const parseTtlToMs = (ttl: string): number => {
  const match = ttl.match(/^(\d+)([dhmy])$/);
  if (!match) return 0;
  const value = parseInt(match[1], 10);
  const msPerDay = 24 * 60 * 60 * 1000;
  switch (match[2]) {
    case "h":
      return value * 60 * 60 * 1000;
    case "d":
      return value * msPerDay;
    case "m":
      return value * 30 * msPerDay;
    case "y":
      return value * 365 * msPerDay;
    default:
      return 0;
  }
};

export type TemplateConstraints = {
  allowedKeyUsages: string[];
  allowedExtendedKeyUsages: string[];
  requiredKeyUsages: string[];
  requiredExtendedKeyUsages: string[];
  restrictKeyUsages: boolean;
  restrictExtendedKeyUsages: boolean;
  allowedSignatureAlgorithms: string[];
  allowedKeyAlgorithms: string[];
  allowedSanTypes: CertSubjectAlternativeNameType[];
  allowedSubjectAttributeTypes: CertSubjectAttributeType[];
  shouldShowSanSection: boolean;
  shouldShowSubjectSection: boolean;
  templateAllowsCA: boolean;
  templateRequiresCA: boolean;
  maxPathLength?: number;
};

export const DEFAULT_TEMPLATE_CONSTRAINTS: TemplateConstraints = {
  allowedKeyUsages: [],
  allowedExtendedKeyUsages: [],
  requiredKeyUsages: [],
  requiredExtendedKeyUsages: [],
  restrictKeyUsages: false,
  restrictExtendedKeyUsages: false,
  allowedSignatureAlgorithms: [],
  allowedKeyAlgorithms: [],
  allowedSanTypes: [
    CertSubjectAlternativeNameType.DNS_NAME,
    CertSubjectAlternativeNameType.IP_ADDRESS,
    CertSubjectAlternativeNameType.EMAIL,
    CertSubjectAlternativeNameType.URI
  ],
  allowedSubjectAttributeTypes: [CertSubjectAttributeType.COMMON_NAME],
  shouldShowSanSection: true,
  shouldShowSubjectSection: true,
  templateAllowsCA: false,
  templateRequiresCA: false,
  maxPathLength: undefined
};

export const deriveTemplateConstraints = (templateData: any): TemplateConstraints => {
  const isCaPolicy =
    (templateData.basicConstraints?.isCA as CertPolicyState) || CertPolicyState.DENIED;
  const templateAllowsCA =
    isCaPolicy === CertPolicyState.ALLOWED || isCaPolicy === CertPolicyState.REQUIRED;

  const sanTypes: CertSubjectAlternativeNameType[] = templateData.sans
    ? Array.from(
        new Set<CertSubjectAlternativeNameType>(
          templateData.sans.map(
            (sanPolicy: any) => sanPolicy.type as CertSubjectAlternativeNameType
          )
        )
      )
    : [...DEFAULT_TEMPLATE_CONSTRAINTS.allowedSanTypes];
  const subjectAttributeTypes: CertSubjectAttributeType[] = templateData.subject
    ? Array.from(
        new Set<CertSubjectAttributeType>(
          templateData.subject.map(
            (subjectPolicy: any) => subjectPolicy.type as CertSubjectAttributeType
          )
        )
      )
    : [
        CertSubjectAttributeType.COMMON_NAME,
        CertSubjectAttributeType.ORGANIZATION,
        CertSubjectAttributeType.ORGANIZATIONAL_UNIT,
        CertSubjectAttributeType.COUNTRY,
        CertSubjectAttributeType.STATE,
        CertSubjectAttributeType.LOCALITY,
        CertSubjectAttributeType.DOMAIN_COMPONENT
      ];

  const constraints: TemplateConstraints = {
    allowedSignatureAlgorithms: templateData.algorithms?.signature || [],
    allowedKeyAlgorithms: templateData.algorithms?.keyAlgorithm || [],
    allowedKeyUsages: [
      ...(templateData.keyUsages?.required || []),
      ...(templateData.keyUsages?.allowed || [])
    ],
    allowedExtendedKeyUsages: [
      ...(templateData.extendedKeyUsages?.required || []),
      ...(templateData.extendedKeyUsages?.allowed || [])
    ],
    requiredKeyUsages: templateData.keyUsages?.required || [],
    requiredExtendedKeyUsages: templateData.extendedKeyUsages?.required || [],
    restrictKeyUsages: Boolean(templateData.keyUsages),
    restrictExtendedKeyUsages: Boolean(templateData.extendedKeyUsages),
    allowedSanTypes: sanTypes,
    allowedSubjectAttributeTypes: subjectAttributeTypes,
    shouldShowSanSection: sanTypes.length > 0,
    shouldShowSubjectSection: subjectAttributeTypes.length > 0,
    templateAllowsCA,
    templateRequiresCA: isCaPolicy === CertPolicyState.REQUIRED,
    maxPathLength: templateData.basicConstraints?.maxPathLength
  };

  return constraints;
};

export const useCertificatePolicyOptions = (constraints: TemplateConstraints) => {
  const filteredKeyUsages = useMemo(() => {
    if (!constraints.restrictKeyUsages) return [...KEY_USAGES_OPTIONS];
    return KEY_USAGES_OPTIONS.filter(({ value }) => constraints.allowedKeyUsages.includes(value));
  }, [constraints.allowedKeyUsages, constraints.restrictKeyUsages]);

  const filteredExtendedKeyUsages = useMemo(() => {
    if (!constraints.restrictExtendedKeyUsages) return [...EXTENDED_KEY_USAGES_OPTIONS];
    return EXTENDED_KEY_USAGES_OPTIONS.filter(({ value }) =>
      constraints.allowedExtendedKeyUsages.includes(value)
    );
  }, [constraints.allowedExtendedKeyUsages, constraints.restrictExtendedKeyUsages]);

  const availableSignatureAlgorithms = useMemo(() => {
    if (constraints.allowedSignatureAlgorithms.length === 0) {
      return SIGNATURE_ALGORITHMS_OPTIONS.map((opt) => ({
        value: opt.value as string,
        label: opt.label
      }));
    }
    const allowed = new Set(
      constraints.allowedSignatureAlgorithms.map(mapPolicySignatureAlgorithmToApi)
    );
    return SIGNATURE_ALGORITHMS_OPTIONS.filter((opt) => allowed.has(opt.value)).map((opt) => ({
      value: opt.value as string,
      label: opt.label
    }));
  }, [constraints.allowedSignatureAlgorithms]);

  const availableKeyAlgorithms = useMemo(() => {
    if (constraints.allowedKeyAlgorithms.length === 0) {
      return certKeyAlgorithms.map((opt) => ({ value: opt.value as string, label: opt.label }));
    }
    const allowed = new Set(constraints.allowedKeyAlgorithms.map(mapPolicyKeyAlgorithmToApi));
    return certKeyAlgorithms
      .filter((opt) => allowed.has(opt.value))
      .map((opt) => ({ value: opt.value as string, label: opt.label }));
  }, [constraints.allowedKeyAlgorithms]);

  return {
    filteredKeyUsages,
    filteredExtendedKeyUsages,
    availableSignatureAlgorithms,
    availableKeyAlgorithms
  };
};

export const useCertificatePolicy = (
  templateData: any,
  selectedProfile: any,
  isModalOpen: boolean,
  setValue: UseFormSetValue<any>,
  watch: UseFormWatch<any>
) => {
  const [constraints, setConstraints] = useState<TemplateConstraints>(DEFAULT_TEMPLATE_CONSTRAINTS);

  const {
    filteredKeyUsages,
    filteredExtendedKeyUsages,
    availableSignatureAlgorithms,
    availableKeyAlgorithms
  } = useCertificatePolicyOptions(constraints);

  const resetConstraints = () => {
    setConstraints(DEFAULT_TEMPLATE_CONSTRAINTS);
  };

  const prevProfileIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (templateData && selectedProfile && isModalOpen) {
      const profileChanged = prevProfileIdRef.current !== selectedProfile.id;
      prevProfileIdRef.current = selectedProfile.id;

      const newConstraints = deriveTemplateConstraints(templateData);
      const { templateRequiresCA } = newConstraints;

      // Pre-populate from profile defaults
      const defaults = selectedProfile?.defaults;
      const profileTtlDays = defaults?.ttlDays;
      const policyMaxValidity = templateData.validity?.max;

      // Set TTL: use min(profile.defaults.ttlDays, policy.maxValidity)
      if (profileTtlDays && policyMaxValidity) {
        const profileTtlMs = profileTtlDays * 24 * 60 * 60 * 1000;
        const policyMaxMs = parseTtlToMs(policyMaxValidity);
        const ttl = profileTtlMs <= policyMaxMs ? `${profileTtlDays}d` : policyMaxValidity;
        setValue("ttl", convertTemplateTtlToCertificateTtl(ttl));
      } else if (profileTtlDays) {
        setValue("ttl", `${profileTtlDays}d`);
      } else if (policyMaxValidity) {
        setValue("ttl", convertTemplateTtlToCertificateTtl(policyMaxValidity));
      }

      // Set basic constraints defaults
      if (defaults?.basicConstraints) {
        setValue("basicConstraints.isCA", defaults.basicConstraints.isCA);
        if (defaults.basicConstraints.pathLength !== undefined) {
          setValue("basicConstraints.pathLength", defaults.basicConstraints.pathLength);
        }
      }

      // Pre-populate subject attributes from profile defaults
      const defaultSubjectAttrs: Array<{ type: CertSubjectAttributeType; value: string }> = [];
      if (defaults?.commonName) {
        defaultSubjectAttrs.push({
          type: CertSubjectAttributeType.COMMON_NAME,
          value: defaults.commonName
        });
      }
      if (defaults?.organization) {
        defaultSubjectAttrs.push({
          type: CertSubjectAttributeType.ORGANIZATION,
          value: defaults.organization
        });
      }
      if (defaults?.organizationalUnit) {
        defaultSubjectAttrs.push({
          type: CertSubjectAttributeType.ORGANIZATIONAL_UNIT,
          value: defaults.organizationalUnit
        });
      }
      if (defaults?.country) {
        defaultSubjectAttrs.push({
          type: CertSubjectAttributeType.COUNTRY,
          value: defaults.country
        });
      }
      if (defaults?.state) {
        defaultSubjectAttrs.push({
          type: CertSubjectAttributeType.STATE,
          value: defaults.state
        });
      }
      if (defaults?.locality) {
        defaultSubjectAttrs.push({
          type: CertSubjectAttributeType.LOCALITY,
          value: defaults.locality
        });
      }
      // Domain components are multi-valued: prefill one row per default value.
      if (defaults?.domainComponents) {
        defaults.domainComponents.forEach((dc: string) => {
          defaultSubjectAttrs.push({
            type: CertSubjectAttributeType.DOMAIN_COMPONENT,
            value: dc
          });
        });
      }

      // Pre-populate SANs from profile defaults or reset when profile changes
      let nextSans: SubjectAltName[] = watch("subjectAltNames") ?? [];
      if (profileChanged) {
        if (
          defaults?.subjectAltNames &&
          Array.isArray(defaults.subjectAltNames) &&
          defaults.subjectAltNames.length > 0
        ) {
          // Filter to only allowed SAN types
          nextSans = defaults.subjectAltNames.filter((san: SubjectAltName) =>
            newConstraints.allowedSanTypes.includes(san.type)
          );
        } else {
          nextSans = [];
        }
      }

      const currentSubjectAttrs = watch("subjectAttributes");
      let nextSubjectAttrs: SubjectAttribute[] = currentSubjectAttrs ?? [];
      if (profileChanged || !currentSubjectAttrs || currentSubjectAttrs.length === 0) {
        if (newConstraints.allowedSubjectAttributeTypes.length === 0) {
          nextSubjectAttrs = [];
        } else if (defaultSubjectAttrs.length > 0) {
          // Filter to only allowed attribute types
          const filteredDefaults = defaultSubjectAttrs.filter((attr) =>
            newConstraints.allowedSubjectAttributeTypes.includes(attr.type)
          );
          nextSubjectAttrs =
            filteredDefaults.length > 0
              ? filteredDefaults
              : [{ type: newConstraints.allowedSubjectAttributeTypes[0], value: "" }];
        } else {
          nextSubjectAttrs = [{ type: newConstraints.allowedSubjectAttributeTypes[0], value: "" }];
        }
      }

      // Seed the rows the policy requires so they are visible as fields from the start. Writing an
      // identical value would still hand the form a new array, and the guidance hook reads those
      // identities as an edit and clears the findings the requester is looking at.
      const seeded = withRequiredRows(buildPolicyRules(templateData), nextSubjectAttrs, nextSans);
      if (!isSameRows(watch("subjectAltNames"), seeded.subjectAltNames)) {
        setValue("subjectAltNames", seeded.subjectAltNames);
      }
      if (!isSameRows(currentSubjectAttrs, seeded.subjectAttributes)) {
        setValue("subjectAttributes", seeded.subjectAttributes);
      }

      // Set isCA if template requires it
      if (templateRequiresCA) {
        setValue("basicConstraints.isCA", true);
      }

      setConstraints(newConstraints);

      // Set initial usages: merge required usages with profile defaults
      const initialKeyUsages: Record<string, boolean> = {};
      const initialExtendedKeyUsages: Record<string, boolean> = {};

      // Start with profile default key usages
      if (defaults?.keyUsages) {
        defaults.keyUsages.forEach((usage: string) => {
          initialKeyUsages[usage] = true;
        });
      }

      // Required usages always override (ensure they're checked)
      (templateData.keyUsages?.required || []).forEach((usage: string) => {
        initialKeyUsages[usage] = true;
      });

      // Start with profile default extended key usages
      if (defaults?.extendedKeyUsages) {
        defaults.extendedKeyUsages.forEach((usage: string) => {
          initialExtendedKeyUsages[usage] = true;
        });
      }

      // Required extended key usages always override
      (templateData.extendedKeyUsages?.required || []).forEach((usage: string) => {
        initialExtendedKeyUsages[usage] = true;
      });

      setValue("keyUsages", initialKeyUsages);
      setValue("extendedKeyUsages", initialExtendedKeyUsages);
    }
  }, [templateData, selectedProfile, setValue, watch, isModalOpen]);

  const caKeyAlgorithm = selectedProfile?.certificateAuthority?.keyAlgorithm as
    | string
    | null
    | undefined;
  const selectedSignatureAlgorithm = watch("signatureAlgorithm") as string | undefined;

  // The issuing CA can only sign with its own key family, so a selection carried over from a
  // previously selected profile has to go rather than fail validation at issuance.
  useEffect(() => {
    if (!isModalOpen || !selectedSignatureAlgorithm) return;
    if (getCaSignatureIncompatibilityReason(selectedSignatureAlgorithm, caKeyAlgorithm)) {
      setValue("signatureAlgorithm", "");
    }
  }, [isModalOpen, selectedSignatureAlgorithm, caKeyAlgorithm, setValue]);

  useEffect(() => {
    if (!isModalOpen || !selectedProfile) return;
    const defaults = selectedProfile?.defaults;
    if (!defaults) return;

    if (
      defaults.signatureAlgorithm &&
      availableSignatureAlgorithms.some((opt) => opt.value === defaults.signatureAlgorithm) &&
      !getCaSignatureIncompatibilityReason(defaults.signatureAlgorithm, caKeyAlgorithm)
    ) {
      setValue("signatureAlgorithm", defaults.signatureAlgorithm);
    }
    if (
      defaults.keyAlgorithm &&
      availableKeyAlgorithms.some((opt) => opt.value === defaults.keyAlgorithm)
    ) {
      setValue("keyAlgorithm", defaults.keyAlgorithm);
    }
  }, [
    isModalOpen,
    selectedProfile,
    availableSignatureAlgorithms,
    availableKeyAlgorithms,
    caKeyAlgorithm,
    setValue
  ]);

  return {
    constraints,
    filteredKeyUsages,
    filteredExtendedKeyUsages,
    availableSignatureAlgorithms,
    availableKeyAlgorithms,
    resetConstraints
  };
};
