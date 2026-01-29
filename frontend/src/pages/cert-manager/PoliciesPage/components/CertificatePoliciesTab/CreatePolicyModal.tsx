/* eslint-disable no-nested-ternary */
import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { faPlus, faQuestionCircle, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";

import { createNotification } from "@app/components/notifications";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Button,
  Checkbox,
  FormControl,
  IconButton,
  Input,
  Modal,
  ModalContent,
  Select,
  SelectItem,
  TextArea,
  Tooltip
} from "@app/components/v2";
import { useProject } from "@app/context";
import {
  TCertificatePolicy,
  TCertificatePolicyRule,
  useCreateCertificatePolicy,
  useUpdateCertificatePolicy
} from "@app/hooks/api/certificatePolicies";

import {
  CertDurationUnit,
  CertExtendedKeyUsageType,
  CertKeyUsageType,
  CertPolicyState,
  CertSanInclude,
  CertSubjectAlternativeNameType,
  CertSubjectAttributeInclude,
  CertSubjectAttributeType,
  POLICY_PRESET_IDS,
  type PolicyPresetId,
  SAN_INCLUDE_OPTIONS,
  SAN_TYPE_OPTIONS,
  SUBJECT_ATTRIBUTE_INCLUDE_OPTIONS,
  SUBJECT_ATTRIBUTE_TYPE_OPTIONS
} from "./shared/certificate-constants";
import { CERTIFICATE_POLICY_PRESETS } from "./shared/policy-presets";
import { KeyUsagesSection, PolicyFormData, policySchema } from "./shared";

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
  locality: "Locality (L)"
};

const SAN_TYPE_LABELS: Record<(typeof SAN_TYPE_OPTIONS)[number], string> = {
  dns_name: "DNS Name",
  ip_address: "IP Address",
  email: "Email",
  uri: "URI"
};

const SUBJECT_ATTRIBUTE_LABELS: Record<(typeof SUBJECT_ATTRIBUTE_INCLUDE_OPTIONS)[number], string> =
  {
    optional: "Allow",
    prohibit: "Deny"
  };

const SAN_INCLUDE_LABELS: Record<(typeof SAN_INCLUDE_OPTIONS)[number], string> = {
  mandatory: "Require",
  optional: "Allow",
  prohibit: "Deny"
};

const SIGNATURE_ALGORITHMS = [
  "SHA256-RSA",
  "SHA384-RSA",
  "SHA512-RSA",
  "SHA256-ECDSA",
  "SHA384-ECDSA",
  "SHA512-ECDSA"
] as const;

const KEY_ALGORITHMS = [
  "RSA-2048",
  "RSA-3072",
  "RSA-4096",
  "ECDSA-P256",
  "ECDSA-P384",
  "ECDSA-P521"
] as const;

export const CreatePolicyModal = ({
  isOpen,
  onClose,
  policy,
  mode = "create",
  onComplete
}: Props) => {
  const { currentProject } = useProject();
  const createPolicy = useCreateCertificatePolicy();
  const updatePolicy = useUpdateCertificatePolicy();

  const isEdit = mode === "edit" && policy;

  const convertApiToUiFormat = (policyData: TCertificatePolicy): FormData => {
    const attributes: FormData["attributes"] = [];
    if (policyData.subject && Array.isArray(policyData.subject)) {
      policyData.subject.forEach((subj) => {
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
          if (maxValue.length < 2) return undefined;

          const lastChar = maxValue.slice(-1);
          const numberPart = maxValue.slice(0, -1);
          const value = parseInt(numberPart, 10);

          if (Number.isNaN(value) || value <= 0 || numberPart !== value.toString()) {
            return undefined;
          }

          let unit: CertDurationUnit = CertDurationUnit.DAYS;
          if (lastChar === "d") {
            unit = CertDurationUnit.DAYS;
          } else if (lastChar === "m") {
            unit = CertDurationUnit.MONTHS;
          } else if (lastChar === "y") {
            unit = CertDurationUnit.YEARS;
          } else {
            return undefined;
          }

          return {
            maxDuration: { value, unit }
          };
        })()
      : { maxDuration: { value: 365, unit: CertDurationUnit.DAYS } };

    const signatureAlgorithm = {
      allowedAlgorithms: policyData.algorithms?.signature || [],
      defaultAlgorithm: ""
    };

    const keyAlgorithm = {
      allowedKeyTypes: policyData.algorithms?.keyAlgorithm || [],
      defaultKeyType: ""
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

  const { control, handleSubmit, reset, watch, setValue, formState, trigger } = useForm<
    FormData & { preset: PolicyPresetId }
  >({
    resolver: zodResolver(policySchema),
    defaultValues: getDefaultValues(),
    mode: "onChange",
    reValidateMode: "onChange",
    criteriaMode: "all"
  });

  useEffect(() => {
    if (isEdit && policy) {
      const convertedData = convertApiToUiFormat(policy);
      reset({ ...convertedData, preset: POLICY_PRESET_IDS.CUSTOM });
    } else if (!isEdit) {
      reset(getDefaultValues());
    }
  }, [isEdit, policy, reset]);

  const watchedAttributes = watch("attributes") || [];
  const watchedSans = watch("subjectAlternativeNames") || [];
  const watchedKeyUsages = watch("keyUsages") || { requiredUsages: [], optionalUsages: [] };
  const watchedExtendedKeyUsages = watch("extendedKeyUsages") || {
    requiredUsages: [],
    optionalUsages: []
  };
  const watchedPreset = watch("preset") || POLICY_PRESET_IDS.CUSTOM;
  const watchedIsCAPolicy = watch("basicConstraints.isCA") || CertPolicyState.DENIED;

  const handlePresetChange = async (presetId: PolicyPresetId) => {
    setValue("preset", presetId);

    if (presetId === POLICY_PRESET_IDS.CUSTOM) {
      await trigger();
      return;
    }

    const selectedPreset = CERTIFICATE_POLICY_PRESETS.find((p) => p.id === presetId);
    if (selectedPreset) {
      if (selectedPreset.formData.keyUsages) {
        setValue("keyUsages", selectedPreset.formData.keyUsages);
      }
      if (selectedPreset.formData.extendedKeyUsages) {
        setValue("extendedKeyUsages", selectedPreset.formData.extendedKeyUsages);
      }
      if (selectedPreset.formData.attributes) {
        setValue("attributes", selectedPreset.formData.attributes);
      }
      if (selectedPreset.formData.subjectAlternativeNames) {
        setValue("subjectAlternativeNames", selectedPreset.formData.subjectAlternativeNames);
      }
      if (selectedPreset.formData.signatureAlgorithm) {
        setValue("signatureAlgorithm", selectedPreset.formData.signatureAlgorithm);
      }
      if (selectedPreset.formData.keyAlgorithm) {
        setValue("keyAlgorithm", selectedPreset.formData.keyAlgorithm);
      }
      if (selectedPreset.formData.basicConstraints) {
        setValue("basicConstraints", selectedPreset.formData.basicConstraints);
      }
      if (selectedPreset.formData.validity) {
        setValue("validity", selectedPreset.formData.validity);
      }

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

        if (
          attr.include === CertSubjectAttributeInclude.OPTIONAL &&
          attr.value &&
          attr.value.length > 0
        ) {
          result.allowed = attr.value;
        } else if (
          attr.include === CertSubjectAttributeInclude.PROHIBIT &&
          attr.value &&
          attr.value.length > 0
        ) {
          result.denied = attr.value;
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

    const subject = consolidateByType(subjectRaw);
    const sans = consolidateByType(sansRaw);

    const keyUsages: KeyUsagesTransform = {
      required: [],
      allowed: []
    };
    if (data.keyUsages?.requiredUsages && data.keyUsages.requiredUsages.length > 0) {
      keyUsages.required = data.keyUsages.requiredUsages;
    }
    if (data.keyUsages?.optionalUsages && data.keyUsages.optionalUsages.length > 0) {
      keyUsages.allowed = data.keyUsages.optionalUsages;
    }

    const extendedKeyUsages: ExtendedKeyUsagesTransform = {
      required: [],
      allowed: []
    };
    if (
      data.extendedKeyUsages?.requiredUsages &&
      data.extendedKeyUsages.requiredUsages.length > 0
    ) {
      extendedKeyUsages.required = data.extendedKeyUsages.requiredUsages;
    }
    if (
      data.extendedKeyUsages?.optionalUsages &&
      data.extendedKeyUsages.optionalUsages.length > 0
    ) {
      extendedKeyUsages.allowed = data.extendedKeyUsages.optionalUsages;
    }

    const algorithms: AlgorithmsTransform = {};
    if (
      data.signatureAlgorithm?.allowedAlgorithms &&
      data.signatureAlgorithm.allowedAlgorithms.length > 0
    ) {
      algorithms.signature = data.signatureAlgorithm.allowedAlgorithms as Array<
        | "SHA256-RSA"
        | "SHA384-RSA"
        | "SHA512-RSA"
        | "SHA256-ECDSA"
        | "SHA384-ECDSA"
        | "SHA512-ECDSA"
      >;
    }
    if (data.keyAlgorithm?.allowedKeyTypes && data.keyAlgorithm.allowedKeyTypes.length > 0) {
      algorithms.keyAlgorithm = data.keyAlgorithm.allowedKeyTypes as Array<
        "RSA-2048" | "RSA-3072" | "RSA-4096" | "ECDSA-P256" | "ECDSA-P384"
      >;
    }

    const validity: ValidityTransform = {};
    if (data.validity?.maxDuration) {
      let unit = "d";
      if (data.validity.maxDuration.unit === CertDurationUnit.DAYS) {
        unit = "d";
      } else if (data.validity.maxDuration.unit === CertDurationUnit.MONTHS) {
        unit = "m";
      } else {
        unit = "y";
      }
      validity.max = `${data.validity.maxDuration.value}${unit}`;
    }

    const basicConstraints =
      data.basicConstraints?.isCA && data.basicConstraints.isCA !== CertPolicyState.DENIED
        ? {
            isCA: data.basicConstraints.isCA,
            maxPathLength: data.basicConstraints.maxPathLength ?? undefined
          }
        : null;

    return {
      name: data.name,
      description: data.description,
      subject,
      sans,
      keyUsages,
      extendedKeyUsages,
      algorithms,
      validity,
      basicConstraints
    };
  };

  const onFormSubmit = async (data: FormData) => {
    if (!currentProject?.id && !isEdit) return;

    const hasEmptyAttributeValues = data.attributes?.some(
      (attr) => !attr.value || attr.value.length === 0 || attr.value.some((v) => !v.trim())
    );

    const hasEmptySanValues = data.subjectAlternativeNames?.some(
      (san) => !san.value || san.value.length === 0 || san.value.some((v) => !v.trim())
    );

    if (hasEmptyAttributeValues || hasEmptySanValues) {
      createNotification({
        text: "All values must be non-empty. Use wildcards (*) if needed.",
        type: "error"
      });
      return;
    }

    const transformedData = transformToApiFormat(data);

    if (isEdit) {
      const updateData = {
        policyId: policy.id,
        ...transformedData
      };
      await updatePolicy.mutateAsync(updateData);
    } else {
      if (!currentProject?.id) {
        throw new Error("Project ID is required for creating a policy");
      }

      const createData = {
        projectId: currentProject.id,
        ...transformedData
      };
      const createdPolicy = await createPolicy.mutateAsync(createData);
      if (onComplete) {
        onComplete(createdPolicy);
      }
    }

    createNotification({
      text: `Certificate policy ${isEdit ? "updated" : "created"} successfully`,
      type: "success"
    });

    reset();
    onClose();
  };

  const addAttribute = () => {
    const newAttribute = {
      type: SUBJECT_ATTRIBUTE_TYPE_OPTIONS[0],
      include: SUBJECT_ATTRIBUTE_INCLUDE_OPTIONS[0],
      value: ["*"]
    };
    setValue("attributes", [...watchedAttributes, newAttribute]);

    if (watchedPreset !== POLICY_PRESET_IDS.CUSTOM) {
      setValue("preset", POLICY_PRESET_IDS.CUSTOM);
    }
  };

  const removeAttribute = (index: number) => {
    const newAttributes = watchedAttributes.filter((_, i) => i !== index);
    setValue("attributes", newAttributes);

    if (watchedPreset !== POLICY_PRESET_IDS.CUSTOM) {
      setValue("preset", POLICY_PRESET_IDS.CUSTOM);
    }
  };

  const addSan = () => {
    const newSan = {
      type: SAN_TYPE_OPTIONS[0],
      include: SAN_INCLUDE_OPTIONS[1],
      value: ["*"]
    };
    setValue("subjectAlternativeNames", [...watchedSans, newSan]);

    if (watchedPreset !== POLICY_PRESET_IDS.CUSTOM) {
      setValue("preset", POLICY_PRESET_IDS.CUSTOM);
    }
  };

  const removeSan = (index: number) => {
    const newSans = watchedSans.filter((_, i) => i !== index);
    setValue("subjectAlternativeNames", newSans);

    if (watchedPreset !== POLICY_PRESET_IDS.CUSTOM) {
      setValue("preset", POLICY_PRESET_IDS.CUSTOM);
    }
  };

  const handleKeyUsagesChange = (usages: {
    requiredUsages: CertKeyUsageType[];
    optionalUsages: CertKeyUsageType[];
  }) => {
    setValue("keyUsages", {
      requiredUsages: usages.requiredUsages,
      optionalUsages: usages.optionalUsages
    });

    if (watchedPreset !== POLICY_PRESET_IDS.CUSTOM) {
      setValue("preset", POLICY_PRESET_IDS.CUSTOM);
    }
  };

  const handleExtendedKeyUsagesChange = (usages: {
    requiredUsages: CertExtendedKeyUsageType[];
    optionalUsages: CertExtendedKeyUsageType[];
  }) => {
    setValue("extendedKeyUsages", {
      requiredUsages: usages.requiredUsages,
      optionalUsages: usages.optionalUsages
    });

    if (watchedPreset !== POLICY_PRESET_IDS.CUSTOM) {
      setValue("preset", POLICY_PRESET_IDS.CUSTOM);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          reset();
        }
        onClose();
      }}
    >
      <ModalContent
        className="max-w-4xl"
        title={isEdit ? "Edit Certificate Policy" : "Create Certificate Policy"}
        subTitle={
          isEdit
            ? `Update configuration for ${policy?.name}`
            : "Define comprehensive certificate policies, validation rules, and constraints"
        }
      >
        <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-6">
          <Accordion type="multiple" defaultValue={["basic", "algorithms"]} className="w-full">
            <div className="space-y-4">
              <Controller
                control={control}
                name="name"
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    label="Policy Name"
                    isRequired
                    isError={Boolean(error)}
                    errorText={error?.message}
                  >
                    <Input {...field} placeholder="Enter policy name" className="w-full" />
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
                    <TextArea {...field} placeholder="Enter policy description" rows={3} />
                  </FormControl>
                )}
              />

              <Controller
                control={control}
                name="preset"
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    label="Policy Preset"
                    isError={Boolean(error)}
                    errorText={error?.message}
                  >
                    <Select
                      value={field.value}
                      onValueChange={handlePresetChange}
                      className="w-full"
                      position="popper"
                      dropdownContainerClassName="max-w-none"
                    >
                      <SelectItem value={POLICY_PRESET_IDS.CUSTOM}>Custom</SelectItem>
                      {CERTIFICATE_POLICY_PRESETS.map((preset) => (
                        <SelectItem key={preset.id} value={preset.id}>
                          {preset.name}
                        </SelectItem>
                      ))}
                    </Select>
                  </FormControl>
                )}
              />
            </div>

            <AccordionItem value="attributes">
              <AccordionTrigger>Subject Attributes</AccordionTrigger>
              <AccordionContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Button
                      type="button"
                      onClick={addAttribute}
                      size="sm"
                      variant="outline_bg"
                      leftIcon={<FontAwesomeIcon icon={faPlus} />}
                    >
                      Add Attribute
                    </Button>
                  </div>

                  <div className="space-y-2">
                    {watchedAttributes.length === 0 ? (
                      <div className="py-8 text-center text-bunker-300">
                        No subject attributes configured yet. Click &quot;Add Attribute&quot; to get
                        started.
                      </div>
                    ) : (
                      watchedAttributes.map((attr, index) => {
                        return (
                          <div
                            // eslint-disable-next-line react/no-array-index-key
                            key={`attr-${attr.type}-${attr.include}-${index}`}
                            className="flex items-start gap-2"
                          >
                            <Select
                              value={attr.type}
                              onValueChange={(value) => {
                                const newAttributes = [...watchedAttributes];
                                newAttributes[index] = {
                                  ...attr,
                                  type: value as CertSubjectAttributeType
                                };
                                setValue("attributes", newAttributes);

                                if (watchedPreset !== POLICY_PRESET_IDS.CUSTOM) {
                                  setValue("preset", POLICY_PRESET_IDS.CUSTOM);
                                }
                              }}
                              className="w-48"
                            >
                              {SUBJECT_ATTRIBUTE_TYPE_OPTIONS.map((type) => (
                                <SelectItem key={type} value={type}>
                                  {ATTRIBUTE_TYPE_LABELS[type]}
                                </SelectItem>
                              ))}
                            </Select>

                            <Select
                              value={attr.include}
                              onValueChange={(value) => {
                                const newAttributes = [...watchedAttributes];
                                newAttributes[index] = {
                                  ...attr,
                                  include:
                                    value as (typeof SUBJECT_ATTRIBUTE_INCLUDE_OPTIONS)[number]
                                };
                                setValue("attributes", newAttributes);

                                if (watchedPreset !== POLICY_PRESET_IDS.CUSTOM) {
                                  setValue("preset", POLICY_PRESET_IDS.CUSTOM);
                                }
                              }}
                              className="w-32"
                            >
                              {SUBJECT_ATTRIBUTE_INCLUDE_OPTIONS.map((type) => (
                                <SelectItem key={type} value={type}>
                                  {SUBJECT_ATTRIBUTE_LABELS[type]}
                                </SelectItem>
                              ))}
                            </Select>

                            <Input
                              placeholder="Pattern/Value (required - use * for wildcards)"
                              value={attr.value?.[0] || ""}
                              onChange={(e) => {
                                const newAttributes = [...watchedAttributes];
                                newAttributes[index] = {
                                  ...attr,
                                  value: e.target.value.trim() ? [e.target.value.trim()] : []
                                };
                                setValue("attributes", newAttributes);

                                if (watchedPreset !== POLICY_PRESET_IDS.CUSTOM) {
                                  setValue("preset", POLICY_PRESET_IDS.CUSTOM);
                                }
                              }}
                              className={`flex-1 ${
                                attr.value && attr.value.length > 0 && attr.value[0] === ""
                                  ? "border-red-500 focus:border-red-500"
                                  : ""
                              }`}
                              required
                            />

                            {watchedAttributes.length > 0 && (
                              <IconButton
                                ariaLabel="Remove Attribute"
                                variant="plain"
                                size="sm"
                                onClick={() => removeAttribute(index)}
                              >
                                <FontAwesomeIcon icon={faTrash} />
                              </IconButton>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="san" className="mt-4">
              <AccordionTrigger>Subject Alternative Names</AccordionTrigger>
              <AccordionContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Button
                      type="button"
                      onClick={addSan}
                      size="sm"
                      variant="outline_bg"
                      leftIcon={<FontAwesomeIcon icon={faPlus} />}
                    >
                      Add SAN
                    </Button>
                  </div>

                  <div className="space-y-2">
                    {watchedSans.length === 0 ? (
                      <div className="py-8 text-center text-bunker-300">
                        No subject alternative names configured yet. Click &quot;Add SAN&quot; to
                        get started.
                      </div>
                    ) : (
                      watchedSans.map((san, index) => (
                        <div
                          // eslint-disable-next-line react/no-array-index-key
                          key={`san-${san.type}-${san.include}-${index}`}
                          className="flex items-start gap-2"
                        >
                          <Select
                            value={san.type}
                            onValueChange={(value) => {
                              const newSans = [...watchedSans];
                              newSans[index] = {
                                ...san,
                                type: value as CertSubjectAlternativeNameType
                              };
                              setValue("subjectAlternativeNames", newSans);

                              if (watchedPreset !== POLICY_PRESET_IDS.CUSTOM) {
                                setValue("preset", POLICY_PRESET_IDS.CUSTOM);
                              }
                            }}
                            className="w-36"
                          >
                            {SAN_TYPE_OPTIONS.map((type) => (
                              <SelectItem key={type} value={type}>
                                {SAN_TYPE_LABELS[type]}
                              </SelectItem>
                            ))}
                          </Select>

                          <Select
                            value={san.include}
                            onValueChange={(value) => {
                              const newSans = [...watchedSans];
                              newSans[index] = {
                                ...san,
                                include: value as (typeof SAN_INCLUDE_OPTIONS)[number]
                              };
                              setValue("subjectAlternativeNames", newSans);

                              if (watchedPreset !== POLICY_PRESET_IDS.CUSTOM) {
                                setValue("preset", POLICY_PRESET_IDS.CUSTOM);
                              }
                            }}
                            className="w-32"
                          >
                            {SAN_INCLUDE_OPTIONS.map((type) => (
                              <SelectItem key={type} value={type}>
                                {SAN_INCLUDE_LABELS[type]}
                              </SelectItem>
                            ))}
                          </Select>

                          <Input
                            placeholder="Pattern/Value (required - use * for wildcards)"
                            value={san.value?.[0] || ""}
                            onChange={(e) => {
                              const newSans = [...watchedSans];
                              newSans[index] = {
                                ...san,
                                value: e.target.value.trim() ? [e.target.value.trim()] : []
                              };
                              setValue("subjectAlternativeNames", newSans);

                              if (watchedPreset !== POLICY_PRESET_IDS.CUSTOM) {
                                setValue("preset", POLICY_PRESET_IDS.CUSTOM);
                              }
                            }}
                            className={`flex-1 ${
                              san.value && san.value.length > 0 && san.value[0] === ""
                                ? "border-red-500 focus:border-red-500"
                                : ""
                            }`}
                            required
                          />

                          {watchedSans.length > 0 && (
                            <IconButton
                              ariaLabel="Remove SAN"
                              variant="plain"
                              size="sm"
                              onClick={() => removeSan(index)}
                            >
                              <FontAwesomeIcon icon={faTrash} />
                            </IconButton>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="algorithms" className="mt-4">
              <AccordionTrigger>Algorithms</AccordionTrigger>
              <AccordionContent>
                <div className="space-y-6">
                  <div>
                    <h4 className="mb-3 text-sm font-medium text-mineshaft-200">
                      Allowed Signature Algorithms
                      <span className="ml-1 text-red-500">*</span>
                    </h4>
                    <Controller
                      control={control}
                      name="signatureAlgorithm.allowedAlgorithms"
                      render={({ field, fieldState: { error } }) => (
                        <FormControl isError={Boolean(error)} errorText={error?.message}>
                          <div className="grid grid-cols-2 gap-2">
                            {SIGNATURE_ALGORITHMS.map((alg) => {
                              const isSelected = field.value?.includes(alg);
                              return (
                                <div key={alg} className="flex items-center space-x-3">
                                  <Checkbox
                                    id={`sig-alg-${alg}`}
                                    isChecked={isSelected}
                                    onCheckedChange={(checked) => {
                                      const current = field.value || [];
                                      let newValue;
                                      if (checked && !isSelected) {
                                        newValue = [...current, alg];
                                      } else if (!checked && isSelected) {
                                        newValue = current.filter((a) => a !== alg);
                                      } else {
                                        return;
                                      }
                                      field.onChange(newValue);
                                    }}
                                  />
                                  <label
                                    htmlFor={`sig-alg-${alg}`}
                                    className="cursor-pointer text-sm font-medium text-mineshaft-200"
                                  >
                                    {alg}
                                  </label>
                                </div>
                              );
                            })}
                          </div>
                        </FormControl>
                      )}
                    />
                  </div>

                  <div>
                    <h4 className="mb-3 text-sm font-medium text-mineshaft-200">
                      Allowed Key Algorithms
                      <span className="ml-1 text-red-500">*</span>
                    </h4>
                    <Controller
                      control={control}
                      name="keyAlgorithm.allowedKeyTypes"
                      render={({ field, fieldState: { error } }) => (
                        <FormControl isError={Boolean(error)} errorText={error?.message}>
                          <div className="grid grid-cols-2 gap-2">
                            {KEY_ALGORITHMS.map((alg) => {
                              const isSelected = field.value?.includes(alg);
                              return (
                                <div key={alg} className="flex items-center space-x-3">
                                  <Checkbox
                                    id={`key-alg-${alg}`}
                                    isChecked={isSelected}
                                    onCheckedChange={(checked) => {
                                      const current = field.value || [];
                                      let newValue;
                                      if (checked && !isSelected) {
                                        newValue = [...current, alg];
                                      } else if (!checked && isSelected) {
                                        newValue = current.filter((a) => a !== alg);
                                      } else {
                                        return;
                                      }
                                      field.onChange(newValue);
                                    }}
                                  />
                                  <label
                                    htmlFor={`key-alg-${alg}`}
                                    className="cursor-pointer text-sm font-medium text-mineshaft-200"
                                  >
                                    {alg}
                                  </label>
                                </div>
                              );
                            })}
                          </div>
                        </FormControl>
                      )}
                    />
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="usages" className="mt-4">
              <AccordionTrigger>Key Usages</AccordionTrigger>
              <AccordionContent>
                <KeyUsagesSection
                  watchedKeyUsages={watchedKeyUsages}
                  watchedExtendedKeyUsages={watchedExtendedKeyUsages}
                  onKeyUsagesChange={handleKeyUsagesChange}
                  onExtendedKeyUsagesChange={handleExtendedKeyUsagesChange}
                />
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="validity" className="mt-4">
              <AccordionTrigger>Certificate Validity</AccordionTrigger>
              <AccordionContent>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <Controller
                      control={control}
                      name="validity.maxDuration.value"
                      render={({ field, fieldState: { error } }) => (
                        <FormControl
                          label="Max Duration"
                          isError={Boolean(error)}
                          errorText={error?.message}
                        >
                          <Input
                            {...field}
                            type="number"
                            placeholder="365"
                            className="w-full"
                            onChange={(e) => field.onChange(Number(e.target.value))}
                          />
                        </FormControl>
                      )}
                    />
                    <Controller
                      control={control}
                      name="validity.maxDuration.unit"
                      render={({ field, fieldState: { error } }) => (
                        <FormControl
                          label="Unit"
                          isError={Boolean(error)}
                          errorText={error?.message}
                        >
                          <Select
                            {...field}
                            onValueChange={field.onChange}
                            className="w-full"
                            position="popper"
                          >
                            <SelectItem value="days">Days</SelectItem>
                            <SelectItem value="months">Months</SelectItem>
                            <SelectItem value="years">Years</SelectItem>
                          </Select>
                        </FormControl>
                      )}
                    />
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="basicConstraints" className="mt-4">
              <AccordionTrigger>Basic Constraints</AccordionTrigger>
              <AccordionContent>
                <div className="space-y-4">
                  <Controller
                    control={control}
                    name="basicConstraints.isCA"
                    render={({ field: { value, onChange }, fieldState: { error } }) => (
                      <FormControl isError={Boolean(error)} errorText={error?.message}>
                        <div className="flex items-center justify-between">
                          <div className="space-y-1">
                            <span className="text-sm font-medium text-mineshaft-100">
                              CA Certificate Property
                            </span>
                            <p className="text-xs text-bunker-300">
                              Controls whether certificates issued under this policy can have the
                              CA:TRUE property.
                            </p>
                          </div>
                          <Select
                            value={value || CertPolicyState.DENIED}
                            onValueChange={(newValue) => {
                              onChange(newValue);
                              if (newValue === CertPolicyState.DENIED) {
                                setValue("basicConstraints.maxPathLength", undefined);
                              }
                            }}
                            className="w-32"
                          >
                            <SelectItem value={CertPolicyState.DENIED}>Deny</SelectItem>
                            <SelectItem value={CertPolicyState.ALLOWED}>Allow</SelectItem>
                            <SelectItem value={CertPolicyState.REQUIRED}>Require</SelectItem>
                          </Select>
                        </div>
                      </FormControl>
                    )}
                  />

                  {watchedIsCAPolicy !== CertPolicyState.DENIED && (
                    <Controller
                      control={control}
                      name="basicConstraints.maxPathLength"
                      render={({ field, fieldState: { error } }) => (
                        <FormControl
                          label={
                            <div className="flex items-center gap-1">
                              <span className="mb-1">Maximum allowed path length</span>
                              <Tooltip
                                content={
                                  <div className="max-w-xs">
                                    <p className="font-medium">Values:</p>
                                    <ul className="mt-1 list-disc pl-4 text-xs">
                                      <li>
                                        <strong>-1</strong> = Unlimited (no restriction)
                                      </li>
                                      <li>
                                        <strong>0</strong> = Can only sign end-entity certificates
                                      </li>
                                      <li>
                                        <strong>1+</strong> = Number of CA levels allowed beneath
                                      </li>
                                    </ul>
                                  </div>
                                }
                              >
                                <FontAwesomeIcon
                                  icon={faQuestionCircle}
                                  size="sm"
                                  className="ml-1 text-mineshaft-400"
                                />
                              </Tooltip>
                            </div>
                          }
                          isError={Boolean(error)}
                          errorText={error?.message}
                          helperText="Defines the pathLen constraint applied to issued certificates. Path length limits how many intermediate CA certificates can exist downstream from the issued certificate in the certificate chain."
                        >
                          <Input
                            {...field}
                            type="number"
                            placeholder="Leave empty to omit the constraint"
                            className="w-full"
                            min={-1}
                            value={field.value ?? ""}
                            onChange={(e) => {
                              const { value } = e.target;
                              if (!value || value === "") {
                                field.onChange(null);
                              } else if (!Number.isInteger(Number(value))) {
                                field.onChange(value);
                              } else {
                                field.onChange(Number(value));
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
          </Accordion>

          <div className="flex gap-3">
            <Button
              type="submit"
              colorSchema="primary"
              isLoading={isEdit ? updatePolicy.isPending : createPolicy.isPending}
              isDisabled={
                !formState.isValid || (isEdit ? updatePolicy.isPending : createPolicy.isPending)
              }
            >
              {isEdit ? "Save Changes" : "Create"}
            </Button>
            <Button
              variant="outline_bg"
              onClick={onClose}
              disabled={isEdit ? updatePolicy.isPending : createPolicy.isPending}
            >
              Cancel
            </Button>
          </div>
        </form>
      </ModalContent>
    </Modal>
  );
};
