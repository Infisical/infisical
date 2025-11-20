/* eslint-disable no-nested-ternary */
import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { faPlus, faTrash } from "@fortawesome/free-solid-svg-icons";
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
  TextArea
} from "@app/components/v2";
import { useProject } from "@app/context";
import {
  useCreateCertificateTemplateV2WithPolicies,
  useUpdateCertificateTemplateV2WithPolicies
} from "@app/hooks/api/certificateTemplates/mutations";
import {
  TCertificateTemplateV2Policy,
  TCertificateTemplateV2WithPolicies
} from "@app/hooks/api/certificateTemplates/types";

import {
  CertDurationUnit,
  CertExtendedKeyUsageType,
  CertKeyUsageType,
  CertSanInclude,
  CertSubjectAlternativeNameType,
  CertSubjectAttributeInclude,
  CertSubjectAttributeType,
  SAN_INCLUDE_OPTIONS,
  SAN_TYPE_OPTIONS,
  SUBJECT_ATTRIBUTE_INCLUDE_OPTIONS,
  SUBJECT_ATTRIBUTE_TYPE_OPTIONS,
  TEMPLATE_PRESET_IDS,
  type TemplatePresetId
} from "./shared/certificate-constants";
import { CERTIFICATE_TEMPLATE_PRESETS } from "./shared/template-presets";
import { KeyUsagesSection, TemplateFormData, templateSchema } from "./shared";

export type FormData = TemplateFormData;

type AttributeTransform = NonNullable<TCertificateTemplateV2Policy["subject"]>[0];
type SanTransform = NonNullable<TCertificateTemplateV2Policy["sans"]>[0];
type KeyUsagesTransform = TCertificateTemplateV2Policy["keyUsages"];
type ExtendedKeyUsagesTransform = TCertificateTemplateV2Policy["extendedKeyUsages"];
type AlgorithmsTransform = TCertificateTemplateV2Policy["algorithms"];
type ValidityTransform = TCertificateTemplateV2Policy["validity"];

interface Props {
  isOpen: boolean;
  onClose: () => void;
  template?: TCertificateTemplateV2WithPolicies;
  mode?: "create" | "edit";
}

const ATTRIBUTE_TYPE_LABELS: Record<(typeof SUBJECT_ATTRIBUTE_TYPE_OPTIONS)[number], string> = {
  common_name: "Common Name (CN)"
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

export const CreateTemplateModal = ({ isOpen, onClose, template, mode = "create" }: Props) => {
  const { currentProject } = useProject();
  const createTemplate = useCreateCertificateTemplateV2WithPolicies();
  const updateTemplate = useUpdateCertificateTemplateV2WithPolicies();

  const isEdit = mode === "edit" && template;

  const convertApiToUiFormat = (templateData: TCertificateTemplateV2WithPolicies): FormData => {
    const attributes: FormData["attributes"] = [];
    if (templateData.subject && Array.isArray(templateData.subject)) {
      templateData.subject.forEach((subj) => {
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
    if (templateData.sans && Array.isArray(templateData.sans)) {
      templateData.sans.forEach((san) => {
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
      requiredUsages: (templateData.keyUsages?.required || []) as CertKeyUsageType[],
      optionalUsages: (templateData.keyUsages?.allowed || []) as CertKeyUsageType[]
    };

    const extendedKeyUsages = {
      requiredUsages: (templateData.extendedKeyUsages?.required ||
        []) as CertExtendedKeyUsageType[],
      optionalUsages: (templateData.extendedKeyUsages?.allowed || []) as CertExtendedKeyUsageType[]
    };

    const validity = templateData.validity?.max
      ? (() => {
          const maxValue = templateData.validity.max;
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
      allowedAlgorithms: templateData.algorithms?.signature || [],
      defaultAlgorithm: ""
    };

    const keyAlgorithm = {
      allowedKeyTypes: templateData.algorithms?.keyAlgorithm || [],
      defaultKeyType: ""
    };

    return {
      preset: TEMPLATE_PRESET_IDS.CUSTOM,
      name: templateData.name || "",
      description: templateData.description || "",
      attributes,
      subjectAlternativeNames,
      keyUsages,
      extendedKeyUsages,
      validity,
      signatureAlgorithm,
      keyAlgorithm
    };
  };

  const getDefaultValues = (): FormData & { preset: TemplatePresetId } => {
    return {
      preset: TEMPLATE_PRESET_IDS.CUSTOM,
      name: "",
      description: "",
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

  const { control, handleSubmit, reset, watch, setValue, formState } = useForm<
    FormData & { preset: TemplatePresetId }
  >({
    resolver: zodResolver(templateSchema),
    defaultValues: getDefaultValues(),
    mode: "onChange",
    reValidateMode: "onChange",
    criteriaMode: "all"
  });

  useEffect(() => {
    if (isEdit && template) {
      const convertedData = convertApiToUiFormat(template);
      reset({ ...convertedData, preset: TEMPLATE_PRESET_IDS.CUSTOM });
    } else if (!isEdit) {
      reset(getDefaultValues());
    }
  }, [isEdit, template, reset]);

  const watchedAttributes = watch("attributes") || [];
  const watchedSans = watch("subjectAlternativeNames") || [];
  const watchedKeyUsages = watch("keyUsages") || { requiredUsages: [], optionalUsages: [] };
  const watchedExtendedKeyUsages = watch("extendedKeyUsages") || {
    requiredUsages: [],
    optionalUsages: []
  };
  const watchedPreset = watch("preset") || TEMPLATE_PRESET_IDS.CUSTOM;

  const handlePresetChange = (presetId: TemplatePresetId) => {
    setValue("preset", presetId);

    if (presetId === TEMPLATE_PRESET_IDS.CUSTOM) {
      return;
    }

    const selectedPreset = CERTIFICATE_TEMPLATE_PRESETS.find((p) => p.id === presetId);
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

    return {
      name: data.name,
      description: data.description,
      subject,
      sans,
      keyUsages,
      extendedKeyUsages,
      algorithms,
      validity
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
        templateId: template.id,
        ...transformedData
      };
      await updateTemplate.mutateAsync(updateData);
    } else {
      if (!currentProject?.id) {
        throw new Error("Project ID is required for creating a template");
      }

      const createData = {
        projectId: currentProject.id,
        ...transformedData
      };
      await createTemplate.mutateAsync(createData);
    }

    createNotification({
      text: `Certificate template ${isEdit ? "updated" : "created"} successfully`,
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

    if (watchedPreset !== TEMPLATE_PRESET_IDS.CUSTOM) {
      setValue("preset", TEMPLATE_PRESET_IDS.CUSTOM);
    }
  };

  const removeAttribute = (index: number) => {
    const newAttributes = watchedAttributes.filter((_, i) => i !== index);
    setValue("attributes", newAttributes);

    if (watchedPreset !== TEMPLATE_PRESET_IDS.CUSTOM) {
      setValue("preset", TEMPLATE_PRESET_IDS.CUSTOM);
    }
  };

  const addSan = () => {
    const newSan = {
      type: SAN_TYPE_OPTIONS[0],
      include: SAN_INCLUDE_OPTIONS[1],
      value: ["*"]
    };
    setValue("subjectAlternativeNames", [...watchedSans, newSan]);

    if (watchedPreset !== TEMPLATE_PRESET_IDS.CUSTOM) {
      setValue("preset", TEMPLATE_PRESET_IDS.CUSTOM);
    }
  };

  const removeSan = (index: number) => {
    const newSans = watchedSans.filter((_, i) => i !== index);
    setValue("subjectAlternativeNames", newSans);

    if (watchedPreset !== TEMPLATE_PRESET_IDS.CUSTOM) {
      setValue("preset", TEMPLATE_PRESET_IDS.CUSTOM);
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

    if (watchedPreset !== TEMPLATE_PRESET_IDS.CUSTOM) {
      setValue("preset", TEMPLATE_PRESET_IDS.CUSTOM);
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

    if (watchedPreset !== TEMPLATE_PRESET_IDS.CUSTOM) {
      setValue("preset", TEMPLATE_PRESET_IDS.CUSTOM);
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
        title={isEdit ? "Edit Certificate Template" : "Create Certificate Template"}
        subTitle={
          isEdit
            ? `Update configuration for ${template?.name}`
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
                    label="Template Name"
                    isRequired
                    isError={Boolean(error)}
                    errorText={error?.message}
                  >
                    <Input {...field} placeholder="Enter template name" className="w-full" />
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
                    <TextArea {...field} placeholder="Enter template description" rows={3} />
                  </FormControl>
                )}
              />

              <Controller
                control={control}
                name="preset"
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    label="Template Preset"
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
                      <SelectItem value={TEMPLATE_PRESET_IDS.CUSTOM}>Custom</SelectItem>
                      {CERTIFICATE_TEMPLATE_PRESETS.map((preset) => (
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

                                if (watchedPreset !== TEMPLATE_PRESET_IDS.CUSTOM) {
                                  setValue("preset", TEMPLATE_PRESET_IDS.CUSTOM);
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

                                if (watchedPreset !== TEMPLATE_PRESET_IDS.CUSTOM) {
                                  setValue("preset", TEMPLATE_PRESET_IDS.CUSTOM);
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

                                if (watchedPreset !== TEMPLATE_PRESET_IDS.CUSTOM) {
                                  setValue("preset", TEMPLATE_PRESET_IDS.CUSTOM);
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

                              if (watchedPreset !== TEMPLATE_PRESET_IDS.CUSTOM) {
                                setValue("preset", TEMPLATE_PRESET_IDS.CUSTOM);
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

                              if (watchedPreset !== TEMPLATE_PRESET_IDS.CUSTOM) {
                                setValue("preset", TEMPLATE_PRESET_IDS.CUSTOM);
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

                              if (watchedPreset !== TEMPLATE_PRESET_IDS.CUSTOM) {
                                setValue("preset", TEMPLATE_PRESET_IDS.CUSTOM);
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
          </Accordion>

          <div className="flex gap-3">
            <Button
              type="submit"
              colorSchema="primary"
              isLoading={isEdit ? updateTemplate.isPending : createTemplate.isPending}
              isDisabled={
                !formState.isValid || (isEdit ? updateTemplate.isPending : createTemplate.isPending)
              }
            >
              {isEdit ? "Save Changes" : "Create"}
            </Button>
            <Button
              variant="outline_bg"
              onClick={onClose}
              disabled={isEdit ? updateTemplate.isPending : createTemplate.isPending}
            >
              Cancel
            </Button>
          </div>
        </form>
      </ModalContent>
    </Modal>
  );
};
