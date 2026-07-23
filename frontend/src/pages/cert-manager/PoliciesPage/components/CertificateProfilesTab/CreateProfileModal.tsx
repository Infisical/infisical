import { useEffect, useMemo, useState } from "react";
import { Control, Controller, useForm } from "react-hook-form";
import { SingleValue } from "react-select";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { FileBadge } from "lucide-react";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  DocumentationLinkBadge,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  FilterableSelect,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  Stepper,
  StepperList,
  StepperStep,
  TextArea
} from "@app/components/v3";
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
import { filterUsages } from "@app/pages/cert-manager/CertificatesPage/components/certificateUtils";
import {
  CertPolicyState,
  CertSubjectAlternativeNameType,
  CertSubjectAttributeType,
  mapPolicyKeyAlgorithmToApi,
  mapPolicySignatureAlgorithmToApi
} from "@app/pages/cert-manager/PoliciesPage/components/CertificatePoliciesTab/shared/certificate-constants";

import { PkiDocsUrls } from "../../../pki-docs-urls";
import { CreatePolicyModal } from "../CertificatePoliciesTab/CreatePolicyModal";
import { PolicyConstraints, ProfileDefaultsStep } from "./CreateProfileModal/ProfileDefaultsStep";
import { CertificatePolicyOption } from "./CertificatePolicyOption";

const certificateDefaultsSchema = z
  .object({
    ttlDays: z.number().min(1).nullable().optional(),
    subjectAttributes: z
      .array(
        z.object({
          type: z.nativeEnum(CertSubjectAttributeType),
          value: z.string()
        })
      )
      .optional(),
    subjectAltNames: z
      .array(
        z.object({
          type: z.nativeEnum(CertSubjectAlternativeNameType),
          value: z.string()
        })
      )
      .optional(),
    signatureAlgorithm: z.string().nullable().optional(),
    keyAlgorithm: z.string().nullable().optional(),
    keyUsages: z.record(z.boolean().optional()).optional(),
    extendedKeyUsages: z.record(z.boolean().optional()).optional(),
    basicConstraints: z
      .object({
        isCA: z
          .boolean()
          .nullish()
          .transform((v) => v ?? false),
        pathLength: z.number().min(0).nullable().optional()
      })
      .nullable()
      .optional()
  })
  .optional();

const STEPS = [
  {
    name: "Details",
    key: "details",
    shortDescription: "Name and description",
    title: "Details",
    subtitle: "Name this profile and describe what it is used for.",
    rightLabel: "DETAILS",
    rightDescription:
      "A clear name and description help your team identify what this profile issues. The name is used to reference the profile when requesting certificates.",
    fields: ["slug", "description"] as string[]
  },
  {
    name: "Issuer",
    key: "issuer",
    shortDescription: "CA and policy",
    title: "Issuer",
    subtitle: "Choose how certificates are issued and which policy governs them.",
    rightLabel: "ISSUER",
    rightDescription:
      "Choose this profile's issuer. A Certificate Authority issues from an existing CA in your organization, while Self-Signed produces standalone certificates. The certificate policy defines the rules every certificate issued from this profile must satisfy.",
    fields: [
      "issuerType",
      "certificateAuthorityId",
      "certificatePolicyId",
      "externalConfigs"
    ] as string[]
  },
  {
    name: "Certificate Defaults",
    key: "certificate-defaults",
    shortDescription: "Default values",
    title: "Certificate Defaults",
    subtitle: "Set default values applied when a request omits its own.",
    rightLabel: "CERTIFICATE DEFAULTS",
    rightDescription:
      "These defaults pre-fill certificate requests issued from this profile. A request can override any of them, within the bounds of the selected policy. Leave a field empty to apply no default.",
    fields: ["defaults"] as string[]
  }
] as const;

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

const baseProfileSchema = z.object({
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
});

const applyIssuerRefinements = <T extends z.ZodTypeAny>(schema: T) =>
  schema
    .refine(
      (data: { issuerType: IssuerType; certificateAuthorityId?: string | null }) => {
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
      (data: { issuerType: IssuerType; certificateAuthorityId?: string | null }) => {
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

const createSchema = applyIssuerRefinements(baseProfileSchema);

const editSchema = applyIssuerRefinements(
  baseProfileSchema.extend({
    certificatePolicyId: z.string().optional(),
    externalConfigs: z
      .object({
        template: z.string().optional()
      })
      .optional()
  })
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
      <Field>
        <FieldLabel>
          Windows ADCS Template <span className="text-danger">*</span>
        </FieldLabel>
        <FieldContent>
          <FilterableSelect
            value={
              templates.find((template) => template[valueKey] === value) ||
              (value ? { id: value, name: value } : null)
            }
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
            isError={Boolean(error)}
            className="w-full"
          />
          <FieldError errors={[error]} />
        </FieldContent>
      </Field>
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
    formDefaults.subjectAttributes.forEach(
      (attr: { type: CertSubjectAttributeType; value: string }) => {
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
      }
    );
    if (domainComponents.length > 0) {
      result.domainComponents = domainComponents;
    }
  }

  if (formDefaults.subjectAltNames && formDefaults.subjectAltNames.length > 0) {
    const sans = formDefaults.subjectAltNames.filter(
      (san: { type: CertSubjectAlternativeNameType; value: string }) => san.value?.trim()
    );
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
  const currentStep = STEPS[selectedStepIndex];

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
  const isFinalStep = selectedStepIndex === STEPS.length - 1;

  const certificateAuthorities = (allCaData || []).map((ca) => ({
    ...ca,
    groupType: ca.type === CaType.INTERNAL ? "internal" : "external"
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
  const { data: selectedPolicyData } = useGetCertificatePolicyById({
    policyId: watchedPolicyId || ""
  });

  const policyConstraints = useMemo<PolicyConstraints>(() => {
    if (!selectedPolicyData) {
      return {
        allowedKeyUsages: [],
        allowedExtendedKeyUsages: [],
        requiredKeyUsages: [],
        requiredExtendedKeyUsages: [],
        allowedSignatureAlgorithms: [],
        allowedKeyAlgorithms: [],
        allowedSubjectAttributeTypes: [],
        shouldShowSubjectSection: false,
        allowedSanTypes: [],
        shouldShowSanSection: false,
        policyAllowsCA: false,
        maxPathLength: undefined
      };
    }

    const isCaPolicy =
      (selectedPolicyData.basicConstraints?.isCA as CertPolicyState) || CertPolicyState.DENIED;
    const policyAllowsCA =
      isCaPolicy === CertPolicyState.ALLOWED || isCaPolicy === CertPolicyState.REQUIRED;

    const hasKeyUsagePolicy = Boolean(selectedPolicyData.keyUsages);
    const allowedKeyUsages = hasKeyUsagePolicy
      ? [
          ...(selectedPolicyData.keyUsages?.required || []),
          ...(selectedPolicyData.keyUsages?.allowed || [])
        ]
      : KEY_USAGES_OPTIONS.map((option) => option.value);

    const hasExtendedKeyUsagePolicy = Boolean(selectedPolicyData.extendedKeyUsages);
    const allowedExtendedKeyUsages = hasExtendedKeyUsagePolicy
      ? [
          ...(selectedPolicyData.extendedKeyUsages?.required || []),
          ...(selectedPolicyData.extendedKeyUsages?.allowed || [])
        ]
      : EXTENDED_KEY_USAGES_OPTIONS.map((option) => option.value);

    const allowedSignatureAlgorithms = selectedPolicyData.algorithms?.signature?.length
      ? selectedPolicyData.algorithms.signature.map((policyAlgorithm: string) => {
          const apiAlgorithm = mapPolicySignatureAlgorithmToApi(policyAlgorithm);
          return { value: apiAlgorithm, label: apiAlgorithm };
        })
      : SIGNATURE_ALGORITHMS_OPTIONS.map((option) => ({
          value: option.value as string,
          label: option.label
        }));

    const allowedKeyAlgorithms = selectedPolicyData.algorithms?.keyAlgorithm?.length
      ? selectedPolicyData.algorithms.keyAlgorithm.map((policyAlgorithm: string) => {
          const apiAlgorithm = mapPolicyKeyAlgorithmToApi(policyAlgorithm);
          return { value: apiAlgorithm, label: apiAlgorithm };
        })
      : certKeyAlgorithms.map((option) => ({ value: option.value as string, label: option.label }));

    let allowedSubjectAttributeTypes: CertSubjectAttributeType[];
    if (selectedPolicyData.subject) {
      const subjectTypes: CertSubjectAttributeType[] = [];
      selectedPolicyData.subject.forEach((subjectPolicy: { type: string }) => {
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
    if (selectedPolicyData.sans) {
      const sanTypes: CertSubjectAlternativeNameType[] = [];
      selectedPolicyData.sans.forEach((sanPolicy: { type: string }) => {
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
      requiredKeyUsages: (selectedPolicyData.keyUsages?.required || []) as string[],
      requiredExtendedKeyUsages: (selectedPolicyData.extendedKeyUsages?.required || []) as string[],
      allowedSignatureAlgorithms,
      allowedKeyAlgorithms,
      allowedSubjectAttributeTypes,
      shouldShowSubjectSection,
      allowedSanTypes,
      shouldShowSanSection,
      policyAllowsCA,
      maxPathLength: selectedPolicyData.basicConstraints?.maxPathLength as number | undefined
    };
  }, [selectedPolicyData]);

  const selectedCa = certificateAuthorities.find((ca) => ca.id === watchedCertificateAuthorityId);
  const isAzureAdcsCa = selectedCa?.type === CaType.AZURE_AD_CS;
  const isAdcsCa = selectedCa?.type === CaType.ADCS;
  // ACM Public CA issues certificates with a fixed 198-day validity, so pin the TTL default.
  const isAwsAcmPublicCa = selectedCa?.type === CaType.AWS_ACM_PUBLIC_CA;

  const { data: azureAdcsTemplatesData } = useGetAzureAdcsTemplates({
    caId: watchedCertificateAuthorityId || "",
    isAzureAdcsCa
  });

  const { data: adcsTemplatesData } = useGetAdcsTemplates({
    caId: watchedCertificateAuthorityId || "",
    isAdcsCa
  });

  useEffect(() => {
    if (isOpen) {
      setSelectedStepIndex(0);
    }
  }, [isOpen]);

  useEffect(() => {
    if ((isEdit || isClone) && profile) {
      reset(buildFormValuesFromProfile(profile, Boolean(isClone)));
    }
  }, [isEdit, isClone, profile, reset]);

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

  // Pin TTL to 198 days when the selected CA is AWS ACM Public CA. Backend rejects any other value.
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

    let effectiveDefaults = data.defaults;
    if (effectiveDefaults) {
      const nextDefaults = { ...effectiveDefaults };
      if (policyConstraints.requiredKeyUsages.length) {
        const keyUsages = { ...(nextDefaults.keyUsages || {}) };
        policyConstraints.requiredKeyUsages.forEach((usage) => {
          keyUsages[usage] = true;
        });
        nextDefaults.keyUsages = keyUsages;
      }
      if (policyConstraints.requiredExtendedKeyUsages.length) {
        const extendedKeyUsages = { ...(nextDefaults.extendedKeyUsages || {}) };
        policyConstraints.requiredExtendedKeyUsages.forEach((usage) => {
          extendedKeyUsages[usage] = true;
        });
        nextDefaults.extendedKeyUsages = extendedKeyUsages;
      }
      effectiveDefaults = nextDefaults;
    }

    const serializedDefaults = convertFormToDefaults(effectiveDefaults);

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

  const isStepValid = async (index: number) => {
    const { fields } = STEPS[index];
    if (fields.length === 0) return true;
    return trigger(fields as any);
  };

  const goNext = async () => {
    const isValid = await isStepValid(selectedStepIndex);
    if (!isValid) return;
    setSelectedStepIndex((prev) => Math.min(prev + 1, STEPS.length - 1));
  };

  const goBack = () => {
    if (selectedStepIndex > 0) setSelectedStepIndex((prev) => prev - 1);
  };

  const handleClose = () => {
    handlePopUpToggle("createPolicy", false);
    reset();
    setSelectedStepIndex(0);
    onClose();
  };

  const isSubmitting = createProfile.isPending || updateProfile.isPending;

  return (
    <Sheet
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          handleClose();
        }
      }}
    >
      <SheetContent className="flex h-full max-h-full flex-col gap-y-0 p-0 sm:max-w-[1100px]">
        <SheetHeader className="border-b border-border">
          <SheetTitle>
            <div className="flex w-full items-start gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-project/10 text-project">
                <FileBadge className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-x-2 text-foreground">
                  {/* eslint-disable-next-line no-nested-ternary */}
                  {isEdit
                    ? "Edit Certificate Profile"
                    : isClone
                      ? "Clone Certificate Profile"
                      : "Create Certificate Profile"}
                  <DocumentationLinkBadge href={PkiDocsUrls.settings.profiles} />
                </div>
                <p className="text-sm leading-4 text-muted">
                  {/* eslint-disable-next-line no-nested-ternary */}
                  {isEdit
                    ? `Update configuration for ${profile?.slug}`
                    : isClone
                      ? `Create a new profile based on ${profile?.slug}`
                      : "Define the CA and policy used to issue certificates from this profile"}
                </p>
              </div>
            </div>
          </SheetTitle>
        </SheetHeader>

        <form onSubmit={(e) => e.preventDefault()} className="flex min-h-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 overflow-hidden">
            <aside className="flex w-60 shrink-0 flex-col border-r border-border px-5 py-6">
              <p className="mb-5 text-[11px] font-medium tracking-wider text-muted uppercase">
                Setup steps
              </p>
              <Stepper
                activeStep={selectedStepIndex}
                orientation="vertical"
                onStepChange={(i) => {
                  if (i < selectedStepIndex) setSelectedStepIndex(i);
                }}
              >
                <StepperList>
                  {STEPS.map((s, i) => (
                    <StepperStep
                      key={s.key}
                      index={i}
                      title={s.name}
                      description={s.shortDescription}
                    />
                  ))}
                </StepperList>
              </Stepper>
            </aside>

            <div className="flex min-w-0 flex-1 flex-col gap-y-2 overflow-y-auto px-8 py-6">
              <div className="mb-6">
                <h2 className="text-lg font-semibold text-foreground">{currentStep.title}</h2>
                <p className="mt-1 text-sm text-muted">{currentStep.subtitle}</p>
              </div>

              {selectedStepIndex === 0 && (
                <div className="space-y-5">
                  <Controller
                    control={control}
                    name="slug"
                    render={({ field, fieldState: { error } }) => (
                      <Field>
                        <FieldLabel>
                          Name <span className="text-danger">*</span>
                        </FieldLabel>
                        <FieldContent>
                          <Input
                            {...field}
                            placeholder="your-profile-name"
                            isError={Boolean(error)}
                          />
                          <FieldError errors={[error]} />
                        </FieldContent>
                      </Field>
                    )}
                  />

                  <Controller
                    control={control}
                    name="description"
                    render={({ field, fieldState: { error } }) => (
                      <Field>
                        <FieldLabel>Description</FieldLabel>
                        <FieldContent>
                          <TextArea
                            {...field}
                            value={field.value ?? ""}
                            placeholder="Enter profile description"
                            rows={3}
                            isError={Boolean(error)}
                          />
                          <FieldError errors={[error]} />
                        </FieldContent>
                      </Field>
                    )}
                  />
                </div>
              )}

              {selectedStepIndex === 1 && (
                <div className="space-y-5">
                  <Controller
                    control={control}
                    name="issuerType"
                    render={({ field: { onChange, value }, fieldState: { error } }) => (
                      <Field>
                        <FieldLabel>
                          Issuer Type <span className="text-danger">*</span>
                        </FieldLabel>
                        <FieldContent>
                          <Select
                            value={value}
                            disabled={Boolean(isEdit)}
                            onValueChange={(next) => {
                              if (next === IssuerType.SELF_SIGNED) {
                                setValue("certificateAuthorityId", "");
                              }
                              onChange(next);
                            }}
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent position="popper">
                              <SelectItem value={IssuerType.CA}>Certificate Authority</SelectItem>
                              <SelectItem value={IssuerType.SELF_SIGNED}>Self-Signed</SelectItem>
                            </SelectContent>
                          </Select>
                          <FieldDescription>
                            Certificate Authority issues from an existing CA in your organization,
                            which is the standard path for production use. Self-Signed produces
                            standalone certificates with no CA chain, suitable for testing or
                            one-off identities only.
                          </FieldDescription>
                          <FieldError errors={[error]} />
                        </FieldContent>
                      </Field>
                    )}
                  />

                  {watchedIssuerType === IssuerType.CA && (
                    <Controller
                      control={control}
                      name="certificateAuthorityId"
                      render={({ field: { onChange, value }, fieldState: { error } }) => {
                        const hasCas = certificateAuthorities.length > 0;
                        return (
                          <Field>
                            <FieldLabel>
                              Certificate Authority <span className="text-danger">*</span>
                            </FieldLabel>
                            <FieldContent>
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
                                isError={Boolean(error)}
                                className="w-full"
                              />
                              <FieldError errors={[error]} />
                              {!hasCas && (
                                <FieldDescription className="text-yellow-500">
                                  No certificate authorities available.{" "}
                                  <Link
                                    to="/organizations/$orgId/projects/cert-manager/$projectId/certificate-authorities"
                                    params={{ orgId: orgId ?? "", projectId: projectId ?? "" }}
                                    className="underline hover:text-yellow-400"
                                  >
                                    Create one in Certificate Authorities
                                  </Link>
                                </FieldDescription>
                              )}
                            </FieldContent>
                          </Field>
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
                      <Field>
                        <FieldLabel>
                          Certificate Policy <span className="text-danger">*</span>
                        </FieldLabel>
                        <FieldContent>
                          <FilterableSelect
                            value={certificatePolicies.find((p) => p.id === value) ?? null}
                            onChange={(newValue) => {
                              const selected = newValue as SingleValue<PolicyOption>;
                              if (selected?.id === "_create") {
                                handlePopUpOpen("createPolicy");
                                return;
                              }
                              onChange(selected?.id || "");

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
                            isError={Boolean(error)}
                            components={{ Option: CertificatePolicyOption }}
                            className="w-full"
                          />
                          <FieldDescription>
                            The rules that govern certificates issued from this profile: allowed
                            key/signature algorithms, key usages, TTL bounds, and subject
                            constraints.
                          </FieldDescription>
                          <FieldError errors={[error]} />
                        </FieldContent>
                      </Field>
                    )}
                  />
                </div>
              )}

              {selectedStepIndex === 2 && (
                <ProfileDefaultsStep
                  control={control}
                  watch={watch}
                  setValue={setValue}
                  policyConstraints={policyConstraints}
                  isAwsAcmPublicCa={isAwsAcmPublicCa}
                />
              )}
            </div>

            <aside className="hidden w-80 shrink-0 flex-col gap-4 overflow-y-auto border-l border-border px-6 py-6 lg:flex">
              <div className="mb-auto">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-medium tracking-wider text-muted uppercase">
                    Step {selectedStepIndex + 1} · {currentStep.rightLabel}
                  </p>
                  <DocumentationLinkBadge href={PkiDocsUrls.settings.profiles} />
                </div>
                <p className="mt-4 text-sm font-semibold text-foreground">What this step does</p>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  {currentStep.rightDescription}
                </p>
              </div>
            </aside>
          </div>

          <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border px-6 py-4">
            <span className="text-xs text-muted" />
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted">
                Step {selectedStepIndex + 1} of {STEPS.length}
              </span>
              {selectedStepIndex > 0 && (
                <Button type="button" variant="outline" onClick={goBack}>
                  Back
                </Button>
              )}
              {isFinalStep ? (
                <Button
                  key="submit-cta"
                  type="button"
                  variant="project"
                  isPending={isSubmitting}
                  isDisabled={isSubmitting}
                  onClick={handleSubmit(onFormSubmit, (errors) => {
                    const errorKeys = Object.keys(errors);
                    const stepIndex = STEPS.findIndex((s) =>
                      s.fields.some((fld) => errorKeys.includes(fld))
                    );
                    if (stepIndex >= 0) setSelectedStepIndex(stepIndex);
                    createNotification({
                      text: "Please fix the highlighted errors before saving.",
                      type: "error"
                    });
                  })}
                >
                  {isEdit ? "Save Changes" : "Create Profile"}
                </Button>
              ) : (
                <Button key="continue-cta" type="button" variant="project" onClick={goNext}>
                  Continue
                </Button>
              )}
            </div>
          </div>
        </form>
      </SheetContent>

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
    </Sheet>
  );
};
