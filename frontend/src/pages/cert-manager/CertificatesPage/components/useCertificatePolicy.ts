import { useEffect, useMemo, useRef, useState } from "react";
import { UseFormSetValue, UseFormWatch } from "react-hook-form";

import {
  certKeyAlgorithms,
  EXTENDED_KEY_USAGES_OPTIONS,
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

export const useCertificatePolicy = (
  templateData: any,
  selectedProfile: any,
  isModalOpen: boolean,
  setValue: UseFormSetValue<any>,
  watch: UseFormWatch<any>
) => {
  const [constraints, setConstraints] = useState<TemplateConstraints>({
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
  });

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

  const resetConstraints = () => {
    setConstraints({
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
    });
  };

  const prevProfileIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (templateData && selectedProfile && isModalOpen) {
      const profileChanged = prevProfileIdRef.current !== selectedProfile.id;
      prevProfileIdRef.current = selectedProfile.id;

      // CA issuance is a privilege boundary: an undefined basicConstraints policy denies CA by default
      const isCaPolicy =
        (templateData.basicConstraints?.isCA as CertPolicyState) || CertPolicyState.DENIED;
      const templateAllowsCA =
        isCaPolicy === CertPolicyState.ALLOWED || isCaPolicy === CertPolicyState.REQUIRED;
      const templateRequiresCA = isCaPolicy === CertPolicyState.REQUIRED;
      const maxPathLength = templateData.basicConstraints?.maxPathLength;

      const newConstraints: TemplateConstraints = {
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
        allowedSanTypes: [],
        allowedSubjectAttributeTypes: [],
        shouldShowSanSection: true,
        shouldShowSubjectSection: true,
        templateAllowsCA,
        templateRequiresCA,
        maxPathLength
      };

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

      // Handle SAN types. An undefined SAN policy allows every SAN type (allow all).
      // A defined SAN policy constrains to exactly its listed types — an empty
      // array means no SAN is allowed. Only an undefined policy allows all SAN types.
      if (templateData.sans) {
        const sanTypes: CertSubjectAlternativeNameType[] = [];
        templateData.sans.forEach((sanPolicy: any) => {
          if (!sanTypes.includes(sanPolicy.type)) {
            sanTypes.push(sanPolicy.type);
          }
        });
        newConstraints.allowedSanTypes = sanTypes;
        newConstraints.shouldShowSanSection = sanTypes.length > 0;
      } else {
        newConstraints.allowedSanTypes = [
          CertSubjectAlternativeNameType.DNS_NAME,
          CertSubjectAlternativeNameType.IP_ADDRESS,
          CertSubjectAlternativeNameType.EMAIL,
          CertSubjectAlternativeNameType.URI
        ];
        newConstraints.shouldShowSanSection = true;
      }

      // A defined subject policy constrains to exactly its listed types — an
      // empty array means no subject attribute is allowed. Only an undefined policy allows all.
      if (templateData.subject) {
        const subjectTypes: CertSubjectAttributeType[] = [];
        templateData.subject.forEach((subjectPolicy: any) => {
          if (!subjectTypes.includes(subjectPolicy.type)) {
            subjectTypes.push(subjectPolicy.type as CertSubjectAttributeType);
          }
        });
        newConstraints.allowedSubjectAttributeTypes = subjectTypes;
        newConstraints.shouldShowSubjectSection = subjectTypes.length > 0;
      } else {
        newConstraints.shouldShowSubjectSection = true;
        // No subject policy allows every subject attribute type (allow all)
        newConstraints.allowedSubjectAttributeTypes = [
          CertSubjectAttributeType.COMMON_NAME,
          CertSubjectAttributeType.ORGANIZATION,
          CertSubjectAttributeType.ORGANIZATIONAL_UNIT,
          CertSubjectAttributeType.COUNTRY,
          CertSubjectAttributeType.STATE,
          CertSubjectAttributeType.LOCALITY,
          CertSubjectAttributeType.DOMAIN_COMPONENT
        ];
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

      // Switching profiles resets SAN entries so a previous profile's values don't carry over.
      if (profileChanged) {
        setValue("subjectAltNames", []);
      }

      const currentSubjectAttrs = watch("subjectAttributes");
      if (profileChanged || !currentSubjectAttrs || currentSubjectAttrs.length === 0) {
        if (newConstraints.allowedSubjectAttributeTypes.length === 0) {
          setValue("subjectAttributes", []);
        } else if (defaultSubjectAttrs.length > 0) {
          // Filter to only allowed attribute types
          const filteredDefaults = defaultSubjectAttrs.filter((attr) =>
            newConstraints.allowedSubjectAttributeTypes.includes(attr.type)
          );
          const subjectValue =
            filteredDefaults.length > 0
              ? filteredDefaults
              : [{ type: newConstraints.allowedSubjectAttributeTypes[0], value: "" }];
          setValue("subjectAttributes", subjectValue);
        } else {
          const defaultType = newConstraints.allowedSubjectAttributeTypes[0];
          setValue("subjectAttributes", [{ type: defaultType, value: "" }]);
        }
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

  useEffect(() => {
    if (!isModalOpen || !selectedProfile) return;
    const defaults = selectedProfile?.defaults;
    if (!defaults) return;

    if (
      defaults.signatureAlgorithm &&
      availableSignatureAlgorithms.some((opt) => opt.value === defaults.signatureAlgorithm)
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
