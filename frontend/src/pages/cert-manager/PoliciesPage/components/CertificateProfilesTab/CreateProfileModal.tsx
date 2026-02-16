import { useEffect, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { SingleValue } from "react-select";
import { faQuestionCircle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Tab } from "@headlessui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Button,
  Checkbox,
  EmptyState,
  FilterableSelect,
  FormControl,
  FormLabel,
  Input,
  Modal,
  ModalContent,
  Select,
  SelectItem,
  TextArea,
  Tooltip
} from "@app/components/v2";
import { useProject, useProjectPermission } from "@app/context";
import {
  ProjectPermissionCertificatePolicyActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import { usePopUp } from "@app/hooks";
import { CaType } from "@app/hooks/api/ca/enums";
import { useGetAzureAdcsTemplates, useListCasByProjectId } from "@app/hooks/api/ca/queries";
import {
  TCertificatePolicy,
  useGetCertificatePolicyById,
  useListCertificatePolicies
} from "@app/hooks/api/certificatePolicies";
import {
  EnrollmentType,
  IssuerType,
  TCertificateProfileDefaults,
  TCertificateProfileWithDetails,
  TCreateCertificateProfileDTO,
  TUpdateCertificateProfileDTO,
  useCreateCertificateProfile,
  useUpdateCertificateProfile
} from "@app/hooks/api/certificateProfiles";
import {
  EXTENDED_KEY_USAGES_OPTIONS,
  KEY_USAGES_OPTIONS
} from "@app/hooks/api/certificates/constants";
import { AlgorithmSelectors } from "@app/pages/cert-manager/CertificatesPage/components/AlgorithmSelectors";
import { filterUsages } from "@app/pages/cert-manager/CertificatesPage/components/certificateUtils";
import { KeyUsageSection } from "@app/pages/cert-manager/CertificatesPage/components/KeyUsageSection";
import { SubjectAttributesField } from "@app/pages/cert-manager/CertificatesPage/components/SubjectAttributesField";
import {
  CertPolicyState,
  CertSubjectAttributeType,
  mapPolicyKeyAlgorithmToApi,
  mapPolicySignatureAlgorithmToApi
} from "@app/pages/cert-manager/PoliciesPage/components/CertificatePoliciesTab/shared/certificate-constants";

import { CreatePolicyModal } from "../CertificatePoliciesTab/CreatePolicyModal";
import { CertificatePolicyOption } from "./CertificatePolicyOption";

const certificateDefaultsSchema = z
  .object({
    ttlDays: z.number().min(1).nullable().optional(),
    subjectAttributes: z
      .array(
        z.object({
          type: z.nativeEnum(CertSubjectAttributeType),
          value: z.string().min(1, "Value is required")
        })
      )
      .optional(),
    signatureAlgorithm: z.string().nullable().optional(),
    keyAlgorithm: z.string().nullable().optional(),
    keyUsages: z.record(z.boolean().optional()).optional(),
    extendedKeyUsages: z.record(z.boolean().optional()).optional(),
    basicConstraints: z
      .object({
        isCA: z.boolean().default(false),
        pathLength: z.number().min(0).nullable().optional()
      })
      .nullable()
      .optional()
  })
  .optional();

const configurationFields = [
  "slug",
  "description",
  "enrollmentType",
  "issuerType",
  "certificateAuthorityId",
  "certificatePolicyId",
  "estConfig",
  "apiConfig",
  "acmeConfig",
  "externalConfigs"
] as const;

const FORM_STEPS = [
  {
    name: "Configuration",
    key: "configuration",
    fields: configurationFields as unknown as string[]
  },
  {
    name: "Certificate Defaults",
    key: "certificate-defaults",
    fields: ["defaults"] as string[]
  }
];

const createSchema = z
  .object({
    slug: z
      .string()
      .trim()
      .min(1, "Profile slug is required")
      .max(255, "Profile slug must be less than 255 characters")
      .regex(
        /^[a-zA-Z0-9-_]+$/,
        "Profile slug must contain only letters, numbers, hyphens, and underscores"
      ),
    description: z
      .string()
      .trim()
      .max(1000, "Description must be less than 1000 characters")
      .optional(),
    enrollmentType: z.nativeEnum(EnrollmentType),
    issuerType: z.nativeEnum(IssuerType),
    certificateAuthorityId: z.string().nullable().optional(),
    certificatePolicyId: z.string().min(1, "Certificate Policy is required"),
    estConfig: z
      .object({
        disableBootstrapCaValidation: z.boolean().optional(),
        passphrase: z.string().min(1, "EST passphrase is required"),
        caChain: z.string().min(1, "EST CA chain is required").optional()
      })
      .refine(
        (data) => {
          if (!data.disableBootstrapCaValidation && !data.caChain) {
            return false;
          }
          return true;
        },
        {
          message: "EST CA chain is required when bootstrap CA validation is enabled",
          path: ["caChain"]
        }
      )
      .optional(),
    apiConfig: z
      .object({
        autoRenew: z.boolean().optional(),
        renewBeforeDays: z.number().min(1).max(365).optional()
      })
      .optional(),
    acmeConfig: z
      .object({
        skipDnsOwnershipVerification: z.boolean().optional(),
        skipEabBinding: z.boolean().optional()
      })
      .optional(),
    externalConfigs: z
      .object({
        template: z.string().min(1, "Azure ADCS template is required")
      })
      .optional(),
    defaults: certificateDefaultsSchema
  })
  .refine(
    (data) => {
      if (data.enrollmentType === EnrollmentType.EST) {
        return !!data.estConfig;
      }
      return true;
    },
    {
      message: "EST enrollment type requires EST configuration"
    }
  )
  .refine(
    (data) => {
      if (data.enrollmentType === EnrollmentType.API) {
        return !!data.apiConfig;
      }
      return true;
    },
    {
      message: "API enrollment type requires API configuration"
    }
  )
  .refine(
    (data) => {
      if (data.enrollmentType === EnrollmentType.ACME) {
        return !!data.acmeConfig;
      }
      return true;
    },
    {
      message: "ACME enrollment type requires ACME configuration"
    }
  )
  .refine(
    (data) => {
      if (data.enrollmentType === EnrollmentType.EST) {
        return !data.apiConfig && !data.acmeConfig;
      }
      return true;
    },
    {
      message: "EST enrollment type cannot have API or ACME configuration"
    }
  )
  .refine(
    (data) => {
      if (data.enrollmentType === EnrollmentType.API) {
        return !data.estConfig && !data.acmeConfig;
      }
      return true;
    },
    {
      message: "API enrollment type cannot have EST or ACME configuration"
    }
  )
  .refine(
    (data) => {
      if (data.enrollmentType === EnrollmentType.ACME) {
        return !data.estConfig && !data.apiConfig;
      }
      return true;
    },
    {
      message: "ACME enrollment type cannot have EST or API configuration"
    }
  )
  .refine(
    (data) => {
      if (data.enrollmentType === EnrollmentType.ACME && data.acmeConfig) {
        return !(data.acmeConfig.skipEabBinding && data.acmeConfig.skipDnsOwnershipVerification);
      }
      return true;
    },
    {
      message: "Cannot skip both EAB and DNS ownership validation."
    }
  )
  .refine(
    (data) => {
      if (data.issuerType === IssuerType.CA) {
        return !!data.certificateAuthorityId;
      }
      return true;
    },
    {
      message: "CA issuer type requires a certificate authority"
    }
  )
  .refine(
    (data) => {
      if (data.issuerType === IssuerType.SELF_SIGNED) {
        return !data.certificateAuthorityId;
      }
      return true;
    },
    {
      message: "Self-signed issuer type cannot have a certificate authority"
    }
  )
  .refine(
    (data) => {
      if (data.issuerType === IssuerType.SELF_SIGNED) {
        return data.enrollmentType === EnrollmentType.API;
      }
      return true;
    },
    {
      message: "Self-signed issuer type only supports API enrollment"
    }
  );

const editSchema = z
  .object({
    slug: z
      .string()
      .trim()
      .min(1, "Profile slug is required")
      .max(255, "Profile slug must be less than 255 characters")
      .regex(
        /^[a-zA-Z0-9-_]+$/,
        "Profile slug must contain only letters, numbers, hyphens, and underscores"
      ),
    description: z
      .string()
      .trim()
      .max(1000, "Description must be less than 1000 characters")
      .optional(),
    enrollmentType: z.nativeEnum(EnrollmentType),
    issuerType: z.nativeEnum(IssuerType),
    certificateAuthorityId: z.string().nullable().optional(),
    certificatePolicyId: z.string().optional(),
    estConfig: z
      .object({
        disableBootstrapCaValidation: z.boolean().optional(),
        passphrase: z.string().optional(),
        caChain: z.string().optional()
      })
      .optional(),
    apiConfig: z
      .object({
        autoRenew: z.boolean().optional(),
        renewBeforeDays: z.number().min(1).max(365).optional()
      })
      .optional(),
    acmeConfig: z
      .object({
        skipDnsOwnershipVerification: z.boolean().optional(),
        skipEabBinding: z.boolean().optional()
      })
      .optional(),
    externalConfigs: z
      .object({
        template: z.string().optional()
      })
      .optional(),
    defaults: certificateDefaultsSchema
  })
  .refine(
    (data) => {
      if (data.enrollmentType === EnrollmentType.EST) {
        return !!data.estConfig;
      }
      return true;
    },
    {
      message: "EST enrollment type requires EST configuration"
    }
  )
  .refine(
    (data) => {
      if (data.enrollmentType === EnrollmentType.API) {
        return !!data.apiConfig;
      }
      return true;
    },
    {
      message: "API enrollment type requires API configuration"
    }
  )
  .refine(
    (data) => {
      if (data.enrollmentType === EnrollmentType.ACME) {
        return !!data.acmeConfig;
      }
      return true;
    },
    {
      message: "ACME enrollment type requires ACME configuration"
    }
  )
  .refine(
    (data) => {
      if (data.enrollmentType === EnrollmentType.EST) {
        return !data.apiConfig && !data.acmeConfig;
      }
      return true;
    },
    {
      message: "EST enrollment type cannot have API or ACME configuration"
    }
  )
  .refine(
    (data) => {
      if (data.enrollmentType === EnrollmentType.API) {
        return !data.estConfig && !data.acmeConfig;
      }
      return true;
    },
    {
      message: "API enrollment type cannot have EST or ACME configuration"
    }
  )
  .refine(
    (data) => {
      if (data.enrollmentType === EnrollmentType.ACME) {
        return !data.estConfig && !data.apiConfig;
      }
      return true;
    },
    {
      message: "ACME enrollment type cannot have EST or API configuration"
    }
  )
  .refine(
    (data) => {
      if (data.enrollmentType === EnrollmentType.ACME && data.acmeConfig) {
        return !(data.acmeConfig.skipEabBinding && data.acmeConfig.skipDnsOwnershipVerification);
      }
      return true;
    },
    {
      message: "Cannot skip both EAB and DNS ownership validation."
    }
  )
  .refine(
    (data) => {
      if (data.issuerType === IssuerType.CA) {
        return !!data.certificateAuthorityId;
      }
      return true;
    },
    {
      message: "CA issuer type requires a certificate authority"
    }
  )
  .refine(
    (data) => {
      if (data.issuerType === IssuerType.SELF_SIGNED) {
        return !data.certificateAuthorityId;
      }
      return true;
    },
    {
      message: "Self-signed issuer type cannot have a certificate authority"
    }
  )
  .refine(
    (data) => {
      if (data.issuerType === IssuerType.SELF_SIGNED) {
        return data.enrollmentType === EnrollmentType.API;
      }
      return true;
    },
    {
      message: "Self-signed issuer type only supports API enrollment"
    }
  );

export type FormData = z.infer<typeof createSchema>;

// Convert profile defaults from API format to form format
const convertDefaultsToForm = (
  defaults: TCertificateProfileDefaults | null | undefined
): FormData["defaults"] => {
  if (!defaults) return undefined;

  const keyUsagesRecord: Record<string, boolean> = {};
  if (defaults.keyUsages) {
    defaults.keyUsages.forEach((usage) => {
      keyUsagesRecord[usage] = true;
    });
  }

  const extKeyUsagesRecord: Record<string, boolean> = {};
  if (defaults.extendedKeyUsages) {
    defaults.extendedKeyUsages.forEach((usage) => {
      extKeyUsagesRecord[usage] = true;
    });
  }

  const subjectAttributes: Array<{ type: CertSubjectAttributeType; value: string }> = [];
  if (defaults.commonName)
    subjectAttributes.push({
      type: CertSubjectAttributeType.COMMON_NAME,
      value: defaults.commonName
    });
  if (defaults.organization)
    subjectAttributes.push({
      type: CertSubjectAttributeType.ORGANIZATION,
      value: defaults.organization
    });
  if (defaults.organizationalUnit)
    subjectAttributes.push({
      type: CertSubjectAttributeType.ORGANIZATIONAL_UNIT,
      value: defaults.organizationalUnit
    });
  if (defaults.country)
    subjectAttributes.push({ type: CertSubjectAttributeType.COUNTRY, value: defaults.country });
  if (defaults.state)
    subjectAttributes.push({ type: CertSubjectAttributeType.STATE, value: defaults.state });
  if (defaults.locality)
    subjectAttributes.push({ type: CertSubjectAttributeType.LOCALITY, value: defaults.locality });

  return {
    ttlDays: defaults.ttlDays ?? null,
    subjectAttributes: subjectAttributes.length > 0 ? subjectAttributes : undefined,
    signatureAlgorithm: defaults.signatureAlgorithm ?? null,
    keyAlgorithm: defaults.keyAlgorithm ?? null,
    keyUsages: Object.keys(keyUsagesRecord).length > 0 ? keyUsagesRecord : undefined,
    extendedKeyUsages: Object.keys(extKeyUsagesRecord).length > 0 ? extKeyUsagesRecord : undefined,
    basicConstraints: defaults.basicConstraints ?? null
  };
};

// Convert form defaults to API format
const convertFormToDefaults = (
  formDefaults: FormData["defaults"]
): TCertificateProfileDefaults | null => {
  if (!formDefaults) return null;

  const result: TCertificateProfileDefaults = {};

  if (formDefaults.ttlDays) {
    result.ttlDays = formDefaults.ttlDays;
  }

  if (formDefaults.signatureAlgorithm) {
    result.signatureAlgorithm = formDefaults.signatureAlgorithm;
  }

  if (formDefaults.keyAlgorithm) {
    result.keyAlgorithm = formDefaults.keyAlgorithm;
  }

  // Key usages: convert Record<string, boolean> → string[]
  // Empty array is meaningful (signals "no key usages")
  if (formDefaults.keyUsages) {
    result.keyUsages = filterUsages(formDefaults.keyUsages as Record<string, boolean>);
  }

  // Extended key usages: same pattern
  if (formDefaults.extendedKeyUsages) {
    result.extendedKeyUsages = filterUsages(
      formDefaults.extendedKeyUsages as Record<string, boolean>
    );
  }

  // Subject attributes → flat fields
  if (formDefaults.subjectAttributes && formDefaults.subjectAttributes.length > 0) {
    formDefaults.subjectAttributes.forEach((attr) => {
      if (!attr.value) return;
      switch (attr.type) {
        case CertSubjectAttributeType.COMMON_NAME:
          result.commonName = attr.value;
          break;
        case CertSubjectAttributeType.ORGANIZATION:
          result.organization = attr.value;
          break;
        case CertSubjectAttributeType.ORGANIZATIONAL_UNIT:
          result.organizationalUnit = attr.value;
          break;
        case CertSubjectAttributeType.COUNTRY:
          result.country = attr.value;
          break;
        case CertSubjectAttributeType.STATE:
          result.state = attr.value;
          break;
        case CertSubjectAttributeType.LOCALITY:
          result.locality = attr.value;
          break;
        default:
          break;
      }
    });
  }

  if (formDefaults.basicConstraints) {
    result.basicConstraints = {
      isCA: formDefaults.basicConstraints.isCA,
      pathLength: formDefaults.basicConstraints.pathLength ?? undefined
    };
  }

  // Return null if empty (no defaults set)
  if (Object.keys(result).length === 0) return null;

  return result;
};

interface Props {
  isOpen: boolean;
  onClose: () => void;
  profile?: TCertificateProfileWithDetails;
  mode?: "create" | "edit";
}

export const CreateProfileModal = ({ isOpen, onClose, profile, mode = "create" }: Props) => {
  const { currentProject } = useProject();
  const { permission } = useProjectPermission();
  const { popUp, handlePopUpToggle, handlePopUpOpen } = usePopUp(["createPolicy"] as const);
  const queryClient = useQueryClient();

  const [selectedStepIndex, setSelectedStepIndex] = useState(0);

  const canCreatePolicy = permission.can(
    ProjectPermissionCertificatePolicyActions.Create,
    ProjectPermissionSub.CertificatePolicies
  );

  const { data: allCaData } = useListCasByProjectId(currentProject?.id || "");
  const { data: policyData } = useListCertificatePolicies({
    projectId: currentProject?.id || "",
    limit: 100,
    offset: 0
  });

  const createProfile = useCreateCertificateProfile();
  const updateProfile = useUpdateCertificateProfile();

  const isEdit = mode === "edit" && profile;
  const isFinalStep = selectedStepIndex === FORM_STEPS.length - 1;

  const certificateAuthorities = (allCaData || []).map((ca) => ({
    ...ca,
    groupType: ca.type === "internal" ? "internal" : "external"
  }));
  const certificatePolicies = policyData?.certificatePolicies || [];

  type PolicyOption = TCertificatePolicy | { id: "_create"; name: string };

  const policyOptions: PolicyOption[] = [
    ...(canCreatePolicy && !isEdit
      ? [{ id: "_create" as const, name: "Add Certificate Policy" }]
      : []),
    ...certificatePolicies
  ];

  const getGroupHeaderLabel = (groupType: "internal" | "external") => {
    switch (groupType) {
      case "internal":
        return "Internal CAs";
      case "external":
        return "External CAs";
      default:
        return "";
    }
  };

  const { control, handleSubmit, reset, watch, setValue, trigger, formState } = useForm<FormData>({
    resolver: zodResolver(isEdit ? editSchema : createSchema),
    defaultValues: isEdit
      ? {
          slug: profile.slug,
          description: profile.description || "",
          enrollmentType: profile.enrollmentType,
          issuerType: profile.issuerType,
          certificateAuthorityId: profile.caId || undefined,
          certificatePolicyId: profile.certificatePolicyId,
          estConfig:
            profile.enrollmentType === EnrollmentType.EST
              ? {
                  disableBootstrapCaValidation:
                    profile.estConfig?.disableBootstrapCaValidation || false,
                  passphrase: profile.estConfig?.passphrase || "",
                  caChain: profile.estConfig?.caChain || ""
                }
              : undefined,
          apiConfig:
            profile.enrollmentType === EnrollmentType.API
              ? {
                  autoRenew: profile.apiConfig?.autoRenew || false,
                  renewBeforeDays: profile.apiConfig?.renewBeforeDays || 30
                }
              : undefined,
          acmeConfig:
            profile.enrollmentType === EnrollmentType.ACME
              ? {
                  skipDnsOwnershipVerification:
                    profile.acmeConfig?.skipDnsOwnershipVerification || false,
                  skipEabBinding: profile.acmeConfig?.skipEabBinding || false
                }
              : undefined,
          externalConfigs: profile.externalConfigs
            ? {
                template:
                  typeof profile.externalConfigs === "object" &&
                  profile.externalConfigs !== null &&
                  typeof profile.externalConfigs.template === "string"
                    ? profile.externalConfigs.template
                    : ""
              }
            : undefined,
          defaults: convertDefaultsToForm(profile.defaults)
        }
      : {
          slug: "",
          description: "",
          enrollmentType: EnrollmentType.API,
          issuerType: IssuerType.CA,
          certificateAuthorityId: "",
          certificatePolicyId: "",
          apiConfig: {
            autoRenew: false,
            renewBeforeDays: 30
          },
          acmeConfig: {
            skipDnsOwnershipVerification: false,
            skipEabBinding: false
          },
          externalConfigs: undefined,
          defaults: undefined
        }
  });

  const watchedEnrollmentType = watch("enrollmentType");
  const watchedIssuerType = watch("issuerType");
  const watchedCertificateAuthorityId = watch("certificateAuthorityId");
  const watchedDisableBootstrapValidation = watch("estConfig.disableBootstrapCaValidation");
  const watchedAutoRenew = watch("apiConfig.autoRenew");
  const watchedSkipDnsOwnershipVerification = watch("acmeConfig.skipDnsOwnershipVerification");
  const watchedSkipEabBinding = watch("acmeConfig.skipEabBinding");
  const watchedPolicyId = watch("certificatePolicyId");
  const watchedDefaultsIsCA = watch("defaults.basicConstraints.isCA") || false;

  // Fetch the policy for the defaults tab
  const { data: selectedPolicyData } = useGetCertificatePolicyById({
    policyId: watchedPolicyId || ""
  });

  // Compute constraints from the policy for the defaults tab
  const policyConstraints = useMemo(() => {
    const templateData = selectedPolicyData;
    if (!templateData) {
      return {
        allowedKeyUsages: [] as string[],
        allowedExtendedKeyUsages: [] as string[],
        requiredKeyUsages: [] as string[],
        requiredExtendedKeyUsages: [] as string[],
        allowedSignatureAlgorithms: [] as Array<{ value: string; label: string }>,
        allowedKeyAlgorithms: [] as Array<{ value: string; label: string }>,
        allowedSubjectAttributeTypes: [] as CertSubjectAttributeType[],
        shouldShowSubjectSection: false,
        templateAllowsCA: false,
        maxPathLength: undefined as number | undefined
      };
    }

    const isCaPolicy =
      (templateData.basicConstraints?.isCA as CertPolicyState) || CertPolicyState.DENIED;
    const templateAllowsCA =
      isCaPolicy === CertPolicyState.ALLOWED || isCaPolicy === CertPolicyState.REQUIRED;

    const allowedKeyUsages = [
      ...(templateData.keyUsages?.required || []),
      ...(templateData.keyUsages?.allowed || [])
    ];
    const allowedExtendedKeyUsages = [
      ...(templateData.extendedKeyUsages?.required || []),
      ...(templateData.extendedKeyUsages?.allowed || [])
    ];

    const allowedSignatureAlgorithms = (templateData.algorithms?.signature || []).map(
      (templateAlgorithm: string) => {
        const apiAlgorithm = mapPolicySignatureAlgorithmToApi(templateAlgorithm);
        return { value: apiAlgorithm, label: apiAlgorithm };
      }
    );

    const allowedKeyAlgorithms = (templateData.algorithms?.keyAlgorithm || []).map(
      (templateAlgorithm: string) => {
        const apiAlgorithm = mapPolicyKeyAlgorithmToApi(templateAlgorithm);
        return { value: apiAlgorithm, label: apiAlgorithm };
      }
    );

    let allowedSubjectAttributeTypes: CertSubjectAttributeType[] = [];
    let shouldShowSubjectSection = false;
    if (templateData.subject && templateData.subject.length > 0) {
      shouldShowSubjectSection = true;
      const subjectTypes: CertSubjectAttributeType[] = [];
      templateData.subject.forEach((subjectPolicy: { type: string }) => {
        if (!subjectTypes.includes(subjectPolicy.type as CertSubjectAttributeType)) {
          subjectTypes.push(subjectPolicy.type as CertSubjectAttributeType);
        }
      });
      allowedSubjectAttributeTypes =
        subjectTypes.length > 0 ? subjectTypes : [CertSubjectAttributeType.COMMON_NAME];
    }

    return {
      allowedKeyUsages,
      allowedExtendedKeyUsages,
      requiredKeyUsages: (templateData.keyUsages?.required || []) as string[],
      requiredExtendedKeyUsages: (templateData.extendedKeyUsages?.required || []) as string[],
      allowedSignatureAlgorithms,
      allowedKeyAlgorithms,
      allowedSubjectAttributeTypes,
      shouldShowSubjectSection,
      templateAllowsCA,
      maxPathLength: templateData.basicConstraints?.maxPathLength as number | undefined
    };
  }, [selectedPolicyData]);

  const filteredKeyUsages = useMemo(() => {
    return KEY_USAGES_OPTIONS.filter(({ value }) =>
      policyConstraints.allowedKeyUsages.includes(value)
    );
  }, [policyConstraints.allowedKeyUsages]);

  const filteredExtendedKeyUsages = useMemo(() => {
    return EXTENDED_KEY_USAGES_OPTIONS.filter(({ value }) =>
      policyConstraints.allowedExtendedKeyUsages.includes(value)
    );
  }, [policyConstraints.allowedExtendedKeyUsages]);

  // Get the selected CA to check if it's Azure ADCS
  const selectedCa = certificateAuthorities.find((ca) => ca.id === watchedCertificateAuthorityId);
  const isAzureAdcsCa = selectedCa?.type === CaType.AZURE_AD_CS;

  // Fetch Azure ADCS templates if needed
  const { data: azureAdcsTemplatesData } = useGetAzureAdcsTemplates({
    caId: watchedCertificateAuthorityId || "",
    projectId: currentProject?.id || "",
    isAzureAdcsCa
  });

  // Reset step to 0 when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setSelectedStepIndex(0);
    }
  }, [isOpen]);

  useEffect(() => {
    if (isEdit && profile) {
      reset({
        slug: profile.slug,
        description: profile.description || "",
        enrollmentType: profile.enrollmentType,
        issuerType: profile.issuerType,
        certificateAuthorityId: profile.caId || undefined,
        certificatePolicyId: profile.certificatePolicyId,
        estConfig:
          profile.enrollmentType === "est"
            ? {
                disableBootstrapCaValidation:
                  profile.estConfig?.disableBootstrapCaValidation || false,
                passphrase: profile.estConfig?.passphrase || "",
                caChain: profile.estConfig?.caChain || ""
              }
            : undefined,
        apiConfig:
          profile.enrollmentType === "api"
            ? {
                autoRenew: profile.apiConfig?.autoRenew || false,
                renewBeforeDays: profile.apiConfig?.renewBeforeDays || 30
              }
            : undefined,
        acmeConfig:
          profile.enrollmentType === EnrollmentType.ACME
            ? {
                skipDnsOwnershipVerification:
                  profile.acmeConfig?.skipDnsOwnershipVerification || false,
                skipEabBinding: profile.acmeConfig?.skipEabBinding || false
              }
            : undefined,
        externalConfigs: profile.externalConfigs
          ? {
              template:
                typeof profile.externalConfigs === "object" &&
                profile.externalConfigs !== null &&
                typeof profile.externalConfigs.template === "string"
                  ? profile.externalConfigs.template
                  : ""
            }
          : undefined,
        defaults: convertDefaultsToForm(profile.defaults)
      });
    }
  }, [isEdit, profile, reset, allCaData]);

  // Additional effect to reset external configs when Azure ADCS templates are loaded
  useEffect(() => {
    if (
      isEdit &&
      profile &&
      isAzureAdcsCa &&
      azureAdcsTemplatesData?.templates &&
      profile.externalConfigs &&
      typeof profile.externalConfigs === "object" &&
      profile.externalConfigs !== null &&
      typeof profile.externalConfigs.template === "string"
    ) {
      setValue("externalConfigs.template", profile.externalConfigs.template);
    }
  }, [isEdit, profile, isAzureAdcsCa, azureAdcsTemplatesData, setValue]);

  const onFormSubmit = async (data: FormData) => {
    if (!currentProject?.id && !isEdit) return;

    // Validate Azure ADCS template requirement
    if (
      isAzureAdcsCa &&
      (!data.externalConfigs?.template || data.externalConfigs.template.trim() === "")
    ) {
      createNotification({
        text: "Azure ADCS Certificate Authority requires a template to be specified",
        type: "error"
      });
      return;
    }

    const serializedDefaults = convertFormToDefaults(data.defaults);

    if (isEdit) {
      const updateData: TUpdateCertificateProfileDTO = {
        profileId: profile.id,
        slug: data.slug,
        description: data.description,
        issuerType: data.issuerType
      };

      if (data.enrollmentType === EnrollmentType.EST && data.estConfig) {
        updateData.estConfig = data.estConfig;
      } else if (data.enrollmentType === EnrollmentType.API && data.apiConfig) {
        updateData.apiConfig = data.apiConfig;
      } else if (data.enrollmentType === EnrollmentType.ACME && data.acmeConfig) {
        updateData.acmeConfig = data.acmeConfig;
      }

      if (data.externalConfigs) {
        updateData.externalConfigs = data.externalConfigs;
      }

      // Send defaults (or null to clear)
      updateData.defaults = serializedDefaults;

      await updateProfile.mutateAsync(updateData);
    } else {
      if (!currentProject?.id) {
        throw new Error("Project ID is required for creating a profile");
      }

      const createData: TCreateCertificateProfileDTO = {
        projectId: currentProject.id,
        slug: data.slug,
        description: data.description,
        enrollmentType: data.enrollmentType,
        issuerType: data.issuerType,
        caId:
          data.issuerType === IssuerType.SELF_SIGNED
            ? undefined
            : data.certificateAuthorityId || undefined,
        certificatePolicyId: data.certificatePolicyId
      };

      if (data.enrollmentType === EnrollmentType.EST && data.estConfig) {
        createData.estConfig = {
          passphrase: data.estConfig.passphrase,
          caChain: data.estConfig.caChain || undefined,
          disableBootstrapCaValidation: data.estConfig.disableBootstrapCaValidation
        };
      } else if (data.enrollmentType === EnrollmentType.API && data.apiConfig) {
        createData.apiConfig = data.apiConfig;
      } else if (data.enrollmentType === EnrollmentType.ACME && data.acmeConfig) {
        createData.acmeConfig = data.acmeConfig;
      }

      if (data.externalConfigs) {
        createData.externalConfigs = data.externalConfigs;
      }

      if (serializedDefaults) {
        createData.defaults = serializedDefaults;
      }

      await createProfile.mutateAsync(createData);
    }

    createNotification({
      text: `Certificate profile ${isEdit ? "updated" : "created"} successfully`,
      type: "success"
    });

    reset();
    onClose();
  };

  // Step validation and navigation (PolicyModal pattern)
  const isStepValid = async (index: number) => {
    const { fields } = FORM_STEPS[index];
    if (fields.length === 0) return true;
    return trigger(fields as any);
  };

  const handleNext = async () => {
    if (isFinalStep) {
      await handleSubmit(onFormSubmit)();
      return;
    }
    const isValid = await isStepValid(selectedStepIndex);
    if (!isValid) return;
    setSelectedStepIndex((prev) => prev + 1);
  };

  const handlePrev = () => {
    if (selectedStepIndex === 0) {
      handlePopUpToggle("createPolicy", false);
      reset();
      onClose();
      return;
    }
    setSelectedStepIndex((prev) => prev - 1);
  };

  const isTabEnabled = async (index: number) => {
    let isEnabled = true;
    for (let i = index - 1; i >= 0; i -= 1) {
      // eslint-disable-next-line no-await-in-loop
      isEnabled = isEnabled && (await isStepValid(i));
    }
    return isEnabled;
  };

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          reset();
          setSelectedStepIndex(0);
        }
        onClose();
      }}
    >
      <ModalContent
        title={isEdit ? "Edit Certificate Profile" : "Create Certificate Profile"}
        subTitle={
          isEdit
            ? `Update configuration for ${profile?.slug}`
            : "Configure a new certificate profile for unified certificate issuance"
        }
      >
        <form>
          <Tab.Group selectedIndex={selectedStepIndex} onChange={setSelectedStepIndex}>
            <Tab.List className="-pb-1 mb-6 w-full border-b-2 border-mineshaft-600">
              {FORM_STEPS.map((step, index) => (
                <Tab
                  onClick={async (e) => {
                    e.preventDefault();
                    const isEnabled = await isTabEnabled(index);
                    setSelectedStepIndex((prev) => (isEnabled ? index : prev));
                  }}
                  className={({ selected }) =>
                    `-mb-[0.14rem] whitespace-nowrap ${index > selectedStepIndex ? "opacity-30" : ""} px-4 py-2 text-sm font-medium outline-hidden disabled:opacity-60 ${
                      selected
                        ? "border-b-2 border-mineshaft-300 text-mineshaft-200"
                        : "text-bunker-300"
                    }`
                  }
                  key={step.key}
                >
                  {index + 1}. {step.name}
                </Tab>
              ))}
            </Tab.List>
            <Tab.Panels>
              {/* Tab 1: Configuration */}
              <Tab.Panel>
                <Controller
                  control={control}
                  name="slug"
                  render={({ field, fieldState: { error } }) => (
                    <FormControl
                      label="Name"
                      isRequired
                      isError={Boolean(error)}
                      errorText={error?.message}
                    >
                      <Input {...field} placeholder="your-profile-name" />
                    </FormControl>
                  )}
                />

                <Controller
                  control={control}
                  name="description"
                  render={({ field, fieldState: { error } }) => (
                    <FormControl
                      label="Description"
                      isError={Boolean(error)}
                      errorText={error?.message}
                    >
                      <TextArea {...field} placeholder="Enter profile description" rows={3} />
                    </FormControl>
                  )}
                />

                <Controller
                  control={control}
                  name="issuerType"
                  render={({ field: { onChange, ...field }, fieldState: { error } }) => (
                    <FormControl
                      label="Issuer Type"
                      isRequired
                      isError={Boolean(error)}
                      errorText={error?.message}
                    >
                      <Select
                        {...field}
                        onValueChange={(value) => {
                          if (value === "self-signed") {
                            setValue("certificateAuthorityId", "");
                            setValue("enrollmentType", EnrollmentType.API);
                            setValue("apiConfig", {
                              autoRenew: false,
                              renewBeforeDays: 30
                            });
                            setValue("estConfig", undefined);
                            setValue("acmeConfig", {
                              skipDnsOwnershipVerification: false,
                              skipEabBinding: false
                            });
                          }
                          onChange(value);
                        }}
                        className="w-full"
                        position="popper"
                        isDisabled={Boolean(isEdit)}
                      >
                        <SelectItem value="ca">Certificate Authority</SelectItem>
                        <SelectItem value="self-signed">Self-Signed</SelectItem>
                      </Select>
                    </FormControl>
                  )}
                />

                {watchedIssuerType === "ca" && (
                  <Controller
                    control={control}
                    name="certificateAuthorityId"
                    render={({ field: { onChange, value }, fieldState: { error } }) => (
                      <FormControl
                        label="Issuing CA"
                        isRequired
                        isError={Boolean(error)}
                        errorText={error?.message}
                      >
                        <FilterableSelect
                          value={certificateAuthorities.find((ca) => ca.id === value) || null}
                          onChange={(selectedCaValue) => {
                            if (Array.isArray(selectedCaValue)) {
                              onChange(selectedCaValue[0]?.id || "");
                            } else if (
                              selectedCaValue &&
                              typeof selectedCaValue === "object" &&
                              "id" in selectedCaValue
                            ) {
                              onChange(selectedCaValue.id || "");
                            } else {
                              onChange("");
                            }
                          }}
                          getOptionLabel={(ca) =>
                            ca.type === "internal" && ca.configuration.friendlyName
                              ? ca.configuration.friendlyName
                              : ca.name
                          }
                          getOptionValue={(ca) => ca.id}
                          options={certificateAuthorities}
                          groupBy="groupType"
                          getGroupHeaderLabel={getGroupHeaderLabel}
                          placeholder="Select a certificate authority"
                          isDisabled={Boolean(isEdit)}
                          className="w-full"
                        />
                      </FormControl>
                    )}
                  />
                )}

                {/* Azure ADCS Template Selection */}
                {isAzureAdcsCa && (
                  <Controller
                    control={control}
                    name="externalConfigs.template"
                    render={({ field: { onChange, value }, fieldState: { error } }) => (
                      <FormControl
                        label="Windows ADCS Template"
                        isRequired
                        isError={Boolean(error)}
                        errorText={error?.message}
                      >
                        <FilterableSelect
                          value={
                            azureAdcsTemplatesData?.templates.find(
                              (template) => template.id === value
                            ) || null
                          }
                          onChange={(selectedTemplate) => {
                            if (Array.isArray(selectedTemplate)) {
                              onChange(selectedTemplate[0]?.id || "");
                            } else if (
                              selectedTemplate &&
                              typeof selectedTemplate === "object" &&
                              "id" in selectedTemplate
                            ) {
                              onChange(selectedTemplate.id || "");
                            } else {
                              onChange("");
                            }
                          }}
                          getOptionLabel={(template) => template.name}
                          getOptionValue={(template) => template.id}
                          options={azureAdcsTemplatesData?.templates || []}
                          placeholder="Select an Azure ADCS certificate template"
                          className="w-full"
                        />
                      </FormControl>
                    )}
                  />
                )}

                <Controller
                  control={control}
                  name="certificatePolicyId"
                  render={({ field: { onChange, value }, fieldState: { error } }) => (
                    <FormControl
                      label="Certificate Policy"
                      isRequired
                      isError={Boolean(error)}
                      errorText={error?.message}
                    >
                      <FilterableSelect
                        value={certificatePolicies.find((p) => p.id === value) ?? null}
                        onChange={(newValue) => {
                          const selected = newValue as SingleValue<PolicyOption>;
                          if (selected?.id === "_create") {
                            handlePopUpOpen("createPolicy");
                            return;
                          }
                          onChange(selected?.id || "");

                          // Reset defaults when policy changes
                          setValue("defaults", undefined);

                          if (watchedEnrollmentType === "est") {
                            setValue("apiConfig", undefined);
                            setValue("estConfig", {
                              disableBootstrapCaValidation: false,
                              passphrase: ""
                            });
                            setValue("acmeConfig", undefined);
                          } else if (watchedEnrollmentType === "api") {
                            setValue("apiConfig", {
                              autoRenew: false,
                              renewBeforeDays: 30
                            });
                            setValue("estConfig", undefined);
                            setValue("acmeConfig", undefined);
                          } else if (watchedEnrollmentType === "acme") {
                            setValue("estConfig", undefined);
                            setValue("apiConfig", undefined);
                            setValue("acmeConfig", {
                              skipDnsOwnershipVerification: false,
                              skipEabBinding: false
                            });
                          }
                        }}
                        options={policyOptions}
                        getOptionLabel={(option) => option.name}
                        getOptionValue={(option) => option.id}
                        placeholder={
                          certificatePolicies.length === 0 && !canCreatePolicy
                            ? "No certificate policies available"
                            : "Select a certificate policy"
                        }
                        isDisabled={Boolean(isEdit)}
                        components={{ Option: CertificatePolicyOption }}
                      />
                    </FormControl>
                  )}
                />

                <Controller
                  control={control}
                  name="enrollmentType"
                  render={({ field: { onChange, ...field }, fieldState: { error } }) => (
                    <FormControl
                      label="Enrollment Method"
                      isRequired
                      isError={Boolean(error)}
                      errorText={error?.message}
                    >
                      <Select
                        {...field}
                        onValueChange={(value) => {
                          if (value === "est") {
                            setValue("apiConfig", undefined);
                            setValue("estConfig", {
                              disableBootstrapCaValidation: false,
                              passphrase: ""
                            });
                            setValue("acmeConfig", undefined);
                          } else if (value === "api") {
                            setValue("apiConfig", {
                              autoRenew: false,
                              renewBeforeDays: 30
                            });
                            setValue("estConfig", undefined);
                            setValue("acmeConfig", undefined);
                          } else if (value === "acme") {
                            setValue("apiConfig", undefined);
                            setValue("estConfig", undefined);
                            setValue("acmeConfig", {
                              skipDnsOwnershipVerification: false,
                              skipEabBinding: false
                            });
                          }
                          onChange(value);
                        }}
                        className="w-full"
                        position="popper"
                        isDisabled={Boolean(isEdit)}
                      >
                        <SelectItem value="api">API</SelectItem>
                        {watchedIssuerType !== IssuerType.SELF_SIGNED && (
                          <SelectItem value="est">EST</SelectItem>
                        )}
                        {watchedIssuerType !== IssuerType.SELF_SIGNED && (
                          <SelectItem value="acme">ACME</SelectItem>
                        )}
                      </Select>
                    </FormControl>
                  )}
                />

                {/* EST Configuration */}
                {watchedEnrollmentType === "est" && (
                  <div className="mb-4 space-y-4">
                    <div className="space-y-4">
                      <Controller
                        control={control}
                        name="estConfig.disableBootstrapCaValidation"
                        render={({ field: { value, onChange }, fieldState: { error } }) => (
                          <FormControl isError={Boolean(error)} errorText={error?.message}>
                            <div className="flex items-center gap-3 rounded-md border border-mineshaft-600 bg-mineshaft-900 p-4">
                              <Checkbox
                                id="disableBootstrapCaValidation"
                                isChecked={value}
                                onCheckedChange={onChange}
                              />
                              <div className="space-y-1">
                                <span className="text-sm font-medium text-mineshaft-100">
                                  Disable Bootstrap CA Validation
                                </span>
                                <p className="text-xs text-bunker-300">
                                  Skip CA certificate validation during EST bootstrap phase
                                </p>
                              </div>
                            </div>
                          </FormControl>
                        )}
                      />

                      <Controller
                        control={control}
                        name="estConfig.passphrase"
                        render={({ field, fieldState: { error } }) => (
                          <FormControl
                            label="EST Passphrase"
                            isRequired={!isEdit}
                            isError={Boolean(error)}
                            errorText={error?.message}
                          >
                            <Input
                              {...field}
                              type="password"
                              placeholder="Enter secure passphrase for EST authentication"
                              className="w-full"
                            />
                          </FormControl>
                        )}
                      />

                      {!watchedDisableBootstrapValidation && (
                        <Controller
                          control={control}
                          name="estConfig.caChain"
                          render={({ field, fieldState: { error } }) => (
                            <FormControl
                              label="CA Chain Certificate"
                              isRequired={!isEdit}
                              isError={Boolean(error)}
                              errorText={error?.message}
                            >
                              <div className="space-y-2">
                                <TextArea
                                  {...field}
                                  placeholder="-----BEGIN CERTIFICATE-----&#10;MIIDXTCCAkWgAwIBAgIJAKoK/heBjcOuMA0GCSqGSIb3DQEBCwUAMEUxCzAJBgNV&#10;BAYTAkFVMRMwEQYDVQQIDApTb21lLVN0YXRlMSEwHwYDVQQKDBhJbnRlcm5ldCBX&#10;...&#10;-----END CERTIFICATE-----"
                                  rows={6}
                                  className="w-full font-mono text-xs"
                                />
                                <p className="text-xs text-bunker-400">
                                  Paste the complete CA certificate chain in PEM format
                                </p>
                              </div>
                            </FormControl>
                          )}
                        />
                      )}
                    </div>
                  </div>
                )}

                {/* API Configuration */}
                {watchedEnrollmentType === "api" && (
                  <div className="mb-4 space-y-4">
                    <Controller
                      control={control}
                      name="apiConfig.autoRenew"
                      render={({ field: { value, onChange }, fieldState: { error } }) => (
                        <FormControl isError={Boolean(error)} errorText={error?.message}>
                          <div className="flex items-center gap-2">
                            <Checkbox id="autoRenew" isChecked={value} onCheckedChange={onChange}>
                              Enable Auto-Renewal By Default
                            </Checkbox>
                            <Tooltip content="If enabled, certificates issued against this profile will auto-renew at specified days before expiration.">
                              <FontAwesomeIcon
                                icon={faQuestionCircle}
                                className="cursor-help text-mineshaft-400 hover:text-mineshaft-300"
                                size="sm"
                              />
                            </Tooltip>
                          </div>
                        </FormControl>
                      )}
                    />
                  </div>
                )}

                {/* ACME Configuration */}
                {watchedEnrollmentType === "acme" && (
                  <div className="mb-4 space-y-4">
                    <Controller
                      control={control}
                      name="acmeConfig.skipEabBinding"
                      render={({ field: { value, onChange }, fieldState: { error } }) => (
                        <FormControl isError={Boolean(error)} errorText={error?.message}>
                          <div
                            className={`flex items-center gap-3 rounded-md border bg-mineshaft-900 p-4 ${
                              watchedSkipDnsOwnershipVerification
                                ? "border-mineshaft-700 opacity-50"
                                : "border-mineshaft-600"
                            }`}
                          >
                            <Checkbox
                              id="skipEabBinding"
                              isChecked={value || false}
                              onCheckedChange={onChange}
                              isDisabled={watchedSkipDnsOwnershipVerification}
                            />
                            <div className="space-y-1">
                              <span className="text-sm font-medium text-mineshaft-100">
                                Skip External Account Binding (EAB)
                              </span>
                              <p className="text-xs text-bunker-300">
                                Skip EAB authentication when clients create ACME accounts.
                              </p>
                              {watchedSkipDnsOwnershipVerification && (
                                <p className="text-xs text-yellow-500">
                                  Cannot be enabled while DNS ownership validation is skipped.
                                </p>
                              )}
                            </div>
                          </div>
                        </FormControl>
                      )}
                    />
                    <Controller
                      control={control}
                      name="acmeConfig.skipDnsOwnershipVerification"
                      render={({ field: { value, onChange }, fieldState: { error } }) => (
                        <FormControl isError={Boolean(error)} errorText={error?.message}>
                          <div
                            className={`flex items-center gap-3 rounded-md border bg-mineshaft-900 p-4 ${
                              watchedSkipEabBinding
                                ? "border-mineshaft-700 opacity-50"
                                : "border-mineshaft-600"
                            }`}
                          >
                            <Checkbox
                              id="skipDnsOwnershipVerification"
                              isChecked={value || false}
                              onCheckedChange={onChange}
                              isDisabled={watchedSkipEabBinding}
                            />
                            <div className="space-y-1">
                              <span className="text-sm font-medium text-mineshaft-100">
                                Skip DNS Ownership Validation
                              </span>
                              <p className="text-xs text-bunker-300">
                                Skip DNS ownership verification during ACME certificate issuance.
                              </p>
                              {watchedSkipEabBinding && (
                                <p className="text-xs text-yellow-500">
                                  Cannot be enabled while EAB is skipped.
                                </p>
                              )}
                            </div>
                          </div>
                        </FormControl>
                      )}
                    />
                  </div>
                )}
                {watchedAutoRenew && (
                  <div className="mb-4 space-y-4">
                    <Controller
                      control={control}
                      name="apiConfig.renewBeforeDays"
                      render={({ field, fieldState: { error } }) => (
                        <FormControl
                          label="Auto-Renewal Days Before Expiration"
                          isError={Boolean(error)}
                          errorText={error?.message}
                        >
                          <Input
                            {...field}
                            type="number"
                            placeholder="30"
                            min="1"
                            max="365"
                            className="w-full"
                            isDisabled={!watchedAutoRenew}
                            onChange={(e) => {
                              const { value } = e.target;
                              if (value === "") {
                                field.onChange("");
                              } else {
                                const parsed = parseInt(value, 10);
                                if (!Number.isNaN(parsed) && parsed >= 1 && parsed <= 365) {
                                  field.onChange(parsed);
                                } else {
                                  field.onChange(field.value || "");
                                }
                              }
                            }}
                          />
                        </FormControl>
                      )}
                    />
                  </div>
                )}
              </Tab.Panel>

              {/* Tab 2: Certificate Defaults */}
              <Tab.Panel>
                {!watchedPolicyId ? (
                  <EmptyState title="Select a certificate policy on the Configuration tab to configure defaults." />
                ) : (
                  <div className="space-y-4">
                    <p className="text-sm text-bunker-300">
                      Set default values for certificates issued under this profile. These defaults
                      are used when a certificate request does not specify its own values.
                    </p>
                    {/* TTL — simple days number input */}
                    <Controller
                      name="defaults.ttlDays"
                      control={control}
                      render={({ field, fieldState: { error } }) => (
                        <FormControl
                          label={
                            <FormLabel
                              label="Time to Live (TTL)"
                              icon={
                                <Tooltip content="Fallback validity period used when not explicitly specified in certificate request. Leave empty for no TTL default.">
                                  <FontAwesomeIcon
                                    icon={faQuestionCircle}
                                    className="cursor-help text-mineshaft-400 hover:text-mineshaft-300"
                                    size="sm"
                                  />
                                </Tooltip>
                              }
                            />
                          }
                          isError={Boolean(error)}
                          errorText={error?.message}
                        >
                          <Input
                            type="number"
                            placeholder="e.g. 365"
                            value={field.value == null ? "" : field.value}
                            onChange={(e) => {
                              const val = e.target.value;
                              field.onChange(val === "" ? null : Number(val));
                            }}
                          />
                        </FormControl>
                      )}
                    />

                    {/* Subject Attributes — only if policy allows subject fields */}
                    {policyConstraints.shouldShowSubjectSection && (
                      <SubjectAttributesField
                        control={control}
                        allowedAttributeTypes={policyConstraints.allowedSubjectAttributeTypes}
                        namePrefix="defaults.subjectAttributes"
                      />
                    )}

                    {/* Algorithms — filtered to policy-allowed values, with "None" option */}
                    {(policyConstraints.allowedSignatureAlgorithms.length > 0 ||
                      policyConstraints.allowedKeyAlgorithms.length > 0) && (
                      <AlgorithmSelectors
                        control={control}
                        signatureFieldName="defaults.signatureAlgorithm"
                        keyFieldName="defaults.keyAlgorithm"
                        availableSignatureAlgorithms={policyConstraints.allowedSignatureAlgorithms}
                        availableKeyAlgorithms={policyConstraints.allowedKeyAlgorithms}
                        isRequired={false}
                        nonePlaceholder="No default"
                      />
                    )}

                    {/* Key Usages, Ext Key Usages, Basic Constraints — in Accordion */}
                    <Accordion type="single" collapsible className="w-full">
                      {filteredKeyUsages.length > 0 && (
                        <KeyUsageSection
                          control={control}
                          title="Key Usages"
                          accordionValue="key-usages"
                          namePrefix="defaults.keyUsages"
                          options={filteredKeyUsages as Array<{ value: string; label: string }>}
                          requiredUsages={[]}
                        />
                      )}
                      {filteredExtendedKeyUsages.length > 0 && (
                        <KeyUsageSection
                          control={control}
                          title="Extended Key Usages"
                          accordionValue="extended-key-usages"
                          namePrefix="defaults.extendedKeyUsages"
                          options={
                            filteredExtendedKeyUsages as Array<{ value: string; label: string }>
                          }
                          requiredUsages={[]}
                        />
                      )}
                      {policyConstraints.templateAllowsCA && (
                        <AccordionItem value="basic-constraints">
                          <AccordionTrigger>Basic Constraints</AccordionTrigger>
                          <AccordionContent>
                            <div className="space-y-4 pl-2">
                              <Controller
                                control={control}
                                name="defaults.basicConstraints.isCA"
                                render={({ field: { value, onChange } }) => (
                                  <div className="flex items-center gap-3">
                                    <Checkbox
                                      id="defaults-isCA"
                                      isChecked={value || false}
                                      onCheckedChange={(checked) => {
                                        onChange(checked);
                                        if (!checked) {
                                          setValue(
                                            "defaults.basicConstraints.pathLength",
                                            undefined
                                          );
                                        }
                                      }}
                                    />
                                    <div className="space-y-1">
                                      <FormLabel
                                        id="defaults-isCA"
                                        className="cursor-pointer text-sm font-medium text-mineshaft-100"
                                        label="Issue as Certificate Authority"
                                      />
                                      <p className="text-xs text-bunker-300">
                                        Certificates will default to CA:TRUE extension
                                      </p>
                                    </div>
                                  </div>
                                )}
                              />

                              {watchedDefaultsIsCA && (
                                <Controller
                                  control={control}
                                  name="defaults.basicConstraints.pathLength"
                                  render={({ field, fieldState: { error } }) => (
                                    <FormControl
                                      label="Path Length"
                                      isError={Boolean(error)}
                                      errorText={error?.message}
                                    >
                                      <Input
                                        {...field}
                                        type="number"
                                        min={0}
                                        placeholder="Leave empty for no constraint"
                                        className="w-full"
                                        value={field.value ?? ""}
                                        onChange={(e) => {
                                          const val = e.target.value;
                                          if (val === "") {
                                            field.onChange(undefined);
                                          } else {
                                            const numVal = parseInt(val, 10);
                                            field.onChange(
                                              Number.isNaN(numVal) ? undefined : numVal
                                            );
                                          }
                                        }}
                                      />
                                    </FormControl>
                                  )}
                                />
                              )}
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      )}
                    </Accordion>
                  </div>
                )}
              </Tab.Panel>
            </Tab.Panels>
          </Tab.Group>

          {/* Next/Back buttons OUTSIDE tabs — always visible */}
          <div className="mt-6 flex justify-between border-t border-mineshaft-600 pt-4">
            <Button type="button" variant="outline_bg" onClick={handlePrev}>
              {selectedStepIndex === 0 ? "Cancel" : "Back"}
            </Button>
            <Button
              type="button"
              onClick={handleNext}
              isLoading={createProfile.isPending || updateProfile.isPending}
              isDisabled={
                createProfile.isPending ||
                updateProfile.isPending ||
                (!formState.isValid && isFinalStep)
              }
            >
              {isFinalStep && (isEdit ? "Update" : "Create")}
              {!isFinalStep && "Next"}
            </Button>
          </div>
        </form>
        <CreatePolicyModal
          isOpen={popUp.createPolicy.isOpen}
          onClose={() => handlePopUpToggle("createPolicy", false)}
          onComplete={async (createdPolicy) => {
            await queryClient.refetchQueries({
              queryKey: ["list-certificate-policies", currentProject?.id]
            });
            setValue("certificatePolicyId", createdPolicy.id, { shouldValidate: true });
            handlePopUpToggle("createPolicy", false);
          }}
        />
      </ModalContent>
    </Modal>
  );
};
