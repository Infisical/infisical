/* eslint-disable no-nested-ternary */
import { ReactNode, useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, ShieldCheck, Trash2 } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Badge,
  Button,
  Checkbox,
  DocumentationLinkBadge,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
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
  Switch,
  TextArea
} from "@app/components/v3";
import { useProject, useSubscription } from "@app/context";
import {
  TCertificatePolicy,
  TCertificatePolicyRule,
  useCreateCertificatePolicy,
  useUpdateCertificatePolicy
} from "@app/hooks/api/certificatePolicies";
import { isPqcAlgorithm } from "@app/hooks/api/certificates/constants";

import { PkiDocsUrls } from "../../../pki-docs-urls";
import {
  CertDurationUnit,
  CertExtendedKeyUsageType,
  CertKeyUsageType,
  CertPolicyState,
  CertSanInclude,
  CertSubjectAlternativeNameType,
  CertSubjectAttributeInclude,
  CertSubjectAttributeType,
  EXTENDED_KEY_USAGE_OPTIONS,
  formatExtendedKeyUsage,
  formatKeyUsage,
  KEY_USAGE_OPTIONS,
  POLICY_PRESET_IDS,
  type PolicyPresetId,
  SAN_INCLUDE_OPTIONS,
  SAN_TYPE_OPTIONS,
  SUBJECT_ATTRIBUTE_INCLUDE_OPTIONS,
  SUBJECT_ATTRIBUTE_TYPE_OPTIONS
} from "./shared/certificate-constants";
import { CERTIFICATE_POLICY_PRESETS } from "./shared/policy-presets";
import { PolicyFormData, policySchema } from "./shared";

export type FormData = PolicyFormData;

type AttributeTransform = NonNullable<TCertificatePolicyRule["subject"]>[0];
type SanTransform = NonNullable<TCertificatePolicyRule["sans"]>[0];
type KeyUsagesTransform = TCertificatePolicyRule["keyUsages"];
type ExtendedKeyUsagesTransform = TCertificatePolicyRule["extendedKeyUsages"];
type AlgorithmsTransform = TCertificatePolicyRule["algorithms"];
type ValidityTransform = TCertificatePolicyRule["validity"];

interface Props {
  isOpen: boolean;
  onClose: () => void;
  policy?: TCertificatePolicy;
  mode?: "create" | "edit";
  onComplete?: (policy: TCertificatePolicy) => void;
}

const ATTRIBUTE_TYPE_LABELS: Record<(typeof SUBJECT_ATTRIBUTE_TYPE_OPTIONS)[number], string> = {
  common_name: "Common Name (CN)",
  organization: "Organization (O)",
  organizational_unit: "Organizational Unit (OU)",
  country: "Country (C)",
  state: "State/Province (ST)",
  locality: "Locality (L)",
  domain_component: "Domain Component (DC)"
};

const SAN_TYPE_LABELS: Record<(typeof SAN_TYPE_OPTIONS)[number], string> = {
  dns_name: "DNS Name",
  ip_address: "IP Address",
  email: "Email",
  uri: "URI"
};

const SUBJECT_ATTRIBUTE_LABELS: Record<(typeof SUBJECT_ATTRIBUTE_INCLUDE_OPTIONS)[number], string> =
  {
    required: "Require",
    optional: "Allow",
    prohibit: "Deny"
  };

const SAN_INCLUDE_LABELS: Record<(typeof SAN_INCLUDE_OPTIONS)[number], string> = {
  mandatory: "Require",
  optional: "Allow",
  prohibit: "Deny"
};

const USAGE_POLICY_OPTIONS = [
  { value: "deny", label: "Deny" },
  { value: "allow", label: "Allow" },
  { value: "require", label: "Require" }
] as const;

type UsagePolicy = (typeof USAGE_POLICY_OPTIONS)[number]["value"];

const SIGNATURE_ALGORITHMS = [
  "SHA256-RSA",
  "SHA384-RSA",
  "SHA512-RSA",
  "SHA256-ECDSA",
  "SHA384-ECDSA",
  "SHA512-ECDSA",
  "ML-DSA-44",
  "ML-DSA-65",
  "ML-DSA-87"
] as const;

const KEY_ALGORITHMS = [
  "RSA-2048",
  "RSA-3072",
  "RSA-4096",
  "ECDSA-P256",
  "ECDSA-P384",
  "ECDSA-P521",
  "ML-DSA-44",
  "ML-DSA-65",
  "ML-DSA-87"
] as const;

const STEPS = [
  {
    name: "Basics",
    shortDescription: "Name and preset",
    title: "Basics",
    subtitle: "Name this policy and optionally start from a preset.",
    rightLabel: "BASICS",
    rightDescription:
      "A clear name and description help your team identify what this policy enforces. Applying a preset fills the remaining steps with a recommended baseline that you can refine as you go."
  },
  {
    name: "Subject",
    shortDescription: "Attributes and SANs",
    title: "Subject",
    subtitle:
      "Control the subject attributes and alternative names allowed on issued certificates.",
    rightLabel: "SUBJECT",
    rightDescription:
      "By default, issued certificates may carry any subject attributes and subject alternative names. Enable a restriction to define exactly which values are allowed, required, or denied. Requests that fall outside those rules are rejected at issuance."
  },
  {
    name: "Algorithms",
    shortDescription: "Signature and key",
    title: "Algorithms",
    subtitle: "Restrict the signature and key algorithms certificates may use.",
    rightLabel: "ALGORITHMS",
    rightDescription:
      "By default, any signature and key algorithm is accepted. Enable a restriction to limit issuance to the algorithms you approve. Requests using any other algorithm of that kind are rejected."
  },
  {
    name: "Key Usages",
    shortDescription: "Usages and EKUs",
    title: "Key Usages",
    subtitle: "Choose the key usages and extended key usages certificates may carry.",
    rightLabel: "KEY USAGES",
    rightDescription:
      "By default, certificates may carry any key usages and extended key usages. Enable a restriction to mark each usage as required, allowed, or denied. Requests that fall outside those rules are rejected at issuance."
  },
  {
    name: "Constraints",
    shortDescription: "Validity and CA",
    title: "Constraints",
    subtitle: "Optionally cap validity and control CA behavior for issued certificates.",
    rightLabel: "CONSTRAINTS",
    rightDescription:
      "By default, validity and CA capability are unrestricted. Enable a restriction to cap the maximum validity period or control whether certificates can act as a CA, including path length limits."
  }
] as const;

const DurationInput = ({
  field,
  error,
  onCustomPreset
}: {
  field: {
    value: number | undefined;
    onChange: (value: number | undefined) => void;
    onBlur: () => void;
    name: string;
    ref: React.Ref<HTMLInputElement>;
  };
  error?: { message?: string };
  onCustomPreset: () => void;
}) => {
  const [localValue, setLocalValue] = useState<string>(
    field.value !== undefined ? String(field.value) : ""
  );

  useEffect(() => {
    if (field.value !== undefined) {
      setLocalValue(String(field.value));
    }
  }, [field.value]);

  return (
    <Field className="flex-1">
      <FieldLabel>Duration</FieldLabel>
      <FieldContent>
        <Input
          type="number"
          min={1}
          isError={Boolean(error)}
          value={localValue}
          onChange={(e) => {
            const rawValue = e.target.value;
            setLocalValue(rawValue);
            onCustomPreset();

            if (rawValue === "") {
              return;
            }

            const parsed = parseInt(rawValue, 10);
            if (!Number.isNaN(parsed) && parsed > 0) {
              field.onChange(parsed);
            }
          }}
          onBlur={() => {
            if (localValue === "" || Number.isNaN(parseInt(localValue, 10))) {
              setLocalValue(field.value !== undefined ? String(field.value) : "365");
              if (field.value === undefined) {
                field.onChange(365);
              }
            }
            field.onBlur();
          }}
        />
        <FieldError errors={[error]} />
      </FieldContent>
    </Field>
  );
};

const SectionToggle = ({
  title,
  description,
  enabled,
  onChange,
  error,
  children
}: {
  title: string;
  description: string;
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  error?: string;
  children?: ReactNode;
}) => (
  <div>
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="mt-0.5 text-xs text-muted">{description}</p>
      </div>
      <Switch checked={enabled} onCheckedChange={onChange} variant="project" />
    </div>
    {enabled && children && <div className="mt-4">{children}</div>}
    {error && <p className="mt-2 text-xs text-danger">{error}</p>}
  </div>
);

export const CreatePolicyModal = ({
  isOpen,
  onClose,
  policy,
  mode = "create",
  onComplete
}: Props) => {
  const { currentProject } = useProject();
  const { subscription } = useSubscription();
  const createPolicy = useCreateCertificatePolicy();
  const updatePolicy = useUpdateCertificatePolicy();

  const isEdit = mode === "edit" && policy;

  const [step, setStep] = useState(0);
  const currentStep = STEPS[step];
  const isLast = step === STEPS.length - 1;

  const [restrictSubject, setRestrictSubject] = useState(false);
  const [restrictSans, setRestrictSans] = useState(false);
  const [restrictSignature, setRestrictSignature] = useState(false);
  const [restrictKeyAlg, setRestrictKeyAlg] = useState(false);
  const [restrictKeyUsages, setRestrictKeyUsages] = useState(false);
  const [restrictExtendedKeyUsages, setRestrictExtendedKeyUsages] = useState(false);
  const [restrictValidity, setRestrictValidity] = useState(false);
  const [configureBasicConstraints, setConfigureBasicConstraints] = useState(false);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const clearError = (key: string) =>
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });

  const goBack = () => {
    if (step > 0) setStep((s) => s - 1);
  };

  const convertApiToUiFormat = (policyData: TCertificatePolicy): FormData => {
    const attributes: FormData["attributes"] = [];
    if (policyData.subject && Array.isArray(policyData.subject)) {
      policyData.subject.forEach((subj) => {
        if (subj.required && Array.isArray(subj.required)) {
          subj.required.forEach((requiredValue) => {
            attributes.push({
              type: subj.type as CertSubjectAttributeType,
              include: CertSubjectAttributeInclude.REQUIRED,
              value: [requiredValue]
            });
          });
        }
        if (subj.allowed && Array.isArray(subj.allowed)) {
          subj.allowed.forEach((allowedValue) => {
            attributes.push({
              type: subj.type as CertSubjectAttributeType,
              include: CertSubjectAttributeInclude.OPTIONAL,
              value: [allowedValue]
            });
          });
        }
        if (subj.denied && Array.isArray(subj.denied)) {
          subj.denied.forEach((deniedValue) => {
            attributes.push({
              type: subj.type as CertSubjectAttributeType,
              include: CertSubjectAttributeInclude.PROHIBIT,
              value: [deniedValue]
            });
          });
        }
      });
    }

    const subjectAlternativeNames: FormData["subjectAlternativeNames"] = [];
    if (policyData.sans && Array.isArray(policyData.sans)) {
      policyData.sans.forEach((san) => {
        if (san.required && Array.isArray(san.required)) {
          san.required.forEach((requiredValue) => {
            subjectAlternativeNames.push({
              type: san.type as CertSubjectAlternativeNameType,
              include: CertSanInclude.MANDATORY,
              value: [requiredValue]
            });
          });
        }
        if (san.allowed && Array.isArray(san.allowed)) {
          san.allowed.forEach((allowedValue) => {
            subjectAlternativeNames.push({
              type: san.type as CertSubjectAlternativeNameType,
              include: CertSanInclude.OPTIONAL,
              value: [allowedValue]
            });
          });
        }
        if (san.denied && Array.isArray(san.denied)) {
          san.denied.forEach((deniedValue) => {
            subjectAlternativeNames.push({
              type: san.type as CertSubjectAlternativeNameType,
              include: CertSanInclude.PROHIBIT,
              value: [deniedValue]
            });
          });
        }
      });
    }

    const keyUsages = {
      requiredUsages: (policyData.keyUsages?.required || []) as CertKeyUsageType[],
      optionalUsages: (policyData.keyUsages?.allowed || []) as CertKeyUsageType[]
    };

    const extendedKeyUsages = {
      requiredUsages: (policyData.extendedKeyUsages?.required || []) as CertExtendedKeyUsageType[],
      optionalUsages: (policyData.extendedKeyUsages?.allowed || []) as CertExtendedKeyUsageType[]
    };

    const validity = policyData.validity?.max
      ? (() => {
          const maxValue = policyData.validity.max;
          if (maxValue.length < 2)
            return { maxDuration: { value: 365, unit: CertDurationUnit.DAYS } };

          const lastChar = maxValue.slice(-1);
          const numberPart = maxValue.slice(0, -1);
          const value = parseInt(numberPart, 10);

          if (Number.isNaN(value) || value <= 0 || numberPart !== value.toString()) {
            return { maxDuration: { value: 365, unit: CertDurationUnit.DAYS } };
          }

          let unit: CertDurationUnit = CertDurationUnit.DAYS;
          if (lastChar === "h") {
            unit = CertDurationUnit.HOURS;
          } else if (lastChar === "d") {
            unit = CertDurationUnit.DAYS;
          } else if (lastChar === "m") {
            unit = CertDurationUnit.MONTHS;
          } else if (lastChar === "y") {
            unit = CertDurationUnit.YEARS;
          }

          return { maxDuration: { value, unit } };
        })()
      : { maxDuration: { value: 365, unit: CertDurationUnit.DAYS } };

    const signatureAlgorithm = {
      allowedAlgorithms: policyData.algorithms?.signature || []
    };

    const keyAlgorithm = {
      allowedKeyTypes: policyData.algorithms?.keyAlgorithm || []
    };

    const basicConstraints: FormData["basicConstraints"] = {
      isCA: (policyData.basicConstraints?.isCA as CertPolicyState) || CertPolicyState.DENIED,
      maxPathLength: policyData.basicConstraints?.maxPathLength ?? undefined
    };

    return {
      preset: POLICY_PRESET_IDS.CUSTOM,
      name: policyData.name || "",
      description: policyData.description || "",
      attributes,
      subjectAlternativeNames,
      keyUsages,
      extendedKeyUsages,
      validity,
      signatureAlgorithm,
      keyAlgorithm,
      basicConstraints
    };
  };

  const getDefaultValues = (): FormData & { preset: PolicyPresetId } => {
    return {
      preset: POLICY_PRESET_IDS.CUSTOM,
      name: "",
      description: "",
      basicConstraints: {
        isCA: CertPolicyState.DENIED,
        maxPathLength: undefined
      },
      attributes: [],
      keyUsages: { requiredUsages: [], optionalUsages: [] },
      extendedKeyUsages: { requiredUsages: [], optionalUsages: [] },
      subjectAlternativeNames: [],
      validity: {
        maxDuration: { value: 365, unit: CertDurationUnit.DAYS }
      },
      signatureAlgorithm: {
        allowedAlgorithms: []
      },
      keyAlgorithm: {
        allowedKeyTypes: []
      }
    };
  };

  const { control, handleSubmit, reset, watch, setValue, trigger } = useForm<
    FormData & { preset: PolicyPresetId }
  >({
    resolver: zodResolver(policySchema),
    defaultValues: getDefaultValues(),
    mode: "onChange",
    reValidateMode: "onChange",
    criteriaMode: "all"
  });

  const resetToggles = (source?: TCertificatePolicy) => {
    setRestrictSubject(Boolean(source?.subject));
    setRestrictSans(Boolean(source?.sans));
    setRestrictSignature(Boolean(source?.algorithms?.signature?.length));
    setRestrictKeyAlg(Boolean(source?.algorithms?.keyAlgorithm?.length));
    setRestrictKeyUsages(Boolean(source?.keyUsages));
    setRestrictExtendedKeyUsages(Boolean(source?.extendedKeyUsages));
    setRestrictValidity(Boolean(source?.validity?.max));
    setConfigureBasicConstraints(Boolean(source?.basicConstraints?.isCA));
    setErrors({});
  };

  useEffect(() => {
    if (isEdit && policy) {
      const convertedData = convertApiToUiFormat(policy);
      reset({ ...convertedData, preset: POLICY_PRESET_IDS.CUSTOM });
      resetToggles(policy);
    } else if (!isEdit) {
      reset(getDefaultValues());
      resetToggles();
    }
    setStep(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEdit, policy, reset, isOpen]);

  const watchedAttributes = watch("attributes") || [];
  const watchedSans = watch("subjectAlternativeNames") || [];
  const watchedKeyUsages = watch("keyUsages") || { requiredUsages: [], optionalUsages: [] };
  const watchedExtendedKeyUsages = watch("extendedKeyUsages") || {
    requiredUsages: [],
    optionalUsages: []
  };
  const watchedPreset = watch("preset") || POLICY_PRESET_IDS.CUSTOM;
  const watchedSignatureAlgs = watch("signatureAlgorithm")?.allowedAlgorithms || [];
  const watchedKeyAlgs = watch("keyAlgorithm")?.allowedKeyTypes || [];
  const watchedIsCAPolicy = watch("basicConstraints.isCA") || CertPolicyState.DENIED;

  const markCustomPreset = () => {
    if (watchedPreset !== POLICY_PRESET_IDS.CUSTOM) {
      setValue("preset", POLICY_PRESET_IDS.CUSTOM);
    }
  };

  const handlePresetChange = async (presetId: PolicyPresetId) => {
    setValue("preset", presetId);

    if (presetId === POLICY_PRESET_IDS.CUSTOM) {
      await trigger();
      return;
    }

    const selectedPreset = CERTIFICATE_POLICY_PRESETS.find((p) => p.id === presetId);
    if (selectedPreset) {
      const { formData } = selectedPreset;
      if (formData.keyUsages) setValue("keyUsages", formData.keyUsages);
      if (formData.extendedKeyUsages) setValue("extendedKeyUsages", formData.extendedKeyUsages);
      if (formData.attributes) setValue("attributes", formData.attributes);
      if (formData.subjectAlternativeNames)
        setValue("subjectAlternativeNames", formData.subjectAlternativeNames);
      if (formData.signatureAlgorithm) setValue("signatureAlgorithm", formData.signatureAlgorithm);
      if (formData.keyAlgorithm) setValue("keyAlgorithm", formData.keyAlgorithm);
      if (formData.basicConstraints) setValue("basicConstraints", formData.basicConstraints);
      if (formData.validity) setValue("validity", formData.validity);

      setRestrictSubject(Boolean(formData.attributes?.length));
      setRestrictSans(Boolean(formData.subjectAlternativeNames?.length));
      setRestrictSignature(Boolean(formData.signatureAlgorithm?.allowedAlgorithms?.length));
      setRestrictKeyAlg(Boolean(formData.keyAlgorithm?.allowedKeyTypes?.length));
      setRestrictKeyUsages(
        Boolean(
          formData.keyUsages?.requiredUsages?.length || formData.keyUsages?.optionalUsages?.length
        )
      );
      setRestrictExtendedKeyUsages(
        Boolean(
          formData.extendedKeyUsages?.requiredUsages?.length ||
            formData.extendedKeyUsages?.optionalUsages?.length
        )
      );
      setRestrictValidity(Boolean(formData.validity?.maxDuration));
      setConfigureBasicConstraints(
        Boolean(
          formData.basicConstraints?.isCA &&
            formData.basicConstraints.isCA !== CertPolicyState.DENIED
        )
      );

      await trigger();
    }
  };

  const consolidateByType = <
    T extends { type: string; allowed?: string[]; required?: string[]; denied?: string[] }
  >(
    items: T[]
  ): T[] => {
    const consolidated = new Map<string, T>();

    items.forEach((item) => {
      const existing = consolidated.get(item.type);
      if (existing) {
        const mergedItem = {
          ...item,
          allowed: [...new Set([...(existing.allowed || []), ...(item.allowed || [])])],
          required: [...new Set([...(existing.required || []), ...(item.required || [])])],
          denied: [...new Set([...(existing.denied || []), ...(item.denied || [])])]
        } as T;

        if (mergedItem.allowed?.length === 0) delete mergedItem.allowed;
        if (mergedItem.required?.length === 0) delete mergedItem.required;
        if (mergedItem.denied?.length === 0) delete mergedItem.denied;

        consolidated.set(item.type, mergedItem);
      } else {
        consolidated.set(item.type, item);
      }
    });

    return Array.from(consolidated.values());
  };

  const transformToApiFormat = (data: FormData) => {
    const subjectRaw =
      data.attributes?.map((attr) => {
        const result: AttributeTransform = { type: attr.type };
        if (attr.value && attr.value.length > 0) {
          if (attr.include === CertSubjectAttributeInclude.REQUIRED) {
            result.required = attr.value;
          } else if (attr.include === CertSubjectAttributeInclude.OPTIONAL) {
            result.allowed = attr.value;
          } else if (attr.include === CertSubjectAttributeInclude.PROHIBIT) {
            result.denied = attr.value;
          }
        }
        return result;
      }) || [];

    const sansRaw =
      data.subjectAlternativeNames?.map((san) => {
        const result: SanTransform = { type: san.type };
        if (san.include === CertSanInclude.MANDATORY && san.value && san.value.length > 0) {
          result.required = san.value;
        } else if (san.include === CertSanInclude.OPTIONAL && san.value && san.value.length > 0) {
          result.allowed = san.value;
        } else if (san.include === CertSanInclude.PROHIBIT && san.value && san.value.length > 0) {
          result.denied = san.value;
        }
        return result;
      }) || [];

    const subject = restrictSubject ? consolidateByType(subjectRaw) : null;
    const sans = restrictSans ? consolidateByType(sansRaw) : null;

    const keyUsages: KeyUsagesTransform | null = restrictKeyUsages
      ? {
          required: data.keyUsages?.requiredUsages ?? [],
          allowed: data.keyUsages?.optionalUsages ?? []
        }
      : null;

    const extendedKeyUsages: ExtendedKeyUsagesTransform | null = restrictExtendedKeyUsages
      ? {
          required: data.extendedKeyUsages?.requiredUsages ?? [],
          allowed: data.extendedKeyUsages?.optionalUsages ?? []
        }
      : null;

    const algorithms: AlgorithmsTransform = {};
    if (restrictSignature && data.signatureAlgorithm?.allowedAlgorithms?.length) {
      algorithms.signature = data.signatureAlgorithm
        .allowedAlgorithms as NonNullable<AlgorithmsTransform>["signature"];
    }
    if (restrictKeyAlg && data.keyAlgorithm?.allowedKeyTypes?.length) {
      algorithms.keyAlgorithm = data.keyAlgorithm
        .allowedKeyTypes as NonNullable<AlgorithmsTransform>["keyAlgorithm"];
    }

    const validity: ValidityTransform = {};
    if (restrictValidity && data.validity?.maxDuration) {
      let unit = "d";
      if (data.validity.maxDuration.unit === CertDurationUnit.HOURS) {
        unit = "h";
      } else if (data.validity.maxDuration.unit === CertDurationUnit.DAYS) {
        unit = "d";
      } else if (data.validity.maxDuration.unit === CertDurationUnit.MONTHS) {
        unit = "m";
      } else {
        unit = "y";
      }
      validity.max = `${data.validity.maxDuration.value}${unit}`;
    }

    const basicConstraints = configureBasicConstraints
      ? {
          isCA: data.basicConstraints?.isCA ?? CertPolicyState.DENIED,
          maxPathLength:
            data.basicConstraints?.isCA && data.basicConstraints.isCA !== CertPolicyState.DENIED
              ? (data.basicConstraints.maxPathLength ?? undefined)
              : undefined
        }
      : null;

    return {
      name: data.name,
      description: data.description,
      subject,
      sans,
      keyUsages,
      extendedKeyUsages,
      algorithms: algorithms.signature || algorithms.keyAlgorithm ? algorithms : null,
      validity: validity.max ? validity : null,
      basicConstraints
    };
  };

  const onFormSubmit = async (data: FormData) => {
    if (!currentProject?.id && !isEdit) return;

    const hasEmptyAttributeValues =
      restrictSubject &&
      data.attributes?.some(
        (attr) => !attr.value || attr.value.length === 0 || attr.value.some((v) => !v.trim())
      );

    const hasEmptySanValues =
      restrictSans &&
      data.subjectAlternativeNames?.some(
        (san) => !san.value || san.value.length === 0 || san.value.some((v) => !v.trim())
      );

    if (hasEmptyAttributeValues || hasEmptySanValues) {
      createNotification({
        text: "All configured subject or SAN values must be non-empty. Use wildcards (*) if needed.",
        type: "error"
      });
      return;
    }

    const transformedData = transformToApiFormat(data);

    if (isEdit) {
      await updatePolicy.mutateAsync({ policyId: policy.id, ...transformedData });
    } else {
      if (!currentProject?.id) {
        throw new Error("Project ID is required for creating a policy");
      }
      const createdPolicy = await createPolicy.mutateAsync({
        projectId: currentProject.id,
        ...transformedData
      });
      onComplete?.(createdPolicy);
    }

    createNotification({
      text: `Certificate policy ${isEdit ? "updated" : "created"} successfully`,
      type: "success"
    });

    reset();
    onClose();
  };

  const addAttribute = () => {
    setValue("attributes", [
      ...watchedAttributes,
      {
        type: SUBJECT_ATTRIBUTE_TYPE_OPTIONS[0],
        include: SUBJECT_ATTRIBUTE_INCLUDE_OPTIONS[1],
        value: ["*"]
      }
    ]);
    clearError("subject");
    markCustomPreset();
  };

  const removeAttribute = (index: number) => {
    setValue(
      "attributes",
      watchedAttributes.filter((_, i) => i !== index)
    );
    markCustomPreset();
  };

  const addSan = () => {
    setValue("subjectAlternativeNames", [
      ...watchedSans,
      { type: SAN_TYPE_OPTIONS[0], include: SAN_INCLUDE_OPTIONS[1], value: ["*"] }
    ]);
    clearError("sans");
    markCustomPreset();
  };

  const removeSan = (index: number) => {
    setValue(
      "subjectAlternativeNames",
      watchedSans.filter((_, i) => i !== index)
    );
    markCustomPreset();
  };

  const keyUsagePolicyOf = (usage: CertKeyUsageType): UsagePolicy => {
    if (watchedKeyUsages.requiredUsages.includes(usage)) return "require";
    if (watchedKeyUsages.optionalUsages.includes(usage)) return "allow";
    return "deny";
  };

  const setKeyUsagePolicy = (usage: CertKeyUsageType, policyValue: UsagePolicy) => {
    const required = watchedKeyUsages.requiredUsages.filter((u) => u !== usage);
    const optional = watchedKeyUsages.optionalUsages.filter((u) => u !== usage);
    if (policyValue === "require") required.push(usage);
    else if (policyValue === "allow") optional.push(usage);
    setValue("keyUsages", { requiredUsages: required, optionalUsages: optional });
    clearError("keyUsages");
    markCustomPreset();
  };

  const extendedKeyUsagePolicyOf = (usage: CertExtendedKeyUsageType): UsagePolicy => {
    if (watchedExtendedKeyUsages.requiredUsages.includes(usage)) return "require";
    if (watchedExtendedKeyUsages.optionalUsages.includes(usage)) return "allow";
    return "deny";
  };

  const setExtendedKeyUsagePolicy = (usage: CertExtendedKeyUsageType, policyValue: UsagePolicy) => {
    const required = watchedExtendedKeyUsages.requiredUsages.filter((u) => u !== usage);
    const optional = watchedExtendedKeyUsages.optionalUsages.filter((u) => u !== usage);
    if (policyValue === "require") required.push(usage);
    else if (policyValue === "allow") optional.push(usage);
    setValue("extendedKeyUsages", { requiredUsages: required, optionalUsages: optional });
    clearError("extendedKeyUsages");
    markCustomPreset();
  };

  const toggleAlgorithm = (
    fieldName: "signatureAlgorithm" | "keyAlgorithm",
    key: "allowedAlgorithms" | "allowedKeyTypes",
    current: string[],
    value: string,
    checked: boolean
  ) => {
    const next = checked ? [...current, value] : current.filter((v) => v !== value);
    setValue(fieldName, { [key]: next } as never);
    clearError(fieldName === "signatureAlgorithm" ? "signature" : "keyAlgorithm");
    markCustomPreset();
  };

  const validateStep = (): boolean => {
    const stepErrors: Record<string, string> = {};

    if (step === 1) {
      if (restrictSubject && watchedAttributes.some((a) => !a.value?.[0]?.trim())) {
        stepErrors.subject = "Every subject attribute needs a value (use * for any).";
      }
      if (restrictSans && watchedSans.some((s) => !s.value?.[0]?.trim())) {
        stepErrors.sans = "Every subject alternative name needs a value (use * for any).";
      }
    }

    if (step === 2) {
      if (restrictSignature && !watchedSignatureAlgs.length) {
        stepErrors.signature =
          "Select at least one signature algorithm, or turn off the restriction.";
      }
      if (restrictKeyAlg && !watchedKeyAlgs.length) {
        stepErrors.keyAlgorithm = "Select at least one key algorithm, or turn off the restriction.";
      }
    }

    setErrors(stepErrors);
    return Object.keys(stepErrors).length === 0;
  };

  const goNext = async () => {
    if (step === 0) {
      const ok = await trigger(["name"]);
      if (!ok) return;
    }
    if (!validateStep()) return;
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const isSubmitting = isEdit ? updatePolicy.isPending : createPolicy.isPending;

  const renderUsageGrid = (
    options: readonly string[],
    policyOf: (u: never) => UsagePolicy,
    onChange: (u: never, p: UsagePolicy) => void,
    formatter: (u: never) => string
  ) => (
    <div className="grid grid-cols-2 gap-x-6 gap-y-3">
      {options.map((usage) => (
        <div key={usage} className="flex items-center justify-between gap-2">
          <span className="text-sm text-foreground">{formatter(usage as never)}</span>
          <Select
            value={policyOf(usage as never)}
            onValueChange={(value) => onChange(usage as never, value as UsagePolicy)}
          >
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper">
              {USAGE_POLICY_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ))}
    </div>
  );

  const renderAlgorithmGrid = (
    options: readonly string[],
    selected: string[],
    fieldName: "signatureAlgorithm" | "keyAlgorithm",
    key: "allowedAlgorithms" | "allowedKeyTypes"
  ) => (
    <div className="grid grid-cols-2 gap-3">
      {options.map((alg) => {
        const isSelected = selected.includes(alg);
        const isPqcGated = isPqcAlgorithm(alg) && !subscription?.pkiPqc;
        return (
          <div key={alg} className="flex items-center gap-3">
            <Checkbox
              id={`${fieldName}-${alg}`}
              variant="project"
              isChecked={isSelected}
              isDisabled={isPqcGated}
              onCheckedChange={(checked) =>
                toggleAlgorithm(fieldName, key, selected, alg, Boolean(checked))
              }
            />
            <label
              htmlFor={`${fieldName}-${alg}`}
              className="flex cursor-pointer items-center gap-2 text-sm text-foreground"
            >
              {alg}
              {isPqcGated && <Badge variant="info">Enterprise</Badge>}
            </label>
          </div>
        );
      })}
    </div>
  );

  return (
    <Sheet
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          reset();
          resetToggles();
          setStep(0);
        }
        onClose();
      }}
    >
      <SheetContent className="flex h-full max-h-full flex-col gap-y-0 p-0 sm:max-w-[1100px]">
        <SheetHeader className="border-b border-border">
          <SheetTitle>
            <div className="flex w-full items-start gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-project/10 text-project">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-x-2 text-foreground">
                  {isEdit ? "Edit Certificate Policy" : "Create Certificate Policy"}
                  <DocumentationLinkBadge href={PkiDocsUrls.settings.policies} />
                </div>
                <p className="text-sm leading-4 text-muted">
                  {isEdit
                    ? `Update configuration for ${policy?.name}`
                    : "Define comprehensive certificate policies, validation rules, and constraints"}
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
                activeStep={step}
                orientation="vertical"
                onStepChange={(i) => {
                  if (i < step) setStep(i);
                }}
              >
                <StepperList>
                  {STEPS.map((s, i) => (
                    <StepperStep
                      key={s.name}
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

              {step === 0 && (
                <FieldGroup className="p-4">
                  <Controller
                    control={control}
                    name="name"
                    render={({ field, fieldState: { error } }) => (
                      <Field>
                        <FieldLabel>
                          Policy Name <span className="text-danger">*</span>
                        </FieldLabel>
                        <FieldContent>
                          <Input
                            {...field}
                            placeholder="e.g. tls-server"
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
                            placeholder="What this policy enforces."
                            rows={3}
                            isError={Boolean(error)}
                          />
                          <FieldError errors={[error]} />
                        </FieldContent>
                      </Field>
                    )}
                  />
                  <Controller
                    control={control}
                    name="preset"
                    render={({ field }) => (
                      <Field>
                        <FieldLabel>Policy Preset</FieldLabel>
                        <FieldContent>
                          <Select value={field.value} onValueChange={handlePresetChange}>
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Select a preset" />
                            </SelectTrigger>
                            <SelectContent position="popper">
                              <SelectItem value={POLICY_PRESET_IDS.CUSTOM}>Custom</SelectItem>
                              {CERTIFICATE_POLICY_PRESETS.map((preset) => (
                                <SelectItem key={preset.id} value={preset.id}>
                                  {preset.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FieldDescription>
                            Apply a preset to populate every step with a recommended baseline, then
                            review and tailor each one to your requirements. Select Custom to start
                            from scratch.
                          </FieldDescription>
                        </FieldContent>
                      </Field>
                    )}
                  />
                </FieldGroup>
              )}

              {step === 1 && (
                <div className="space-y-8">
                  <SectionToggle
                    title="Restrict subject attributes"
                    description="Only allow the subject attributes (CN, O, OU, ...) you configure here."
                    enabled={restrictSubject}
                    error={errors.subject}
                    onChange={(enabled) => {
                      setRestrictSubject(enabled);
                      if (!enabled) setValue("attributes", []);
                      clearError("subject");
                      markCustomPreset();
                    }}
                  >
                    <div className="space-y-3">
                      {watchedAttributes.length === 0 && (
                        <p className="text-xs text-muted">
                          No attributes configured. Certificates issued under this policy cannot
                          include any subject attributes. Turn this off to allow any subject
                          attribute.
                        </p>
                      )}
                      {watchedAttributes.map((attr, index) => (
                        // eslint-disable-next-line react/no-array-index-key
                        <div key={`attr-${index}`} className="flex items-start gap-2">
                          <Select
                            value={attr.type}
                            onValueChange={(value) => {
                              const next = [...watchedAttributes];
                              next[index] = { ...attr, type: value as CertSubjectAttributeType };
                              setValue("attributes", next);
                              markCustomPreset();
                            }}
                          >
                            <SelectTrigger className="w-52">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent position="popper">
                              {SUBJECT_ATTRIBUTE_TYPE_OPTIONS.map((type) => (
                                <SelectItem key={type} value={type}>
                                  {ATTRIBUTE_TYPE_LABELS[type]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Select
                            value={attr.include}
                            onValueChange={(value) => {
                              const next = [...watchedAttributes];
                              next[index] = {
                                ...attr,
                                include: value as (typeof SUBJECT_ATTRIBUTE_INCLUDE_OPTIONS)[number]
                              };
                              setValue("attributes", next);
                              markCustomPreset();
                            }}
                          >
                            <SelectTrigger className="w-28">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent position="popper">
                              {SUBJECT_ATTRIBUTE_INCLUDE_OPTIONS.map((type) => (
                                <SelectItem key={type} value={type}>
                                  {SUBJECT_ATTRIBUTE_LABELS[type]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Input
                            placeholder="Pattern/Value (use * for wildcards)"
                            value={attr.value?.[0] || ""}
                            onChange={(e) => {
                              const next = [...watchedAttributes];
                              next[index] = {
                                ...attr,
                                value: e.target.value.trim() ? [e.target.value.trim()] : []
                              };
                              setValue("attributes", next);
                              markCustomPreset();
                            }}
                            className="flex-1"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeAttribute(index)}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      ))}
                      <Button type="button" variant="outline" size="sm" onClick={addAttribute}>
                        <Plus className="size-4" /> Add attribute
                      </Button>
                    </div>
                  </SectionToggle>

                  <SectionToggle
                    title="Restrict subject alternative names"
                    description="Only allow the SAN types and values you configure here."
                    enabled={restrictSans}
                    error={errors.sans}
                    onChange={(enabled) => {
                      setRestrictSans(enabled);
                      if (!enabled) setValue("subjectAlternativeNames", []);
                      clearError("sans");
                      markCustomPreset();
                    }}
                  >
                    <div className="space-y-3">
                      {watchedSans.length === 0 && (
                        <p className="text-xs text-muted">
                          No SANs configured. Certificates issued under this policy cannot include
                          any subject alternative names. Turn this off to allow any SAN.
                        </p>
                      )}
                      {watchedSans.map((san, index) => (
                        // eslint-disable-next-line react/no-array-index-key
                        <div key={`san-${index}`} className="flex items-start gap-2">
                          <Select
                            value={san.type}
                            onValueChange={(value) => {
                              const next = [...watchedSans];
                              next[index] = {
                                ...san,
                                type: value as CertSubjectAlternativeNameType
                              };
                              setValue("subjectAlternativeNames", next);
                              markCustomPreset();
                            }}
                          >
                            <SelectTrigger className="w-40">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent position="popper">
                              {SAN_TYPE_OPTIONS.map((type) => (
                                <SelectItem key={type} value={type}>
                                  {SAN_TYPE_LABELS[type]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Select
                            value={san.include}
                            onValueChange={(value) => {
                              const next = [...watchedSans];
                              next[index] = {
                                ...san,
                                include: value as (typeof SAN_INCLUDE_OPTIONS)[number]
                              };
                              setValue("subjectAlternativeNames", next);
                              markCustomPreset();
                            }}
                          >
                            <SelectTrigger className="w-28">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent position="popper">
                              {SAN_INCLUDE_OPTIONS.map((type) => (
                                <SelectItem key={type} value={type}>
                                  {SAN_INCLUDE_LABELS[type]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Input
                            placeholder="Pattern/Value (use * for wildcards)"
                            value={san.value?.[0] || ""}
                            onChange={(e) => {
                              const next = [...watchedSans];
                              next[index] = {
                                ...san,
                                value: e.target.value.trim() ? [e.target.value.trim()] : []
                              };
                              setValue("subjectAlternativeNames", next);
                              markCustomPreset();
                            }}
                            className="flex-1"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeSan(index)}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      ))}
                      <Button type="button" variant="outline" size="sm" onClick={addSan}>
                        <Plus className="size-4" /> Add SAN
                      </Button>
                    </div>
                  </SectionToggle>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-8">
                  <SectionToggle
                    title="Restrict signature algorithms"
                    description="Only allow the signature algorithms you select."
                    enabled={restrictSignature}
                    error={errors.signature}
                    onChange={(enabled) => {
                      setRestrictSignature(enabled);
                      if (!enabled) setValue("signatureAlgorithm", { allowedAlgorithms: [] });
                      clearError("signature");
                      markCustomPreset();
                    }}
                  >
                    {renderAlgorithmGrid(
                      SIGNATURE_ALGORITHMS,
                      watchedSignatureAlgs,
                      "signatureAlgorithm",
                      "allowedAlgorithms"
                    )}
                  </SectionToggle>

                  <SectionToggle
                    title="Restrict key algorithms"
                    description="Only allow the key algorithms you select."
                    enabled={restrictKeyAlg}
                    error={errors.keyAlgorithm}
                    onChange={(enabled) => {
                      setRestrictKeyAlg(enabled);
                      if (!enabled) setValue("keyAlgorithm", { allowedKeyTypes: [] });
                      clearError("keyAlgorithm");
                      markCustomPreset();
                    }}
                  >
                    {renderAlgorithmGrid(
                      KEY_ALGORITHMS,
                      watchedKeyAlgs,
                      "keyAlgorithm",
                      "allowedKeyTypes"
                    )}
                  </SectionToggle>
                </div>
              )}

              {step === 3 && (
                <div className="space-y-8">
                  <SectionToggle
                    title="Restrict key usages"
                    description="Require, allow, or deny individual key usages."
                    enabled={restrictKeyUsages}
                    error={errors.keyUsages}
                    onChange={(enabled) => {
                      setRestrictKeyUsages(enabled);
                      if (!enabled)
                        setValue("keyUsages", { requiredUsages: [], optionalUsages: [] });
                      clearError("keyUsages");
                      markCustomPreset();
                    }}
                  >
                    {renderUsageGrid(
                      KEY_USAGE_OPTIONS,
                      keyUsagePolicyOf as (u: never) => UsagePolicy,
                      setKeyUsagePolicy as (u: never, p: UsagePolicy) => void,
                      formatKeyUsage as (u: never) => string
                    )}
                  </SectionToggle>

                  <SectionToggle
                    title="Restrict extended key usages"
                    description="Require, allow, or deny individual extended key usages."
                    enabled={restrictExtendedKeyUsages}
                    error={errors.extendedKeyUsages}
                    onChange={(enabled) => {
                      setRestrictExtendedKeyUsages(enabled);
                      if (!enabled)
                        setValue("extendedKeyUsages", { requiredUsages: [], optionalUsages: [] });
                      clearError("extendedKeyUsages");
                      markCustomPreset();
                    }}
                  >
                    {renderUsageGrid(
                      EXTENDED_KEY_USAGE_OPTIONS,
                      extendedKeyUsagePolicyOf as (u: never) => UsagePolicy,
                      setExtendedKeyUsagePolicy as (u: never, p: UsagePolicy) => void,
                      formatExtendedKeyUsage as (u: never) => string
                    )}
                  </SectionToggle>
                </div>
              )}

              {step === 4 && (
                <div className="space-y-8">
                  <SectionToggle
                    title="Set maximum validity"
                    description="Cap how long issued certificates can remain valid."
                    enabled={restrictValidity}
                    onChange={(enabled) => {
                      setRestrictValidity(enabled);
                      markCustomPreset();
                    }}
                  >
                    <div className="flex items-end gap-3">
                      <Controller
                        control={control}
                        name="validity.maxDuration.value"
                        render={({ field, fieldState: { error } }) => (
                          <DurationInput
                            field={field}
                            error={error}
                            onCustomPreset={markCustomPreset}
                          />
                        )}
                      />
                      <Controller
                        control={control}
                        name="validity.maxDuration.unit"
                        render={({ field }) => (
                          <Field className="flex-1">
                            <FieldLabel>Unit</FieldLabel>
                            <FieldContent>
                              <Select
                                value={field.value}
                                onValueChange={(value) => {
                                  field.onChange(value);
                                  markCustomPreset();
                                }}
                              >
                                <SelectTrigger className="w-full">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent position="popper">
                                  <SelectItem value={CertDurationUnit.HOURS}>Hours</SelectItem>
                                  <SelectItem value={CertDurationUnit.DAYS}>Days</SelectItem>
                                  <SelectItem value={CertDurationUnit.MONTHS}>Months</SelectItem>
                                  <SelectItem value={CertDurationUnit.YEARS}>Years</SelectItem>
                                </SelectContent>
                              </Select>
                            </FieldContent>
                          </Field>
                        )}
                      />
                    </div>
                  </SectionToggle>

                  <SectionToggle
                    title="Configure basic constraints"
                    description="Control whether issued certificates can act as a CA. Off allows any."
                    enabled={configureBasicConstraints}
                    onChange={(enabled) => {
                      setConfigureBasicConstraints(enabled);
                      markCustomPreset();
                    }}
                  >
                    <div className="space-y-4">
                      <Controller
                        control={control}
                        name="basicConstraints.isCA"
                        render={({ field }) => (
                          <Field>
                            <FieldLabel>CA certificate (isCA)</FieldLabel>
                            <FieldContent>
                              <Select
                                value={field.value}
                                onValueChange={(value) => {
                                  field.onChange(value);
                                  if (value === CertPolicyState.DENIED) {
                                    setValue("basicConstraints.maxPathLength", undefined);
                                  }
                                  markCustomPreset();
                                }}
                              >
                                <SelectTrigger className="w-full">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent position="popper">
                                  <SelectItem value={CertPolicyState.DENIED}>Deny</SelectItem>
                                  <SelectItem value={CertPolicyState.ALLOWED}>Allow</SelectItem>
                                  <SelectItem value={CertPolicyState.REQUIRED}>Require</SelectItem>
                                </SelectContent>
                              </Select>
                            </FieldContent>
                          </Field>
                        )}
                      />
                      {watchedIsCAPolicy !== CertPolicyState.DENIED && (
                        <Controller
                          control={control}
                          name="basicConstraints.maxPathLength"
                          render={({ field }) => (
                            <Field>
                              <FieldLabel>Maximum path length</FieldLabel>
                              <FieldContent>
                                <Input
                                  type="number"
                                  min={0}
                                  placeholder="Leave empty for no limit"
                                  value={field.value ?? ""}
                                  onChange={(e) => {
                                    field.onChange(
                                      e.target.value === "" ? null : parseInt(e.target.value, 10)
                                    );
                                    markCustomPreset();
                                  }}
                                />
                                <FieldDescription>
                                  How many sub-CA levels can exist below this certificate.
                                </FieldDescription>
                              </FieldContent>
                            </Field>
                          )}
                        />
                      )}
                    </div>
                  </SectionToggle>
                </div>
              )}
            </div>

            <aside className="hidden w-80 shrink-0 flex-col gap-4 overflow-y-auto border-l border-border px-6 py-6 lg:flex">
              <div className="mb-auto">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-medium tracking-wider text-muted uppercase">
                    Step {step + 1} · {currentStep.rightLabel}
                  </p>
                  <DocumentationLinkBadge href={PkiDocsUrls.settings.policies} />
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
                Step {step + 1} of {STEPS.length}
              </span>
              {step > 0 && (
                <Button type="button" variant="outline" onClick={goBack}>
                  Back
                </Button>
              )}
              {isLast ? (
                <Button
                  key="submit-cta"
                  type="button"
                  variant="project"
                  isPending={isSubmitting}
                  isDisabled={isSubmitting}
                  onClick={handleSubmit(onFormSubmit)}
                >
                  {isEdit ? "Save Changes" : "Create Policy"}
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
    </Sheet>
  );
};
