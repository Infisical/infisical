import { useMemo } from "react";
import { Controller, useForm } from "react-hook-form";
import { faExclamationTriangle, faPlus, faTrash } from "@fortawesome/free-solid-svg-icons";
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
  useCreateCertificateTemplateV2New,
  useUpdateCertificateTemplateV2New
} from "@app/hooks/api/certificateTemplates/mutations";
import { TCertificateTemplateV2New } from "@app/hooks/api/certificateTemplates/types";

import { INCLUDE_TYPE_OPTIONS, SAN_TYPE_OPTIONS, SUBJECT_ATTRIBUTE_TYPE_OPTIONS } from "./shared/certificate-constants";
import { KeyUsagesSection, TemplateFormData, templateSchema } from "./shared";

export type FormData = TemplateFormData;

interface Props {
  isOpen: boolean;
  onClose: () => void;
  template?: TCertificateTemplateV2New;
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

const INCLUDE_TYPE_LABELS: Record<(typeof INCLUDE_TYPE_OPTIONS)[number], string> = {
  mandatory: "Mandatory",
  optional: "Optional",
  prohibit: "Prohibited"
};

const SIGNATURE_ALGORITHMS = [
  "SHA256-RSA",
  "SHA384-RSA",
  "SHA512-RSA",
  "SHA256-ECDSA",
  "SHA384-ECDSA",
  "SHA512-ECDSA"
];

const KEY_ALGORITHMS = [
  "RSA-2048",
  "RSA-3072",
  "RSA-4096",
  "ECDSA-P256",
  "ECDSA-P384",
  "ECDSA-P521"
];

export const CreateTemplateModal = ({ isOpen, onClose, template, mode = "create" }: Props) => {
  const { currentProject } = useProject();
  const createTemplate = useCreateCertificateTemplateV2New();
  const updateTemplate = useUpdateCertificateTemplateV2New();

  const isEdit = mode === "edit" && template;

  const validateAttributeRules = (attributes: FormData["attributes"]) => {
    if (!attributes) return { isValid: true, warnings: [], invalidIndices: [] };

    const warnings: string[] = [];
    const invalidIndices: number[] = [];

    const attributesByType = attributes.reduce((acc, attr, index) => {
      if (!acc[attr.type]) acc[attr.type] = [];
      acc[attr.type].push({ ...attr, index });
      return acc;
    }, {} as Record<string, Array<(typeof attributes[0] & { index: number })>>);

    Object.entries(attributesByType).forEach(([type, attrs]) => {
      const mandatoryAttrs = attrs.filter(attr => attr.include === 'mandatory');

      if (mandatoryAttrs.length > 1) {
        mandatoryAttrs.forEach(attr => invalidIndices.push(attr.index));
        warnings.push(`Multiple mandatory values found for ${ATTRIBUTE_TYPE_LABELS[type as keyof typeof ATTRIBUTE_TYPE_LABELS]}. Only one mandatory value is allowed per attribute type.`);
      }

      if (mandatoryAttrs.length === 1 && attrs.length > 1) {
        attrs.forEach(attr => invalidIndices.push(attr.index));
        warnings.push(`When a mandatory value exists for ${ATTRIBUTE_TYPE_LABELS[type as keyof typeof ATTRIBUTE_TYPE_LABELS]}, no other values (optional or forbidden) are allowed for that attribute type.`);
      }
    });

    return { isValid: warnings.length === 0, warnings, invalidIndices };
  };

  const { control, handleSubmit, reset, watch, setValue, formState } = useForm<FormData>({
    resolver: zodResolver(templateSchema),
    defaultValues: isEdit
      ? {
          slug: template.slug,
          description: template.description || "",
          attributes: template.attributes || [],
          keyUsages: {
            requiredUsages: template.keyUsages?.requiredUsages?.all || [],
            optionalUsages: template.keyUsages?.optionalUsages?.all || []
          },
          extendedKeyUsages: {
            requiredUsages: template.extendedKeyUsages?.requiredUsages?.all || [],
            optionalUsages: template.extendedKeyUsages?.optionalUsages?.all || []
          },
          subjectAlternativeNames: template.subjectAlternativeNames || [],
          validity: template.validity || { maxDuration: { value: 365, unit: "days" } },
          signatureAlgorithm: template.signatureAlgorithm || {
            allowedAlgorithms: ["SHA256-RSA"],
            defaultAlgorithm: "SHA256-RSA"
          },
          keyAlgorithm: template.keyAlgorithm || {
            allowedKeyTypes: ["RSA-2048"],
            defaultKeyType: "RSA-2048"
          }
        }
      : {
          slug: "",
          description: "",
          attributes: [],
          keyUsages: { requiredUsages: [], optionalUsages: [] },
          extendedKeyUsages: { requiredUsages: [], optionalUsages: [] },
          subjectAlternativeNames: [],
          validity: {
            maxDuration: { value: 365, unit: "days" }
          },
          signatureAlgorithm: {
            allowedAlgorithms: ["SHA256-RSA"],
            defaultAlgorithm: "SHA256-RSA"
          },
          keyAlgorithm: {
            allowedKeyTypes: ["RSA-2048"],
            defaultKeyType: "RSA-2048"
          }
        }
  });

  const watchedAttributes = watch("attributes") || [];
  const watchedSans = watch("subjectAlternativeNames") || [];
  const watchedKeyUsages = watch("keyUsages") || { requiredUsages: [], optionalUsages: [] };
  const watchedExtendedKeyUsages = watch("extendedKeyUsages") || { requiredUsages: [], optionalUsages: [] };

  const attributeValidation = useMemo(() =>
    validateAttributeRules(watchedAttributes),
    [watchedAttributes]
  );

  const onFormSubmit = async (data: FormData) => {
    try {
      if (!currentProject?.id && !isEdit) return;

      if (!attributeValidation.isValid) {
        createNotification({
          text: "Please fix validation errors before submitting",
          type: "error"
        });
        return;
      }

      const hasEmptyAttributeValues = data.attributes?.some(attr =>
        !attr.value || attr.value.length === 0 || attr.value.some(v => !v.trim())
      );

      const hasEmptySanValues = data.subjectAlternativeNames?.some(san =>
        !san.value || san.value.length === 0 || san.value.some(v => !v.trim())
      );

      if (hasEmptyAttributeValues || hasEmptySanValues) {
        createNotification({
          text: "All values must be non-empty. Use wildcards (*) if needed.",
          type: "error"
        });
        return;
      }

      if (isEdit) {
        const updateData = {
          templateId: template.id,
          name: data.slug,
          description: data.description,
          attributes: data.attributes || [],
          keyUsages: {
            requiredUsages: { all: data.keyUsages?.requiredUsages || [] },
            optionalUsages: { all: data.keyUsages?.optionalUsages || [] }
          },
          extendedKeyUsages: {
            requiredUsages: { all: data.extendedKeyUsages?.requiredUsages || [] },
            optionalUsages: { all: data.extendedKeyUsages?.optionalUsages || [] }
          },
          subjectAlternativeNames: data.subjectAlternativeNames || [],
          validity: {
            maxDuration: data.validity?.maxDuration || { value: 365, unit: "days" as const }
          },
          signatureAlgorithm: {
            allowedAlgorithms: data.signatureAlgorithm?.allowedAlgorithms || ["SHA256-RSA"],
            defaultAlgorithm: data.signatureAlgorithm?.defaultAlgorithm || "SHA256-RSA"
          },
          keyAlgorithm: {
            allowedKeyTypes: data.keyAlgorithm?.allowedKeyTypes || ["RSA-2048"],
            defaultKeyType: data.keyAlgorithm?.defaultKeyType || "RSA-2048"
          }
        };
        await updateTemplate.mutateAsync(updateData);
      } else {
        const createData = {
          projectId: currentProject!.id,
          slug: data.slug,
          description: data.description,
          attributes: data.attributes || [],
          keyUsages: {
            requiredUsages: { all: data.keyUsages?.requiredUsages || [] },
            optionalUsages: { all: data.keyUsages?.optionalUsages || [] }
          },
          extendedKeyUsages: {
            requiredUsages: { all: data.extendedKeyUsages?.requiredUsages || [] },
            optionalUsages: { all: data.extendedKeyUsages?.optionalUsages || [] }
          },
          subjectAlternativeNames: data.subjectAlternativeNames || [],
          validity: {
            maxDuration: data.validity?.maxDuration || { value: 365, unit: "days" as const }
          },
          signatureAlgorithm: {
            allowedAlgorithms: data.signatureAlgorithm?.allowedAlgorithms || ["SHA256-RSA"],
            defaultAlgorithm: data.signatureAlgorithm?.defaultAlgorithm || "SHA256-RSA"
          },
          keyAlgorithm: {
            allowedKeyTypes: data.keyAlgorithm?.allowedKeyTypes || ["RSA-2048"],
            defaultKeyType: data.keyAlgorithm?.defaultKeyType || "RSA-2048"
          }
        };
        await createTemplate.mutateAsync(createData);
      }

      createNotification({
        text: `Certificate template ${isEdit ? "updated" : "created"} successfully`,
        type: "success"
      });

      reset();
      onClose();
    } catch (error) {
      console.error(`Error ${isEdit ? "updating" : "creating"} template:`, error);
      createNotification({
        text: `Failed to ${isEdit ? "update" : "create"} certificate template`,
        type: "error"
      });
    }
  };

  const addAttribute = () => {
    const newAttribute = {
      type: SUBJECT_ATTRIBUTE_TYPE_OPTIONS[0],
      include: INCLUDE_TYPE_OPTIONS[1],
      value: ["*"]
    };
    setValue("attributes", [...watchedAttributes, newAttribute]);
  };

  const removeAttribute = (index: number) => {
    const newAttributes = watchedAttributes.filter((_, i) => i !== index);
    setValue("attributes", newAttributes);
  };

  const addSan = () => {
    const newSan = {
      type: SAN_TYPE_OPTIONS[0],
      include: INCLUDE_TYPE_OPTIONS[1],
      value: ["*"]
    };
    setValue("subjectAlternativeNames", [...watchedSans, newSan]);
  };

  const removeSan = (index: number) => {
    const newSans = watchedSans.filter((_, i) => i !== index);
    setValue("subjectAlternativeNames", newSans);
  };

  const handleKeyUsagesChange = (usages: { requiredUsages: string[]; optionalUsages: string[] }) => {
    setValue("keyUsages", {
      requiredUsages: usages.requiredUsages as any,
      optionalUsages: usages.optionalUsages as any
    });
  };

  const handleExtendedKeyUsagesChange = (usages: { requiredUsages: string[]; optionalUsages: string[] }) => {
    setValue("extendedKeyUsages", {
      requiredUsages: usages.requiredUsages as any,
      optionalUsages: usages.optionalUsages as any
    });
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
            ? `Update configuration for ${template?.slug}`
            : "Define comprehensive certificate policies, validation rules, and constraints"
        }
      >
        <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-6">
          <Accordion type="multiple" defaultValue={["basic"]} className="w-full">
            <div className="space-y-4">
              <Controller
                control={control}
                name="slug"
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

                  {/* Validation warnings */}
                  {!attributeValidation.isValid && attributeValidation.warnings.length > 0 && (
                    <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-md p-3">
                      <div className="flex items-start gap-2">
                        <FontAwesomeIcon icon={faExclamationTriangle} className="text-yellow-500 mt-0.5" />
                        <div className="flex-1">
                          <h4 className="text-yellow-500 font-medium text-sm">Validation Warnings</h4>
                          <ul className="text-yellow-400 text-sm mt-1 space-y-1">
                            {attributeValidation.warnings.map((warning, index) => (
                              <li key={index}>• {warning}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    {watchedAttributes.length === 0 ? (
                      <div className="text-bunker-300 py-8 text-center">
                        No subject attributes configured yet. Click &quot;Add Attribute&quot; to get
                        started.
                      </div>
                    ) : (
                      watchedAttributes.map((attr, index) => {
                        const isInvalid = attributeValidation.invalidIndices.includes(index);
                        const errorClass = isInvalid ? "border-red-500 focus:border-red-500" : "";

                        return (
                        <div key={`attr-${attr.type}-${attr.include}-${index}`} className="flex items-start gap-2">
                          {isInvalid ? (
                            <Tooltip content="This attribute has validation errors. Check the warnings above for details.">
                              <div className="flex items-start gap-2 flex-1">
                                <Select
                                  value={attr.type}
                                  onValueChange={(value) => {
                                    const newAttributes = [...watchedAttributes];
                                    newAttributes[index] = { ...attr, type: value as any };
                                    setValue("attributes", newAttributes);
                                  }}
                                  className={`w-48 ${errorClass}`}
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
                                    newAttributes[index] = { ...attr, include: value as any };
                                    setValue("attributes", newAttributes);
                                  }}
                                  className={`w-32 ${errorClass}`}
                                >
                                  {INCLUDE_TYPE_OPTIONS.map((type) => (
                                    <SelectItem key={type} value={type}>
                                      {INCLUDE_TYPE_LABELS[type]}
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
                                  }}
                                  className={`flex-1 ${errorClass} ${
                                    attr.value && attr.value.length > 0 && attr.value[0] === ""
                                      ? "border-red-500 focus:border-red-500"
                                      : ""
                                  }`}
                                  required
                                />
                              </div>
                            </Tooltip>
                          ) : (
                            <>
                              <Select
                                value={attr.type}
                                onValueChange={(value) => {
                                  const newAttributes = [...watchedAttributes];
                                  newAttributes[index] = { ...attr, type: value as any };
                                  setValue("attributes", newAttributes);
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
                                  newAttributes[index] = { ...attr, include: value as any };
                                  setValue("attributes", newAttributes);
                                }}
                                className="w-32"
                              >
                                {INCLUDE_TYPE_OPTIONS.map((type) => (
                                  <SelectItem key={type} value={type}>
                                    {INCLUDE_TYPE_LABELS[type]}
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
                                }}
                                className={`flex-1 ${
                                  attr.value && attr.value.length > 0 && attr.value[0] === ""
                                    ? "border-red-500 focus:border-red-500"
                                    : ""
                                }`}
                                required
                              />
                            </>
                          )}

                          {watchedAttributes.length > 1 && (
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
                      <div className="text-bunker-300 py-8 text-center">
                        No subject alternative names configured yet. Click &quot;Add SAN&quot; to
                        get started.
                      </div>
                    ) : (
                      watchedSans.map((san, index) => (
                        <div key={`san-${san.type}-${san.include}-${index}`} className="flex items-start gap-2">
                          <Select
                            value={san.type}
                            onValueChange={(value) => {
                              const newSans = [...watchedSans];
                              newSans[index] = { ...san, type: value as any };
                              setValue("subjectAlternativeNames", newSans);
                            }}
                            className="w-24"
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
                              newSans[index] = { ...san, include: value as any };
                              setValue("subjectAlternativeNames", newSans);
                            }}
                            className="w-32"
                          >
                            {INCLUDE_TYPE_OPTIONS.map((type) => (
                              <SelectItem key={type} value={type}>
                                {INCLUDE_TYPE_LABELS[type]}
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
                            }}
                            className={`flex-1 ${
                              san.value && san.value.length > 0 && san.value[0] === ""
                                ? "border-red-500 focus:border-red-500"
                                : ""
                            }`}
                            required
                          />

                          <IconButton
                            ariaLabel="Remove SAN"
                            variant="plain"
                            size="sm"
                            onClick={() => removeSan(index)}
                          >
                            <FontAwesomeIcon icon={faTrash} />
                          </IconButton>
                        </div>
                      ))
                    )}
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

            <AccordionItem value="constraints" className="mt-4">
              <AccordionTrigger>Constraints</AccordionTrigger>
              <AccordionContent>
                <div className="space-y-4">
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

                  <div className="space-y-3">
                    <div className="space-y-4">
                      <Controller
                        control={control}
                        name="signatureAlgorithm.allowedAlgorithms"
                        render={({ field, fieldState: { error } }) => (
                          <FormControl
                            label="Allowed Signature Algorithms"
                            isError={Boolean(error)}
                            errorText={error?.message}
                          >
                            <div className="grid grid-cols-2 gap-2 pl-2">
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
                                          if (current.length > 1) {
                                            newValue = current.filter((a) => a !== alg);
                                          } else {
                                            return;
                                          }
                                        } else {
                                          return;
                                        }
                                        field.onChange(newValue);

                                        const currentDefault = watch(
                                          "signatureAlgorithm.defaultAlgorithm"
                                        );
                                        if (currentDefault && !newValue.includes(currentDefault)) {
                                          setValue(
                                            "signatureAlgorithm.defaultAlgorithm",
                                            newValue[0]
                                          );
                                        }
                                      }}
                                    />
                                    <label
                                      htmlFor={`sig-alg-${alg}`}
                                      className="text-mineshaft-200 cursor-pointer text-sm font-medium"
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

                      <Controller
                        control={control}
                        name="signatureAlgorithm.defaultAlgorithm"
                        render={({ field, fieldState: { error } }) => (
                          <FormControl
                            label="Default Signature Algorithm"
                            isError={Boolean(error)}
                            errorText={error?.message}
                          >
                            <Select
                              value={field.value || ""}
                              onValueChange={field.onChange}
                              className="w-full"
                              position="popper"
                            >
                              {(watch("signatureAlgorithm.allowedAlgorithms") || []).map(
                                (alg: string) => (
                                  <SelectItem key={alg} value={alg}>
                                    {alg}
                                  </SelectItem>
                                )
                              )}
                            </Select>
                          </FormControl>
                        )}
                      />

                      <Controller
                        control={control}
                        name="keyAlgorithm.allowedKeyTypes"
                        render={({ field, fieldState: { error } }) => (
                          <FormControl
                            label="Allowed Key Algorithms"
                            isError={Boolean(error)}
                            errorText={error?.message}
                          >
                            <div className="grid grid-cols-2 gap-2 pl-2">
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
                                          if (current.length > 1) {
                                            newValue = current.filter((a) => a !== alg);
                                          } else {
                                            return;
                                          }
                                        } else {
                                          return;
                                        }
                                        field.onChange(newValue);

                                        const currentDefault = watch("keyAlgorithm.defaultKeyType");
                                        if (currentDefault && !newValue.includes(currentDefault)) {
                                          setValue("keyAlgorithm.defaultKeyType", newValue[0]);
                                        }
                                      }}
                                    />
                                    <label
                                      htmlFor={`key-alg-${alg}`}
                                      className="text-mineshaft-200 cursor-pointer text-sm font-medium"
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

                      <Controller
                        control={control}
                        name="keyAlgorithm.defaultKeyType"
                        render={({ field, fieldState: { error } }) => (
                          <FormControl
                            label="Default Key Algorithm"
                            isError={Boolean(error)}
                            errorText={error?.message}
                          >
                            <Select
                              value={field.value || ""}
                              onValueChange={field.onChange}
                              className="w-full"
                              position="popper"
                            >
                              {(watch("keyAlgorithm.allowedKeyTypes") || []).map((alg: string) => (
                                <SelectItem key={alg} value={alg}>
                                  {alg}
                                </SelectItem>
                              ))}
                            </Select>
                          </FormControl>
                        )}
                      />
                    </div>
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
                !formState.isValid ||
                !attributeValidation.isValid ||
                (isEdit ? updateTemplate.isPending : createTemplate.isPending)
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
