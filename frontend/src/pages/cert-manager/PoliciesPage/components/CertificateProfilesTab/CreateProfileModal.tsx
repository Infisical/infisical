import { useEffect, useMemo, useRef, useState } from "react";
import { Control, Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import axios from "axios";
import { Check, ShieldCheck } from "lucide-react";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Combobox,
  DiscardChangesAlertDialog,
  DocumentationLinkBadge,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldFeedback,
  FieldLabel,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Stepper,
  StepperList,
  StepperStep,
  TextArea
} from "@app/components/v3";
import { cn } from "@app/components/v3/utils";
import { useProject, useProjectPermission } from "@app/context";
import {
  ProjectPermissionCertificatePolicyActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import { caSupportsCapability } from "@app/hooks/api/ca/constants";
import { CaCapability, CaType } from "@app/hooks/api/ca/enums";
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
  TCertificateProfile,
  TCertificateProfileDefaults,
  TCertificateProfileWithDetails,
  TCreateCertificateProfileDTO,
  TUpdateCertificateProfileDTO,
  useCreateCertificateProfile,
  useUpdateCertificateProfile
} from "@app/hooks/api/certificateProfiles";
import { TProfileCustomExtension } from "@app/hooks/api/certificateProfiles/types";
import {
  certKeyAlgorithms,
  EXTENDED_KEY_USAGES_OPTIONS,
  KEY_USAGES_OPTIONS,
  SIGNATURE_ALGORITHMS_OPTIONS
} from "@app/hooks/api/certificates/constants";
import { ApiErrorTypes } from "@app/hooks/api/types";
import { useDiscardChangesGuard } from "@app/hooks/useDiscardChangesGuard";
import { normalizeSlugInput } from "@app/lib/schemas";
import { filterUsages } from "@app/pages/cert-manager/CertificatesPage/components/certificateUtils";
import { useCaCreation } from "@app/pages/cert-manager/components/useCaCreation";
import {
  CertPolicyState,
  CertSubjectAlternativeNameType,
  CertSubjectAttributeType,
  mapPolicyKeyAlgorithmToApi,
  mapPolicySignatureAlgorithmToApi
} from "@app/pages/cert-manager/PoliciesPage/components/CertificatePoliciesTab/shared/certificate-constants";

import { PkiDocsUrls } from "../../../pki-docs-urls";
import {
  CERTIFICATE_POLICY_STEPS,
  CertificatePolicyWizard,
  CertificatePolicyWizardHandle
} from "../CertificatePoliciesTab/CreatePolicyModal";
import { PolicyConstraints, ProfileDefaultsStep } from "./CreateProfileModal/ProfileDefaultsStep";

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
    customExtensions: z
      .array(
        z.object({
          oid: z.string(),
          label: z.string().optional(),
          critical: z.boolean().optional(),
          value: z.string().optional()
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

const descriptionSchema = z
  .string()
  .trim()
  .max(255, "Description must be less than 255 characters")
  .optional();

const baseProfileSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(1, "Name is required")
    .max(255, "Name must be 255 characters or fewer")
    .regex(/^[a-z0-9-]+$/, "Name can only contain lowercase letters, numbers, and hyphens"),
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
    render={({ field: { onChange, value, ref, onBlur, name }, fieldState: { error } }) => (
      <Field>
        <FieldLabel>
          Windows ADCS Template <span className="text-danger">*</span>
        </FieldLabel>
        <FieldContent>
          <Combobox
            ref={ref}
            name={name}
            onBlur={onBlur}
            value={
              templates.find((template) => template[valueKey] === value) ||
              (value ? { id: value, name: value } : null)
            }
            onValueChange={(selected) => {
              onChange(selected?.[valueKey] || "");
            }}
            getOptionLabel={(template) => template.name}
            getOptionValue={(template) => template[valueKey]}
            options={templates}
            placeholder={placeholder}
            isError={Boolean(error)}
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
    customExtensions:
      defaults.customExtensions && defaults.customExtensions.length > 0
        ? defaults.customExtensions
        : undefined,
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

  if (formDefaults.customExtensions) {
    const declared = formDefaults.customExtensions
      .filter((extension: TProfileCustomExtension) => extension.oid?.trim())
      .map((extension: TProfileCustomExtension) => ({
        oid: extension.oid.trim(),
        ...(extension.label?.trim() && { label: extension.label.trim() }),
        ...(extension.critical !== undefined && { critical: extension.critical }),
        ...(extension.value?.trim() && { value: extension.value.trim() })
      }));
    if (declared.length > 0) result.customExtensions = declared;
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

const getSubStepStatus = (index: number, activeStep: number) => {
  if (index < activeStep) return "complete";
  if (index === activeStep) return "current";
  return "pending";
};

const PolicySubSteps = ({ activeStep, onCancel }: { activeStep: number; onCancel: () => void }) => (
  <li className="-mt-6 mb-8 ml-3.5 border-l border-border pl-5">
    <p className="mb-3 text-[10px] font-medium tracking-wider text-muted uppercase">New policy</p>
    <ol className="flex flex-col gap-y-2.5">
      {CERTIFICATE_POLICY_STEPS.map((s, i) => {
        const status = getSubStepStatus(i, activeStep);
        return (
          <li key={s.name} className="flex items-center gap-2.5">
            <span
              className={cn(
                "flex size-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-medium",
                status === "complete" && "border-success bg-success/10 text-success",
                status === "current" && "border-warning bg-warning/10 text-warning",
                status === "pending" && "border-border bg-container text-muted"
              )}
            >
              {status === "complete" ? <Check className="size-2.5" strokeWidth={3} /> : i + 1}
            </span>
            <span
              className={cn("text-xs", status === "pending" ? "text-muted" : "text-foreground")}
            >
              {s.name}
            </span>
          </li>
        );
      })}
    </ol>
    <button
      type="button"
      onClick={onCancel}
      className="mt-4 cursor-pointer text-left text-xs text-muted underline-offset-2 hover:text-foreground hover:underline"
    >
      Use an existing policy
    </button>
  </li>
);

interface Props {
  isOpen: boolean;
  onClose: () => void;
  profile?: TCertificateProfileWithDetails;
  mode?: "create" | "edit" | "clone";
  onComplete?: (profile: TCertificateProfile) => void | Promise<void>;
  validateSlug?: (slug: string) => string | undefined;
}

type ProfileFormProps = Props & {
  initialSlug?: string;
  onCancel: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  onPendingChange?: (pending: boolean) => void;
};

export const CreateProfileForm = ({
  isOpen,
  onClose,
  profile,
  mode = "create",
  onComplete,
  initialSlug = "",
  validateSlug,
  onCancel,
  onDirtyChange,
  onPendingChange
}: ProfileFormProps) => {
  const { currentProject } = useProject();
  const { permission } = useProjectPermission();
  const { orgId } = useParams({ strict: false }) as { orgId?: string };
  const [policyStepIndex, setPolicyStepIndex] = useState<number | null>(null);
  const [isPolicySubmitting, setIsPolicySubmitting] = useState(false);
  const [savedProfile, setSavedProfile] = useState<TCertificateProfile | null>(null);
  const [completionError, setCompletionError] = useState<string>();
  const [isCompleting, setIsCompleting] = useState(false);
  const policyWizardRef = useRef<CertificatePolicyWizardHandle>(null);
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

  const steps = useMemo(() => (isEdit ? STEPS.filter((s) => s.key !== "issuer") : STEPS), [isEdit]);
  const currentStep = steps[selectedStepIndex];
  const isFinalStep = selectedStepIndex === steps.length - 1;

  const certificateAuthorities = (allCaData || []).map((ca) => ({
    ...ca,
    groupType: ca.type === CaType.INTERNAL ? "internal" : "external"
  }));
  const certificatePolicies = policyData?.certificatePolicies || [];

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

  const {
    control,
    handleSubmit,
    reset,
    watch,
    setValue,
    setError,
    trigger,
    formState: { isDirty, isSubmitting: isFormSubmitting }
  } = useForm<FormData>({
    mode: "onTouched",
    resolver: zodResolver(isEdit ? editSchema : createSchema),
    defaultValues:
      (isEdit || isClone) && profile
        ? buildFormValuesFromProfile(profile, Boolean(isClone))
        : {
            slug: normalizeSlugInput(initialSlug),
            description: "",
            issuerType: IssuerType.CA,
            certificateAuthorityId: "",
            certificatePolicyId: "",
            externalConfigs: undefined,
            defaults: {}
          }
  });

  const watchedSlug = watch("slug");
  const watchedIssuerType = watch("issuerType");
  const watchedCertificateAuthorityId = watch("certificateAuthorityId");
  const { creation: caCreation, caCreationModals } = useCaCreation<
    (typeof certificateAuthorities)[number]
  >((ca) => {
    if (ca.id !== watchedCertificateAuthorityId) setValue("externalConfigs", undefined);
    setValue("certificateAuthorityId", ca.id, { shouldDirty: true, shouldValidate: true });
  });
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
        allowedCustomExtensions: null,
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
      allowedCustomExtensions: selectedPolicyData.customExtensions
        ? selectedPolicyData.customExtensions.filter((rule) => rule.oid)
        : null,
      policyAllowsCA,
      maxPathLength: selectedPolicyData.basicConstraints?.maxPathLength as number | undefined
    };
  }, [selectedPolicyData]);

  const selectedCa = certificateAuthorities.find((ca) => ca.id === watchedCertificateAuthorityId);
  // Only internal CAs sign with a key Infisical holds; an external CA's signing key is its own concern.
  const caKeyAlgorithm =
    selectedCa?.type === CaType.INTERNAL ? selectedCa.configuration.keyAlgorithm : undefined;
  const isAzureAdcsCa = selectedCa?.type === CaType.AZURE_AD_CS;
  const isAdcsCa = selectedCa?.type === CaType.ADCS;
  // ACM Public CA issues certificates with a fixed 198-day validity, so pin the TTL default.
  const isAwsAcmPublicCa = selectedCa?.type === CaType.AWS_ACM_PUBLIC_CA;
  const caSupportsCustomExtensions =
    watchedIssuerType === IssuerType.SELF_SIGNED
      ? true
      : !!selectedCa && caSupportsCapability(selectedCa.type, CaCapability.CUSTOM_EXTENSIONS);

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
      setSavedProfile(null);
      setCompletionError(undefined);
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

  const saveProfile = async (data: FormData) => {
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
    if (effectiveDefaults && (isAzureAdcsCa || isAdcsCa)) {
      const adcsSafeDefaults = { ...effectiveDefaults };
      delete adcsSafeDefaults.ttlDays;
      delete adcsSafeDefaults.signatureAlgorithm;
      delete adcsSafeDefaults.keyUsages;
      delete adcsSafeDefaults.extendedKeyUsages;
      delete adcsSafeDefaults.basicConstraints;
      effectiveDefaults = adcsSafeDefaults;
    }
    if (effectiveDefaults && !caSupportsCustomExtensions) {
      const withoutCustomExtensions = { ...effectiveDefaults };
      delete withoutCustomExtensions.customExtensions;
      effectiveDefaults = withoutCustomExtensions;
    }
    if (effectiveDefaults && !(isAzureAdcsCa || isAdcsCa)) {
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
        throw new Error("Certificate Manager could not be loaded. Please refresh and try again.");
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

      const createdProfile = savedProfile ?? (await createProfile.mutateAsync(createData));
      setIsCompleting(true);
      if (!savedProfile) {
        setSavedProfile(createdProfile);
        reset(data);
      }
      setCompletionError(undefined);
      try {
        await onComplete?.(createdProfile);
      } catch (error) {
        setCompletionError(
          error instanceof Error
            ? error.message
            : "The profile was created, but setup could not finish. Retry to continue."
        );
        return;
      } finally {
        setIsCompleting(false);
      }
    }

    createNotification({
      text: `Certificate profile ${isEdit ? "updated" : "created"} successfully`,
      type: "success"
    });

    reset();
    onClose();
  };

  const onFormSubmit = async (data: FormData) => {
    const slugError = savedProfile ? undefined : validateSlug?.(data.slug);
    if (slugError) {
      setSelectedStepIndex(0);
      setError("slug", { type: "permission", message: slugError });
      return;
    }
    try {
      await saveProfile(data);
    } catch (error) {
      if (!axios.isAxiosError(error) || error.response?.data?.error !== ApiErrorTypes.ConflictError)
        throw error;
      setSelectedStepIndex(0);
      setError("slug", { type: "server", message: error.response.data?.message });
    }
  };

  const isStepValid = async (index: number) => {
    const { fields } = steps[index];
    if (fields.length === 0) return true;
    return trigger(fields as any, { shouldFocus: true });
  };

  const goNext = async () => {
    const isValid = await isStepValid(selectedStepIndex);
    if (!isValid) {
      createNotification({
        text: "Please fix the highlighted fields before continuing.",
        type: "error"
      });
      return;
    }
    setSelectedStepIndex((prev) => Math.min(prev + 1, steps.length - 1));
  };

  const goBack = () => {
    if (selectedStepIndex > 0) setSelectedStepIndex((prev) => prev - 1);
  };

  const handleClose = () => {
    onCancel();
  };

  const isSubmitting =
    isCompleting || isFormSubmitting || createProfile.isPending || updateProfile.isPending;
  let submitLabel = isEdit ? "Save Changes" : "Create Profile";
  if (savedProfile) submitLabel = completionError ? "Retry Setup" : "Complete Setup";

  const isPolicyWizardOpen = policyStepIndex !== null;
  const isFinalPolicyStep = policyStepIndex === CERTIFICATE_POLICY_STEPS.length - 1;
  const activePolicyStep = isPolicyWizardOpen ? CERTIFICATE_POLICY_STEPS[policyStepIndex] : null;
  const draftPolicyName = watchedSlug ? `${watchedSlug}-policy` : "";
  const goBackInPolicy = () => {
    setPolicyStepIndex((prev) => (prev === null || prev === 0 ? null : prev - 1));
  };

  const goNextInPolicy = async () => {
    if (!isFinalPolicyStep) {
      await policyWizardRef.current?.goNext();
      return;
    }
    setIsPolicySubmitting(true);
    try {
      await policyWizardRef.current?.submit();
    } finally {
      setIsPolicySubmitting(false);
    }
  };

  const handlePolicyCreated = async (createdPolicy: TCertificatePolicy) => {
    await queryClient.refetchQueries({
      queryKey: ["list-certificate-policies", currentProject?.id]
    });
    setValue("certificatePolicyId", createdPolicy.id, { shouldValidate: true, shouldDirty: true });
    setPolicyStepIndex(null);
  };

  useEffect(() => {
    onDirtyChange?.(isDirty || isPolicyWizardOpen);
  }, [isDirty, isPolicyWizardOpen, onDirtyChange]);

  useEffect(() => {
    onPendingChange?.(isSubmitting || isPolicySubmitting);
    return () => onPendingChange?.(false);
  }, [isSubmitting, isPolicySubmitting, onPendingChange]);

  return (
    <>
      <SheetHeader>
        <SheetTitle className="flex items-center gap-2">
          {isEdit && "Edit Certificate Profile"}
          {!isEdit && isClone && "Clone Certificate Profile"}
          {!isEdit && !isClone && "Create Certificate Profile"}
          <DocumentationLinkBadge href={PkiDocsUrls.settings.profiles} />
        </SheetTitle>
        <SheetDescription>
          {isPolicyWizardOpen && `${currentStep.name}: new certificate policy`}
          {!isPolicyWizardOpen && isEdit && `Update configuration for ${profile?.slug}`}
          {!isPolicyWizardOpen &&
            !isEdit &&
            isClone &&
            `Create a new profile based on ${profile?.slug}`}
          {!isPolicyWizardOpen &&
            !isEdit &&
            !isClone &&
            "Define the CA and policy used to issue certificates from this profile"}
        </SheetDescription>
      </SheetHeader>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (isSubmitting || isPolicySubmitting) return;
          if (isPolicyWizardOpen) {
            goNextInPolicy();
            return;
          }
          if (!isFinalStep) {
            goNext();
            return;
          }
          handleSubmit(onFormSubmit, (errors) => {
            const errorKeys = Object.keys(errors);
            const stepIndex = steps.findIndex((s) =>
              s.fields.some((fld) => errorKeys.includes(fld))
            );
            if (stepIndex >= 0) setSelectedStepIndex(stepIndex);
            createNotification({
              text: "Please fix the highlighted errors before saving.",
              type: "error"
            });
          })();
        }}
        className="flex min-h-0 flex-1 flex-col"
      >
        <fieldset
          disabled={isSubmitting || isPolicySubmitting || Boolean(savedProfile)}
          className="flex min-h-0 min-w-0 flex-1 overflow-hidden"
        >
          <aside className="flex w-60 shrink-0 flex-col border-r border-border p-4">
            <p className="mb-5 text-[11px] font-medium tracking-wider text-muted uppercase">
              Setup steps
            </p>
            <Stepper
              activeStep={selectedStepIndex}
              orientation="vertical"
              onStepChange={(i) => {
                if (
                  !isSubmitting &&
                  !isPolicySubmitting &&
                  !isPolicyWizardOpen &&
                  !savedProfile &&
                  i < selectedStepIndex
                )
                  setSelectedStepIndex(i);
              }}
            >
              <StepperList>
                {steps.flatMap((s, i) => {
                  const stepNode = (
                    <StepperStep
                      key={s.key}
                      index={i}
                      title={s.name}
                      description={s.shortDescription}
                    />
                  );

                  if (!isPolicyWizardOpen || s.key !== "issuer") return [stepNode];

                  return [
                    stepNode,
                    <PolicySubSteps
                      key="policy-sub-steps"
                      activeStep={policyStepIndex}
                      onCancel={() => setPolicyStepIndex(null)}
                    />
                  ];
                })}
              </StepperList>
            </Stepper>
          </aside>

          {isPolicyWizardOpen ? (
            <CertificatePolicyWizard
              ref={policyWizardRef}
              step={policyStepIndex}
              onStepChange={setPolicyStepIndex}
              onComplete={handlePolicyCreated}
              defaultName={draftPolicyName}
              nameDescription="Pre-filled from the profile name. Edit if this policy will be shared."
              banner={
                <div className="mb-4 flex items-center gap-2 text-xs text-muted">
                  <ShieldCheck className="size-3.5 shrink-0" />
                  <span>
                    Defining the policy for <span className="text-accent">{watchedSlug}</span>
                  </span>
                </div>
              }
            />
          ) : (
            <div className="flex min-w-0 flex-1 flex-col gap-y-2 overflow-y-auto p-4">
              <div className="mb-6">
                <h2 className="text-lg font-normal text-foreground">{currentStep.title}</h2>
                <p className="mt-1 text-sm text-muted">{currentStep.subtitle}</p>
              </div>

              {currentStep.key === "details" && (
                <div className="space-y-5">
                  <Controller
                    control={control}
                    name="slug"
                    render={({ field, fieldState: { error } }) => (
                      <Field data-invalid={Boolean(error)}>
                        <FieldLabel>
                          Name <span className="text-danger">*</span>
                        </FieldLabel>
                        <FieldContent>
                          <Input
                            {...field}
                            onChange={(event) =>
                              field.onChange(normalizeSlugInput(event.target.value))
                            }
                            aria-describedby="certificate-profile-name-feedback"
                            placeholder="your-profile-name"
                            isError={Boolean(error)}
                          />
                          <FieldFeedback
                            id="certificate-profile-name-feedback"
                            description="Use lowercase letters, numbers, and hyphens. Spaces become hyphens."
                            error={error?.message}
                          />
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

              {currentStep.key === "issuer" && (
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
                            onValueChange={(next) => {
                              if (next === IssuerType.SELF_SIGNED) {
                                setValue("certificateAuthorityId", "");
                                setValue("externalConfigs", undefined);
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
                      render={({
                        field: { onChange, value, ref, onBlur, name },
                        fieldState: { error }
                      }) => {
                        const hasCas = certificateAuthorities.length > 0;
                        return (
                          <Field>
                            <FieldLabel>
                              Certificate Authority <span className="text-danger">*</span>
                            </FieldLabel>
                            <FieldContent>
                              <Combobox
                                ref={ref}
                                name={name}
                                onBlur={onBlur}
                                value={certificateAuthorities.find((ca) => ca.id === value) || null}
                                onValueChange={(selectedCaValue) => {
                                  const nextCaId = selectedCaValue?.id || "";
                                  if (nextCaId !== value) {
                                    // Templates are per-CA; a stale hidden template would
                                    // fail step validation for non-ADCS issuers.
                                    setValue("externalConfigs", undefined);
                                  }
                                  onChange(nextCaId);
                                }}
                                getOptionLabel={(ca) => ca.name}
                                getOptionValue={(ca) => ca.id}
                                options={certificateAuthorities}
                                getOptionGroup={(ca) =>
                                  getGroupHeaderLabel(ca.groupType as "internal" | "external")
                                }
                                placeholder="Select a certificate authority"
                                isError={Boolean(error)}
                                creation={!isEdit ? caCreation : undefined}
                              />
                              <FieldError errors={[error]} />
                              {!hasCas && (
                                <FieldDescription className="text-warning">
                                  No certificate authorities available.{" "}
                                  <Link
                                    to="/organizations/$orgId/cert-manager/certificate-authorities"
                                    params={{ orgId: orgId ?? "" }}
                                    className="underline hover:text-warning"
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
                    render={({
                      field: { onChange, value, ref, onBlur, name },
                      fieldState: { error }
                    }) => (
                      <Field>
                        <FieldLabel>
                          Certificate Policy <span className="text-danger">*</span>
                        </FieldLabel>
                        <FieldContent>
                          <Combobox
                            ref={ref}
                            name={name}
                            onBlur={onBlur}
                            value={certificatePolicies.find((p) => p.id === value) ?? null}
                            onValueChange={(selected) => {
                              onChange(selected?.id || "");

                              setValue("defaults", undefined);
                            }}
                            options={certificatePolicies}
                            getOptionLabel={(option) => option.name}
                            getOptionValue={(option) => option.id}
                            placeholder={
                              certificatePolicies.length === 0 && !canCreatePolicy
                                ? "No certificate policies available"
                                : "Select a certificate policy"
                            }
                            isError={Boolean(error)}
                            creation={
                              canCreatePolicy && !isEdit
                                ? {
                                    mode: "action",
                                    emptyLabel: "Add Certificate Policy",
                                    formatLabel: () => "Add Certificate Policy",
                                    onAction: () => setPolicyStepIndex(0)
                                  }
                                : undefined
                            }
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

              {currentStep.key === "certificate-defaults" && (
                <ProfileDefaultsStep
                  control={control}
                  watch={watch}
                  setValue={setValue}
                  policyConstraints={policyConstraints}
                  isAwsAcmPublicCa={isAwsAcmPublicCa}
                  isExternalAdcsCa={isAzureAdcsCa || isAdcsCa}
                  caSupportsCustomExtensions={caSupportsCustomExtensions}
                  caKeyAlgorithm={caKeyAlgorithm}
                />
              )}
            </div>
          )}

          <aside className="hidden w-80 shrink-0 flex-col gap-4 overflow-y-auto border-l border-border px-6 py-6 lg:flex">
            <div className="mb-auto">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-medium tracking-wider text-muted uppercase">
                  {activePolicyStep
                    ? `Step ${selectedStepIndex + 1}.${(policyStepIndex ?? 0) + 1} · ${activePolicyStep.rightLabel}`
                    : `Step ${selectedStepIndex + 1} · ${currentStep.rightLabel}`}
                </p>
                <DocumentationLinkBadge
                  href={
                    activePolicyStep ? PkiDocsUrls.settings.policies : PkiDocsUrls.settings.profiles
                  }
                />
              </div>
              <p className="mt-4 text-sm font-semibold text-foreground">What this step does</p>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                {activePolicyStep
                  ? activePolicyStep.rightDescription
                  : currentStep.rightDescription}
              </p>
            </div>
          </aside>
        </fieldset>
        {completionError && <FieldError className="px-4">{completionError}</FieldError>}

        <SheetFooter className="justify-between border-t">
          <div className="flex items-center gap-3">
            {(selectedStepIndex > 0 || isPolicyWizardOpen) && (
              <Button
                type="button"
                variant="outline"
                isDisabled={isSubmitting || isPolicySubmitting || Boolean(savedProfile)}
                onClick={isPolicyWizardOpen ? goBackInPolicy : goBack}
              >
                Back
              </Button>
            )}
            <span className="text-xs text-muted">
              {isPolicyWizardOpen
                ? `Profile step ${selectedStepIndex + 1} of ${steps.length} · Policy step ${(policyStepIndex ?? 0) + 1} of ${CERTIFICATE_POLICY_STEPS.length}`
                : `Step ${selectedStepIndex + 1} of ${steps.length}`}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              isDisabled={isSubmitting || isPolicySubmitting}
              onClick={handleClose}
            >
              Cancel
            </Button>
            {/* eslint-disable-next-line no-nested-ternary */}
            {isPolicyWizardOpen ? (
              <Button
                key="policy-cta"
                type="submit"
                variant="project"
                isPending={isPolicySubmitting}
                isDisabled={isPolicySubmitting}
              >
                {isFinalPolicyStep ? "Create Policy" : "Continue"}
              </Button>
            ) : isFinalStep ? (
              <Button
                key="submit-cta"
                type="submit"
                variant="project"
                isPending={isSubmitting}
                isDisabled={isSubmitting}
              >
                {submitLabel}
              </Button>
            ) : (
              <Button key="continue-cta" type="submit" variant="project" isDisabled={isSubmitting}>
                Continue
              </Button>
            )}
          </div>
        </SheetFooter>
      </form>
      {caCreationModals}
    </>
  );
};

export const CreateProfileModal = ({ isOpen, onClose, ...props }: Props) => {
  const [isDirty, setIsDirty] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const { requestDiscard, confirmDiscard, isDiscardDialogOpen, setIsDiscardDialogOpen } =
    useDiscardChangesGuard({ isDirty, onDiscard: onClose });

  return (
    <>
      <Sheet
        open={isOpen}
        onOpenChange={(open) => {
          if (!open) requestDiscard();
        }}
      >
        <SheetContent size="workspace" isPending={isPending}>
          <CreateProfileForm
            {...props}
            isOpen={isOpen}
            onClose={onClose}
            onCancel={requestDiscard}
            onDirtyChange={setIsDirty}
            onPendingChange={setIsPending}
          />
        </SheetContent>
      </Sheet>
      <DiscardChangesAlertDialog
        open={isDiscardDialogOpen}
        onOpenChange={setIsDiscardDialogOpen}
        onDiscard={confirmDiscard}
        title="Discard Profile Changes?"
        description="Your unsaved profile configuration will be lost."
      />
    </>
  );
};
