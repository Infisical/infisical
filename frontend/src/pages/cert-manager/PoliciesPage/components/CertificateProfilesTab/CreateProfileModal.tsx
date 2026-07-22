import { useEffect, useMemo, useState } from "react";
import { Control, Controller, useForm } from "react-hook-form";
import { SingleValue } from "react-select";
import { faQuestionCircle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Tab } from "@headlessui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
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
import {
  useGetAdcsTemplates,
  useGetAzureAdcsTemplates,
  useListCasByProjectId
} from "@app/hooks/api/ca/queries";
import {
  TCertificatePolicy,
  useGetCertificatePolicyById,
  useListCertificatePolicies
} from "@app/hooks/api/certificatePolicies";
import {
  IssuerType,
  TCertificateProfileDefaults,
  TCertificateProfileWithDetails,
  TCreateCertificateProfileDTO,
  TUpdateCertificateProfileDTO,
  useCreateCertificateProfile,
  useUpdateCertificateProfile
} from "@app/hooks/api/certificateProfiles";
import {
  certKeyAlgorithms,
  EXTENDED_KEY_USAGES_OPTIONS,
  KEY_USAGES_OPTIONS,
  SIGNATURE_ALGORITHMS_OPTIONS
} from "@app/hooks/api/certificates/constants";
import { AlgorithmSelectors } from "@app/pages/cert-manager/CertificatesPage/components/AlgorithmSelectors";
import { filterUsages } from "@app/pages/cert-manager/CertificatesPage/components/certificateUtils";
import { KeyUsageSection } from "@app/pages/cert-manager/CertificatesPage/components/KeyUsageSection";
import { SubjectAltNamesField } from "@app/pages/cert-manager/CertificatesPage/components/SubjectAltNamesField";
import { SubjectAttributesField } from "@app/pages/cert-manager/CertificatesPage/components/SubjectAttributesField";
import {
  CertPolicyState,
  CertSubjectAlternativeNameType,
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
    subjectAltNames: z
      .array(
        z.object({
          type: z.nativeEnum(CertSubjectAlternativeNameType),
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
  "issuerType",
  "certificateAuthorityId",
  "certificatePolicyId",
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

const slugSchema = z
  .string()
  .trim()
  .min(1, "Profile slug is required")
  .max(255, "Profile slug must be less than 255 characters")
  .regex(
    /^[a-zA-Z0-9-_]+$/,
    "Profile slug must contain only letters, numbers, hyphens, and underscores"
  );

const descriptionSchema = z
  .string()
  .trim()
  .max(1000, "Description must be less than 1000 characters")
  .optional();

const createSchema = z
  .object({
    slug: slugSchema,
    description: descriptionSchema,
    issuerType: z.nativeEnum(IssuerType),
    certificateAuthorityId: z.string().nullable().optional(),
    certificatePolicyId: z.string().min(1, "Certificate Policy is required"),
    externalConfigs: z
      .object({
        template: z.string().min(1, "Azure ADCS template is required")
      })
      .optional(),
    defaults: certificateDefaultsSchema
  })
  .refine(
    (data) => {
      if (data.issuerType === IssuerType.CA) {
        return !!data.certificateAuthorityId;
      }
      return true;
    },
    {
      message: "Certificate Authority is required",
      path: ["certificateAuthorityId"]
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
      message: "Self-signed issuer type cannot have a certificate authority",
      path: ["certificateAuthorityId"]
    }
  );

const editSchema = z
  .object({
    slug: slugSchema,
    description: descriptionSchema,
    issuerType: z.nativeEnum(IssuerType),
    certificateAuthorityId: z.string().nullable().optional(),
    certificatePolicyId: z.string().optional(),
    externalConfigs: z
      .object({
        template: z.string().optional()
      })
      .optional(),
    defaults: certificateDefaultsSchema
  })
  .refine(
    (data) => {
      if (data.issuerType === IssuerType.CA) {
        return !!data.certificateAuthorityId;
      }
      return true;
    },
    {
      message: "Certificate Authority is required",
      path: ["certificateAuthorityId"]
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
      message: "Self-signed issuer type cannot have a certificate authority",
      path: ["certificateAuthorityId"]
    }
  );

export type FormData = z.infer<typeof createSchema>;

type ExternalCaTemplateOption = { id: string; name: string; description?: string };

const ExternalCaTemplateSelect = ({
  control,
  templates,
  valueKey,
  placeholder
}: {
  control: Control<FormData>;
  templates: ExternalCaTemplateOption[];
  valueKey: "id" | "name";
  placeholder: string;
}) => (
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
          value={templates.find((template) => template[valueKey] === value) || null}
          onChange={(selected) => {
            const option = Array.isArray(selected) ? selected[0] : selected;
            onChange(
              option && typeof option === "object" && valueKey in option
                ? option[valueKey] || ""
                : ""
            );
          }}
          getOptionLabel={(template) => template.name}
          getOptionValue={(template) => template[valueKey]}
          options={templates}
          placeholder={placeholder}
          className="w-full"
        />
      </FormControl>
    )}
  />
);

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
  // Domain components are multi-valued: expand each into its own row.
  if (defaults.domainComponents) {
    defaults.domainComponents.forEach((dc) => {
      subjectAttributes.push({ type: CertSubjectAttributeType.DOMAIN_COMPONENT, value: dc });
    });
  }

  return {
    ttlDays: defaults.ttlDays ?? null,
    subjectAttributes: subjectAttributes.length > 0 ? subjectAttributes : undefined,
    subjectAltNames:
      defaults.subjectAltNames && defaults.subjectAltNames.length > 0
        ? (defaults.subjectAltNames as { type: CertSubjectAlternativeNameType; value: string }[])
        : undefined,
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
    const domainComponents: string[] = [];
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
        case CertSubjectAttributeType.DOMAIN_COMPONENT:
          domainComponents.push(attr.value);
          break;
        default:
          break;
      }
    });
    if (domainComponents.length > 0) {
      result.domainComponents = domainComponents;
    }
  }

  if (formDefaults.subjectAltNames && formDefaults.subjectAltNames.length > 0) {
    const sans = formDefaults.subjectAltNames.filter((san) => san.value?.trim());
    if (sans.length > 0) result.subjectAltNames = sans;
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

const toFormExternalConfigs = (
  externalConfigs: TCertificateProfileWithDetails["externalConfigs"]
): FormData["externalConfigs"] => {
  if (!externalConfigs) return undefined;
  return {
    template:
      typeof externalConfigs === "object" &&
      externalConfigs !== null &&
      typeof externalConfigs.template === "string"
        ? externalConfigs.template
        : ""
  };
};

const buildFormValuesFromProfile = (
  sourceProfile: TCertificateProfileWithDetails,
  isClone: boolean
): FormData => ({
  slug: isClone ? `${sourceProfile.slug}-copy` : sourceProfile.slug,
  description: sourceProfile.description || "",
  issuerType: sourceProfile.issuerType,
  certificateAuthorityId: sourceProfile.caId || undefined,
  certificatePolicyId: sourceProfile.certificatePolicyId,
  externalConfigs: toFormExternalConfigs(sourceProfile.externalConfigs),
  defaults: convertDefaultsToForm(sourceProfile.defaults)
});

interface Props {
  isOpen: boolean;
  onClose: () => void;
  profile?: TCertificateProfileWithDetails;
  mode?: "create" | "edit" | "clone";
}

export const CreateProfileModal = ({ isOpen, onClose, profile, mode = "create" }: Props) => {
  const { currentProject } = useProject();
  const { permission } = useProjectPermission();
  const { orgId, projectId } = useParams({ strict: false }) as {
    orgId?: string;
    projectId?: string;
  };
  const { popUp, handlePopUpToggle, handlePopUpOpen } = usePopUp(["createPolicy"] as const);
  const queryClient = useQueryClient();

  const [selectedStepIndex, setSelectedStepIndex] = useState(0);

  const canCreatePolicy = permission.can(
    ProjectPermissionCertificatePolicyActions.Create,
    ProjectPermissionSub.CertificatePolicies
  );

  const { data: allCaData } = useListCasByProjectId();
  const { data: policyData } = useListCertificatePolicies({
    limit: 100,
    offset: 0
  });

  const createProfile = useCreateCertificateProfile();
  const updateProfile = useUpdateCertificateProfile();

  const isEdit = mode === "edit" && profile;
  const isClone = mode === "clone" && profile;
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

  const { control, handleSubmit, reset, watch, setValue, trigger } = useForm<FormData>({
    resolver: zodResolver(isEdit ? editSchema : createSchema),
    defaultValues:
      (isEdit || isClone) && profile
        ? buildFormValuesFromProfile(profile, Boolean(isClone))
        : {
            slug: "",
            description: "",
            issuerType: IssuerType.CA,
            certificateAuthorityId: "",
            certificatePolicyId: "",
            externalConfigs: undefined,
            defaults: {}
          }
  });

  const watchedIssuerType = watch("issuerType");
  const watchedCertificateAuthorityId = watch("certificateAuthorityId");
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
        allowedSanTypes: [] as CertSubjectAlternativeNameType[],
        shouldShowSanSection: false,
        templateAllowsCA: false,
        maxPathLength: undefined as number | undefined
      };
    }

    const isCaPolicy =
      (templateData.basicConstraints?.isCA as CertPolicyState) || CertPolicyState.DENIED;
    const templateAllowsCA =
      isCaPolicy === CertPolicyState.ALLOWED || isCaPolicy === CertPolicyState.REQUIRED;

    const hasKeyUsagePolicy = Boolean(templateData.keyUsages);
    const allowedKeyUsages = hasKeyUsagePolicy
      ? [...(templateData.keyUsages?.required || []), ...(templateData.keyUsages?.allowed || [])]
      : KEY_USAGES_OPTIONS.map((option) => option.value);

    const hasExtendedKeyUsagePolicy = Boolean(templateData.extendedKeyUsages);
    const allowedExtendedKeyUsages = hasExtendedKeyUsagePolicy
      ? [
          ...(templateData.extendedKeyUsages?.required || []),
          ...(templateData.extendedKeyUsages?.allowed || [])
        ]
      : EXTENDED_KEY_USAGES_OPTIONS.map((option) => option.value);

    const allowedSignatureAlgorithms = templateData.algorithms?.signature?.length
      ? templateData.algorithms.signature.map((templateAlgorithm: string) => {
          const apiAlgorithm = mapPolicySignatureAlgorithmToApi(templateAlgorithm);
          return { value: apiAlgorithm, label: apiAlgorithm };
        })
      : SIGNATURE_ALGORITHMS_OPTIONS.map((option) => ({
          value: option.value as string,
          label: option.label
        }));

    const allowedKeyAlgorithms = templateData.algorithms?.keyAlgorithm?.length
      ? templateData.algorithms.keyAlgorithm.map((templateAlgorithm: string) => {
          const apiAlgorithm = mapPolicyKeyAlgorithmToApi(templateAlgorithm);
          return { value: apiAlgorithm, label: apiAlgorithm };
        })
      : certKeyAlgorithms.map((option) => ({ value: option.value as string, label: option.label }));

    let allowedSubjectAttributeTypes: CertSubjectAttributeType[];
    if (templateData.subject) {
      const subjectTypes: CertSubjectAttributeType[] = [];
      templateData.subject.forEach((subjectPolicy: { type: string }) => {
        if (!subjectTypes.includes(subjectPolicy.type as CertSubjectAttributeType)) {
          subjectTypes.push(subjectPolicy.type as CertSubjectAttributeType);
        }
      });
      allowedSubjectAttributeTypes = subjectTypes;
    } else {
      allowedSubjectAttributeTypes = Object.values(
        CertSubjectAttributeType
      ) as CertSubjectAttributeType[];
    }
    const shouldShowSubjectSection = true;

    let allowedSanTypes: CertSubjectAlternativeNameType[];
    if (templateData.sans) {
      const sanTypes: CertSubjectAlternativeNameType[] = [];
      templateData.sans.forEach((sanPolicy: { type: string }) => {
        if (!sanTypes.includes(sanPolicy.type as CertSubjectAlternativeNameType)) {
          sanTypes.push(sanPolicy.type as CertSubjectAlternativeNameType);
        }
      });
      allowedSanTypes = sanTypes;
    } else {
      allowedSanTypes = Object.values(
        CertSubjectAlternativeNameType
      ) as CertSubjectAlternativeNameType[];
    }
    const shouldShowSanSection = true;

    return {
      allowedKeyUsages,
      allowedExtendedKeyUsages,
      requiredKeyUsages: (templateData.keyUsages?.required || []) as string[],
      requiredExtendedKeyUsages: (templateData.extendedKeyUsages?.required || []) as string[],
      allowedSignatureAlgorithms,
      allowedKeyAlgorithms,
      allowedSubjectAttributeTypes,
      shouldShowSubjectSection,
      allowedSanTypes,
      shouldShowSanSection,
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
  const isAdcsCa = selectedCa?.type === CaType.ADCS;
  // Combined flag for external ADCS CAs - these control validity, key usages, etc. via their templates
  const isExternalAdcsCa = isAzureAdcsCa || isAdcsCa;
  // ACM Public CA issues certificates with a fixed 198-day validity, so pin the TTL default.
  const isAwsAcmPublicCa = selectedCa?.type === CaType.AWS_ACM_PUBLIC_CA;

  const externalCaHint =
    "Validity, key usages, extended key usages and basic constraints are controlled by the external CA's certificate template.";

  // Fetch Azure ADCS templates if needed
  const { data: azureAdcsTemplatesData } = useGetAzureAdcsTemplates({
    caId: watchedCertificateAuthorityId || "",
    isAzureAdcsCa
  });

  const { data: adcsTemplatesData } = useGetAdcsTemplates({
    caId: watchedCertificateAuthorityId || "",
    isAdcsCa
  });

  // Reset step to 0 when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setSelectedStepIndex(0);
    }
  }, [isOpen]);

  useEffect(() => {
    if ((isEdit || isClone) && profile) {
      reset(buildFormValuesFromProfile(profile, Boolean(isClone)));
    }
  }, [isEdit, isClone, profile, reset, allCaData]);

  // Re-apply the saved template once the external CA's templates have loaded (edit/clone).
  useEffect(() => {
    const templatesLoaded =
      (isAzureAdcsCa && azureAdcsTemplatesData?.templates) ||
      (isAdcsCa && adcsTemplatesData?.templates);
    if (
      (isEdit || isClone) &&
      profile &&
      templatesLoaded &&
      profile.externalConfigs &&
      typeof profile.externalConfigs === "object" &&
      profile.externalConfigs !== null &&
      typeof profile.externalConfigs.template === "string"
    ) {
      setValue("externalConfigs.template", profile.externalConfigs.template);
    }
  }, [
    isEdit,
    isClone,
    profile,
    isAzureAdcsCa,
    isAdcsCa,
    azureAdcsTemplatesData,
    adcsTemplatesData,
    setValue
  ]);

  // Pin TTL to 198 days when the selected CA is AWS ACM Public CA — backend rejects any other value.
  // Also re-applies when the user lands on the Defaults tab (policy selected) so the field shows 198
  // even if the TTL Controller was unmounted when the CA first got picked.
  useEffect(() => {
    if (isAwsAcmPublicCa && watchedPolicyId) {
      setValue("defaults.ttlDays", 198, { shouldDirty: true });
    }
  }, [isAwsAcmPublicCa, watchedPolicyId, setValue]);

  const onFormSubmit = async (data: FormData) => {
    if (!currentProject?.id && !isEdit) return;

    // Both AD CS variants require a template on the profile's external config.
    if ((isAzureAdcsCa || isAdcsCa) && !data.externalConfigs?.template?.trim()) {
      createNotification({
        text: `${isAzureAdcsCa ? "Azure ADCS" : "ADCS"} Certificate Authority requires a template to be specified`,
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
        slug: data.slug,
        description: data.description,
        issuerType: data.issuerType,
        caId:
          data.issuerType === IssuerType.SELF_SIGNED
            ? undefined
            : data.certificateAuthorityId || undefined,
        certificatePolicyId: data.certificatePolicyId
      };

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
        title={
          // eslint-disable-next-line no-nested-ternary
          isEdit
            ? "Edit Certificate Profile"
            : isClone
              ? "Clone Certificate Profile"
              : "Create Certificate Profile"
        }
        subTitle={
          // eslint-disable-next-line no-nested-ternary
          isEdit
            ? `Update configuration for ${profile?.slug}`
            : isClone
              ? `Create a new profile based on ${profile?.slug}`
              : "Define the CA and policy used to issue certificates from this profile"
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
                      tooltipText="Choose how certificates are signed. Certificate Authority issues from an existing CA in your organization, which is the standard path for production use. Self-Signed produces standalone certificates with no CA chain, suitable for testing or one-off identities only"
                      isRequired
                      isError={Boolean(error)}
                      errorText={error?.message}
                    >
                      <Select
                        {...field}
                        onValueChange={(value) => {
                          if (value === "self-signed") {
                            setValue("certificateAuthorityId", "");
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
                    render={({ field: { onChange, value }, fieldState: { error } }) => {
                      const hasCas = certificateAuthorities.length > 0;
                      return (
                        <div>
                          <FormControl
                            label="Certificate Authority"
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
                              getOptionLabel={(ca) => ca.name}
                              getOptionValue={(ca) => ca.id}
                              options={certificateAuthorities}
                              groupBy={hasCas ? "groupType" : undefined}
                              getGroupHeaderLabel={hasCas ? getGroupHeaderLabel : undefined}
                              placeholder="Select a certificate authority"
                              isDisabled={Boolean(isEdit)}
                              className="w-full"
                            />
                          </FormControl>
                          {!hasCas && (
                            <p className="-mt-2 mb-4 text-xs text-yellow-500">
                              No certificate authorities available.{" "}
                              <Link
                                to="/organizations/$orgId/projects/cert-manager/$projectId/certificate-authorities"
                                params={{ orgId: orgId ?? "", projectId: projectId ?? "" }}
                                className="underline hover:text-yellow-400"
                              >
                                Create one in Certificate Authorities
                              </Link>
                            </p>
                          )}
                        </div>
                      );
                    }}
                  />
                )}

                {isAzureAdcsCa && (
                  <ExternalCaTemplateSelect
                    control={control}
                    templates={azureAdcsTemplatesData?.templates || []}
                    valueKey="id"
                    placeholder="Select an Azure ADCS certificate template"
                  />
                )}

                {isAdcsCa && (
                  <ExternalCaTemplateSelect
                    control={control}
                    templates={adcsTemplatesData?.templates || []}
                    valueKey="name"
                    placeholder="Select an ADCS certificate template"
                  />
                )}

                <Controller
                  control={control}
                  name="certificatePolicyId"
                  render={({ field: { onChange, value }, fieldState: { error } }) => (
                    <FormControl
                      label="Certificate Policy"
                      tooltipText="The rules that govern certificates issued from this profile — allowed key/signature algorithms, key usages, TTL bounds, and subject constraints. Pick an existing policy or create a new one to enforce your organization's standards."
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
              </Tab.Panel>

              {/* Tab 2: Certificate Defaults */}
              <Tab.Panel>
                {!watchedPolicyId ? (
                  <EmptyState title="Select a certificate policy on the Configuration tab to configure defaults." />
                ) : (
                  <div>
                    <p className="mb-4 text-sm text-bunker-300">
                      Set default values for certificates issued under this profile. These defaults
                      are used when a certificate request does not specify its own values.
                    </p>
                    {/* TTL — simple days number input (hidden for ADCS CAs) */}
                    {!isExternalAdcsCa && (
                      <Controller
                        name="defaults.ttlDays"
                        control={control}
                        render={({ field, fieldState: { error } }) => (
                          <FormControl
                            label={
                              <FormLabel
                                label="Time to Live (TTL) in Days"
                                icon={
                                  <Tooltip
                                    content={
                                      isAwsAcmPublicCa
                                        ? "AWS ACM Public CA issues certificates with a fixed 198-day validity — this field cannot be changed."
                                        : "Fallback validity period used when not explicitly specified in certificate request. Leave empty for no TTL default."
                                    }
                                  >
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
                              isDisabled={isAwsAcmPublicCa}
                              onChange={(e) => {
                                const val = e.target.value;
                                field.onChange(val === "" ? null : Number(val));
                              }}
                            />
                          </FormControl>
                        )}
                      />
                    )}

                    {/* Subject Attributes — only if policy allows subject fields */}
                    {policyConstraints.shouldShowSubjectSection && (
                      <SubjectAttributesField
                        control={control}
                        allowedAttributeTypes={policyConstraints.allowedSubjectAttributeTypes}
                        namePrefix="defaults.subjectAttributes"
                      />
                    )}

                    {/* Subject Alternative Names — only if policy allows SANs */}
                    {policyConstraints.shouldShowSanSection && (
                      <SubjectAltNamesField
                        control={control}
                        allowedSanTypes={policyConstraints.allowedSanTypes}
                        namePrefix="defaults.subjectAltNames"
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
                        hideSignatureAlgorithm={isExternalAdcsCa}
                      />
                    )}

                    {isExternalAdcsCa && (
                      <p className="mb-4 text-xs text-mineshaft-400">{externalCaHint}</p>
                    )}

                    {/* Key Usages, Ext Key Usages, Basic Constraints — in Accordion (hidden for ADCS CAs) */}
                    {!isExternalAdcsCa &&
                      (filteredKeyUsages.length > 0 ||
                        filteredExtendedKeyUsages.length > 0 ||
                        policyConstraints.templateAllowsCA) && (
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
                                                field.onChange(null);
                                              } else {
                                                const numVal = parseInt(val, 10);
                                                field.onChange(
                                                  Number.isNaN(numVal) ? null : numVal
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
                      )}
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
              isDisabled={createProfile.isPending || updateProfile.isPending}
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
