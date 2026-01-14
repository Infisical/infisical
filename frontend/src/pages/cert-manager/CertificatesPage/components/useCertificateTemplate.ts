import { useEffect, useMemo, useState } from "react";
import { UseFormSetValue, UseFormWatch } from "react-hook-form";

import {
  EXTENDED_KEY_USAGES_OPTIONS,
  KEY_USAGES_OPTIONS
} from "@app/hooks/api/certificates/constants";
import {
  CertSubjectAlternativeNameType,
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

export type TemplateConstraints = {
  allowedKeyUsages: string[];
  allowedExtendedKeyUsages: string[];
  requiredKeyUsages: string[];
  requiredExtendedKeyUsages: string[];
  allowedSignatureAlgorithms: string[];
  allowedKeyAlgorithms: string[];
  allowedSanTypes: CertSubjectAlternativeNameType[];
  shouldShowSanSection: boolean;
  shouldShowSubjectSection: boolean;
};

export const useCertificateTemplate = (
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
    shouldShowSanSection: true,
    shouldShowSubjectSection: true
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
      shouldShowSanSection: true,
      shouldShowSubjectSection: true
    });
  };

  useEffect(() => {
    if (templateData && selectedProfile && isModalOpen) {
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
        shouldShowSanSection: true,
        shouldShowSubjectSection: true
      };

      // Set TTL if available
      if (templateData.validity?.max) {
        setValue("ttl", convertTemplateTtlToCertificateTtl(templateData.validity.max));
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

      // Handle subject section
      if (templateData.subject && templateData.subject.length > 0) {
        newConstraints.shouldShowSubjectSection = true;
        const currentSubjectAttrs = watch("subjectAttributes");
        if (!currentSubjectAttrs || currentSubjectAttrs.length === 0) {
          setValue("subjectAttributes", [{ type: "common_name", value: "" }]);
        }
      } else {
        newConstraints.shouldShowSubjectSection = false;
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
