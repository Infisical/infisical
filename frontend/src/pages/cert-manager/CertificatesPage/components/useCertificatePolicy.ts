import { useEffect, useMemo, useState } from "react";
import { UseFormSetValue, UseFormWatch } from "react-hook-form";

import {
  EXTENDED_KEY_USAGES_OPTIONS,
  KEY_USAGES_OPTIONS
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
    return KEY_USAGES_OPTIONS.filter(({ value }) => constraints.allowedKeyUsages.includes(value));
  }, [constraints.allowedKeyUsages]);

  const filteredExtendedKeyUsages = useMemo(() => {
    return EXTENDED_KEY_USAGES_OPTIONS.filter(({ value }) =>
      constraints.allowedExtendedKeyUsages.includes(value)
    );
  }, [constraints.allowedExtendedKeyUsages]);

  const availableSignatureAlgorithms = useMemo(() => {
    return constraints.allowedSignatureAlgorithms.map((templateAlgorithm) => {
      const apiAlgorithm = mapPolicySignatureAlgorithmToApi(templateAlgorithm);
      return {
        value: apiAlgorithm,
        label: apiAlgorithm
      };
    });
  }, [constraints.allowedSignatureAlgorithms]);

  const availableKeyAlgorithms = useMemo(() => {
    return constraints.allowedKeyAlgorithms.map((templateAlgorithm) => {
      const apiAlgorithm = mapPolicyKeyAlgorithmToApi(templateAlgorithm);
      return {
        value: apiAlgorithm,
        label: apiAlgorithm
      };
    });
  }, [constraints.allowedKeyAlgorithms]);

  const resetConstraints = () => {
    setConstraints({
      allowedKeyUsages: [],
      allowedExtendedKeyUsages: [],
      requiredKeyUsages: [],
      requiredExtendedKeyUsages: [],
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

  useEffect(() => {
    if (templateData && selectedProfile && isModalOpen) {
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
        allowedSanTypes: [],
        allowedSubjectAttributeTypes: [],
        shouldShowSanSection: true,
        shouldShowSubjectSection: true,
        templateAllowsCA,
        templateRequiresCA,
        maxPathLength
      };

      // Set TTL: use min(profile.defaultTtlDays, policy.maxValidity)
      const profileTtlDays = selectedProfile?.defaultTtlDays;
      const policyMaxValidity = templateData.validity?.max;

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

      // Handle SAN types
      if (templateData.sans && templateData.sans.length > 0) {
        const sanTypes: CertSubjectAlternativeNameType[] = [];
        templateData.sans.forEach((sanPolicy: any) => {
          if (!sanTypes.includes(sanPolicy.type)) {
            sanTypes.push(sanPolicy.type);
          }
        });
        newConstraints.allowedSanTypes = sanTypes;
        newConstraints.shouldShowSanSection = true;
      } else {
        newConstraints.allowedSanTypes = [];
        newConstraints.shouldShowSanSection = false;
        setValue("subjectAltNames", []);
      }

      if (templateData.subject && templateData.subject.length > 0) {
        newConstraints.shouldShowSubjectSection = true;
        const subjectTypes: CertSubjectAttributeType[] = [];
        templateData.subject.forEach((subjectPolicy: any) => {
          if (!subjectTypes.includes(subjectPolicy.type)) {
            subjectTypes.push(subjectPolicy.type as CertSubjectAttributeType);
          }
        });
        newConstraints.allowedSubjectAttributeTypes =
          subjectTypes.length > 0 ? subjectTypes : [CertSubjectAttributeType.COMMON_NAME];

        const currentSubjectAttrs = watch("subjectAttributes");
        if (!currentSubjectAttrs || currentSubjectAttrs.length === 0) {
          const defaultType = newConstraints.allowedSubjectAttributeTypes[0];
          setValue("subjectAttributes", [{ type: defaultType, value: "" }]);
        }
      } else {
        newConstraints.shouldShowSubjectSection = false;
        newConstraints.allowedSubjectAttributeTypes = [];
        setValue("subjectAttributes", undefined);
      }

      setConstraints(newConstraints);

      // Set initial required usages
      const initialKeyUsages: Record<string, boolean> = {};
      const initialExtendedKeyUsages: Record<string, boolean> = {};

      (templateData.keyUsages?.required || []).forEach((usage: string) => {
        initialKeyUsages[usage] = true;
      });

      (templateData.extendedKeyUsages?.required || []).forEach((usage: string) => {
        initialExtendedKeyUsages[usage] = true;
      });

      setValue("keyUsages", initialKeyUsages);
      setValue("extendedKeyUsages", initialExtendedKeyUsages);

      if (templateRequiresCA) {
        setValue("basicConstraints.isCA", true);
      }
    }
  }, [templateData, selectedProfile, setValue, watch, isModalOpen]);

  return {
    constraints,
    filteredKeyUsages,
    filteredExtendedKeyUsages,
    availableSignatureAlgorithms,
    availableKeyAlgorithms,
    resetConstraints
  };
};
