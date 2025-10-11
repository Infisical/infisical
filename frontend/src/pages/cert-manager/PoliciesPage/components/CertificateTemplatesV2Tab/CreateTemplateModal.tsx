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
  useCreateCertificateTemplateV2New,
  useUpdateCertificateTemplateV2New
} from "@app/hooks/api/certificateTemplates/mutations";
import { TCertificateTemplateV2New } from "@app/hooks/api/certificateTemplates/types";

import { INCLUDE_OPTIONS, SAN_TYPES, SUBJECT_ATTRIBUTE_TYPES } from "./shared/utils";
import { KeyUsagesSection, TemplateFormData, templateSchema } from "./shared";

export type FormData = TemplateFormData;

interface Props {
  isOpen: boolean;
  onClose: () => void;
  template?: TCertificateTemplateV2New;
  mode?: "create" | "edit";
}

const ATTRIBUTE_TYPE_LABELS: Record<(typeof SUBJECT_ATTRIBUTE_TYPES)[number], string> = {
  common_name: "Common Name (CN)",
  organization_name: "Organization (O)",
  organization_unit: "Organizational Unit (OU)",
  locality: "Locality (L)",
  state: "State/Province (ST)",
  country: "Country (C)",
  email: "Email Address",
  street_address: "Street Address",
  postal_code: "Postal Code"
};

const SAN_TYPE_LABELS: Record<(typeof SAN_TYPES)[number], string> = {
  dns_name: "DNS Name",
  ip_address: "IP Address",
  email: "Email",
  uri: "URI"
};

const INCLUDE_TYPE_LABELS: Record<(typeof INCLUDE_OPTIONS)[number], string> = {
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

  const { control, handleSubmit, reset, watch, setValue } = useForm<FormData>({
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
  const watchedKeyUsages = watch("keyUsages");
  const watchedExtendedKeyUsages = watch("extendedKeyUsages");

  const onFormSubmit = async (data: FormData) => {
    try {
      if (!currentProject?.id && !isEdit) return;

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
      type: SUBJECT_ATTRIBUTE_TYPES[0],
      include: INCLUDE_OPTIONS[1],
      value: []
    };
    setValue("attributes", [...watchedAttributes, newAttribute]);
  };

  const removeAttribute = (index: number) => {
    const newAttributes = watchedAttributes.filter((_, i) => i !== index);
    setValue("attributes", newAttributes);
  };

  const addSan = () => {
    const newSan = {
      type: SAN_TYPES[0],
      include: INCLUDE_OPTIONS[1],
      value: []
    };
    setValue("subjectAlternativeNames", [...watchedSans, newSan]);
  };

  const removeSan = (index: number) => {
    const newSans = watchedSans.filter((_, i) => i !== index);
    setValue("subjectAlternativeNames", newSans);
  };

  const toggleKeyUsage = (usage: string, type: "required" | "optional") => {
    const current = watchedKeyUsages || { requiredUsages: [], optionalUsages: [] };
    const otherType = type === "required" ? "optional" : "required";
    const currentList = Array.isArray(current[`${type}Usages`]) ? current[`${type}Usages`] : [];
    const otherList = Array.isArray(current[`${otherType}Usages`])
      ? current[`${otherType}Usages`]
      : [];

    const newOtherList = (otherList || []).filter((u) => u !== usage);
    const newCurrentList = currentList?.includes(usage)
      ? currentList.filter((u) => u !== usage)
      : [...(currentList || []), usage];

    setValue("keyUsages", {
      [`${type}Usages`]: newCurrentList,
      [`${otherType}Usages`]: newOtherList
    } as any);
  };

  const toggleExtendedKeyUsage = (usage: string, type: "required" | "optional") => {
    const current = watchedExtendedKeyUsages || { requiredUsages: [], optionalUsages: [] };
    const otherType = type === "required" ? "optional" : "required";
    const currentList = Array.isArray(current[`${type}Usages`]) ? current[`${type}Usages`] : [];
    const otherList = Array.isArray(current[`${otherType}Usages`])
      ? current[`${otherType}Usages`]
      : [];

    const newOtherList = (otherList || []).filter((u) => u !== usage);
    const newCurrentList = currentList?.includes(usage)
      ? currentList.filter((u) => u !== usage)
      : [...(currentList || []), usage];

    setValue("extendedKeyUsages", {
      [`${type}Usages`]: newCurrentList,
      [`${otherType}Usages`]: newOtherList
    } as any);
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
        title={isEdit ? "Edit Certificate Template V2" : "Create Certificate Template V2"}
        subTitle={
          isEdit
            ? `Update configuration for ${template?.slug}`
            : "Define comprehensive certificate policies, validation rules, and constraints"
        }
      >
        <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-6">
          <Accordion type="multiple" defaultValue={["basic"]} className="w-full">
            <AccordionItem value="basic">
              <AccordionTrigger>Basic Information</AccordionTrigger>
              <AccordionContent>
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
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="attributes">
              <AccordionTrigger>Subject Attributes</AccordionTrigger>
              <AccordionContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Button
                      type="button"
                      onClick={addAttribute}
                      size="sm"
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
                      watchedAttributes.map((attr, index) => (
                        <div
                          key={`attr-${attr.type}`}
                          className="flex flex-col space-y-2 rounded-md border border-mineshaft-600 p-4"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-mineshaft-200">
                              {ATTRIBUTE_TYPE_LABELS[attr.type] || attr.type}
                            </span>
                          </div>

                          <div className="flex gap-3">
                            <Select
                              value={attr.type}
                              onValueChange={(value) => {
                                const newAttributes = [...watchedAttributes];
                                newAttributes[index] = { ...attr, type: value as any };
                                setValue("attributes", newAttributes);
                              }}
                              position="popper"
                            >
                              {SUBJECT_ATTRIBUTE_TYPES.map((type) => (
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
                              position="popper"
                            >
                              {INCLUDE_OPTIONS.map((type) => (
                                <SelectItem key={type} value={type}>
                                  {INCLUDE_TYPE_LABELS[type]}
                                </SelectItem>
                              ))}
                            </Select>

                            <Input
                              placeholder="Pattern/Value (optional)"
                              value={attr.value?.[0] || ""}
                              onChange={(e) => {
                                const newAttributes = [...watchedAttributes];
                                newAttributes[index] = {
                                  ...attr,
                                  value: e.target.value ? [e.target.value] : []
                                };
                                setValue("attributes", newAttributes);
                              }}
                            />
                            <IconButton
                              ariaLabel="delete attribute"
                              variant="plain"
                              onClick={() => removeAttribute(index)}
                            >
                              <FontAwesomeIcon icon={faTrash} className="text-red-500" />
                            </IconButton>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="san">
              <AccordionTrigger>Subject Alternative Names</AccordionTrigger>
              <AccordionContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Button
                      type="button"
                      onClick={addSan}
                      size="sm"
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
                          key={`san-${san.type}`}
                          className="flex flex-col space-y-4 rounded-md border border-mineshaft-600 p-4"
                        >
                          <div className="flex gap-3">
                            <Select
                              value={san.type}
                              onValueChange={(value) => {
                                const newSans = [...watchedSans];
                                newSans[index] = { ...san, type: value as any };
                                setValue("subjectAlternativeNames", newSans);
                              }}
                              position="popper"
                            >
                              {SAN_TYPES.map((type) => (
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
                              position="popper"
                            >
                              {INCLUDE_OPTIONS.map((type) => (
                                <SelectItem key={type} value={type}>
                                  {INCLUDE_TYPE_LABELS[type]}
                                </SelectItem>
                              ))}
                            </Select>

                            <Input
                              placeholder="Pattern/Value (optional)"
                              value={san.value?.[0] || ""}
                              onChange={(e) => {
                                const newSans = [...watchedSans];
                                newSans[index] = {
                                  ...san,
                                  value: e.target.value ? [e.target.value] : []
                                };
                                setValue("subjectAlternativeNames", newSans);
                              }}
                            />
                            <div className="flex items-center justify-between">
                              <IconButton
                                onClick={() => removeSan(index)}
                                size="sm"
                                variant="plain"
                                ariaLabel="Remove SAN"
                              >
                                <FontAwesomeIcon icon={faTrash} className="text-red-500" />
                              </IconButton>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="usages">
              <AccordionTrigger>Key Usages</AccordionTrigger>
              <AccordionContent>
                <KeyUsagesSection
                  watchedKeyUsages={watchedKeyUsages}
                  watchedExtendedKeyUsages={watchedExtendedKeyUsages}
                  toggleKeyUsage={toggleKeyUsage}
                  toggleExtendedKeyUsage={toggleExtendedKeyUsage}
                />
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="constraints">
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
