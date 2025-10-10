import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { faPlus, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  FormControl,
  Input,
  Modal,
  ModalContent,
  Select,
  SelectItem,
  TextArea
} from "@app/components/v2";
import { useProject } from "@app/context";
import { useCreateCertificateTemplateV2New } from "@app/hooks/api/certificateTemplates/mutations";

import { KeyUsagesSection, TemplateFormData, templateSchema } from "./shared";

export type FormData = TemplateFormData;

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const ATTRIBUTE_TYPES = [{ value: "common_name", label: "Common Name (CN)" }];

const SAN_TYPES = [
  { value: "dns_name", label: "DNS Name" },
  { value: "ip_address", label: "IP Address" },
  { value: "email", label: "Email" },
  { value: "uri", label: "URI" }
];

const INCLUDE_TYPES = [
  { value: "mandatory", label: "Mandatory", color: "red" },
  { value: "optional", label: "Optional", color: "blue" },
  { value: "prohibit", label: "Prohibited", color: "gray" }
];

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

export const CreateTemplateModal = ({ isOpen, onClose }: Props) => {
  const { currentProject } = useProject();
  const createTemplate = useCreateCertificateTemplateV2New();
  const [activeTab, setActiveTab] = useState<string>("basic");

  const { control, handleSubmit, reset, watch, setValue } = useForm<FormData>({
    resolver: zodResolver(templateSchema),
    defaultValues: {
      name: "",
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
      if (!currentProject?.id) return;

      const templateData = {
        projectId: currentProject.id,
        name: data.name,
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

      await createTemplate.mutateAsync(templateData);

      createNotification({
        text: "Certificate template created successfully",
        type: "success"
      });

      reset();
      onClose();
    } catch (error) {
      console.error("Error creating template:", error);
      createNotification({
        text: "Failed to create certificate template",
        type: "error"
      });
    }
  };

  const addAttribute = () => {
    const newAttribute = {
      type: "common_name" as const,
      include: "optional" as const,
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
      type: "dns_name" as const,
      include: "optional" as const,
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

  const tabs = [
    { id: "basic", label: "Basic Info" },
    { id: "attributes", label: "Subject Attributes" },
    { id: "san", label: "Subject Alternative Names" },
    { id: "usages", label: "Key Usages" },
    { id: "constraints", label: "Constraints" }
  ];

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
        title="Create Certificate Template V2"
        subTitle="Define comprehensive certificate policies, validation rules, and constraints"
      >
        <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-6">
          {/* Tab Navigation */}
          <div className="flex border-b border-mineshaft-600">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? "border-primary-500 text-primary-400"
                    : "border-transparent text-bunker-300 hover:text-mineshaft-200"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="max-h-80 overflow-y-auto">
            {activeTab === "basic" && (
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
              </div>
            )}

            {activeTab === "attributes" && (
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

                <div className="space-y-3">
                  {watchedAttributes.length === 0 ? (
                    <div className="py-8 text-center text-bunker-300">
                      No subject attributes configured yet. Click &quot;Add Attribute&quot; to get
                      started.
                    </div>
                  ) : (
                    watchedAttributes.map((attr, index) => (
                      <div
                        key={`attr-${attr.type}`}
                        className="flex items-center gap-3 rounded border border-mineshaft-600 p-3"
                      >
                        <Select
                          value={attr.type}
                          onValueChange={(value) => {
                            const newAttributes = [...watchedAttributes];
                            newAttributes[index] = { ...attr, type: value as any };
                            setValue("attributes", newAttributes);
                          }}
                          className="w-56"
                          position="popper"
                        >
                          {ATTRIBUTE_TYPES.map((type) => (
                            <SelectItem key={type.value} value={type.value}>
                              {type.label}
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
                          className="w-36"
                          position="popper"
                        >
                          {INCLUDE_TYPES.map((type) => (
                            <SelectItem key={type.value} value={type.value}>
                              {type.label}
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
                          className="flex-1"
                        />

                        <Button
                          type="button"
                          onClick={() => removeAttribute(index)}
                          variant="outline"
                          size="sm"
                          colorSchema="danger"
                        >
                          <FontAwesomeIcon icon={faTrash} />
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {activeTab === "san" && (
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

                <div className="space-y-3">
                  {watchedSans.length === 0 ? (
                    <div className="py-8 text-center text-bunker-300">
                      No subject alternative names configured yet. Click &quot;Add SAN&quot; to get
                      started.
                    </div>
                  ) : (
                    watchedSans.map((san, index) => (
                      <div
                        key={`san-${san.type}`}
                        className="flex items-center gap-3 rounded border border-mineshaft-600 p-3"
                      >
                        <Select
                          value={san.type}
                          onValueChange={(value) => {
                            const newSans = [...watchedSans];
                            newSans[index] = { ...san, type: value as any };
                            setValue("subjectAlternativeNames", newSans);
                          }}
                          className="w-36"
                          position="popper"
                        >
                          {SAN_TYPES.map((type) => (
                            <SelectItem key={type.value} value={type.value}>
                              {type.label}
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
                          className="w-36"
                          position="popper"
                        >
                          {INCLUDE_TYPES.map((type) => (
                            <SelectItem key={type.value} value={type.value}>
                              {type.label}
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
                          className="flex-1"
                        />

                        <Button
                          type="button"
                          onClick={() => removeSan(index)}
                          variant="outline"
                          size="sm"
                          colorSchema="danger"
                        >
                          <FontAwesomeIcon icon={faTrash} />
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {activeTab === "usages" && (
              <KeyUsagesSection
                watchedKeyUsages={watchedKeyUsages}
                watchedExtendedKeyUsages={watchedExtendedKeyUsages}
                toggleKeyUsage={toggleKeyUsage}
                toggleExtendedKeyUsage={toggleExtendedKeyUsage}
              />
            )}

            {activeTab === "constraints" && (
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
                          <div className="space-y-2">
                            <div className="flex flex-wrap gap-2">
                              {SIGNATURE_ALGORITHMS.map((alg) => {
                                const isSelected = field.value?.includes(alg);
                                return (
                                  <Button
                                    key={alg}
                                    type="button"
                                    size="xs"
                                    variant={isSelected ? "solid" : "outline"}
                                    colorSchema={isSelected ? "primary" : "gray"}
                                    onClick={() => {
                                      const current = field.value || [];
                                      let newValue;
                                      if (isSelected) {
                                        if (current.length > 1) {
                                          newValue = current.filter((a) => a !== alg);
                                        } else {
                                          return;
                                        }
                                      } else {
                                        newValue = [...current, alg];
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
                                  >
                                    {alg}
                                  </Button>
                                );
                              })}
                            </div>
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
                          <div className="space-y-2">
                            <div className="flex flex-wrap gap-2">
                              {KEY_ALGORITHMS.map((alg) => {
                                const isSelected = field.value?.includes(alg);
                                return (
                                  <Button
                                    key={alg}
                                    type="button"
                                    size="xs"
                                    variant={isSelected ? "solid" : "outline"}
                                    colorSchema={isSelected ? "primary" : "gray"}
                                    onClick={() => {
                                      const current = field.value || [];
                                      let newValue;
                                      if (isSelected) {
                                        if (current.length > 1) {
                                          newValue = current.filter((a) => a !== alg);
                                        } else {
                                          return;
                                        }
                                      } else {
                                        newValue = [...current, alg];
                                      }
                                      field.onChange(newValue);

                                      const currentDefault = watch("keyAlgorithm.defaultKeyType");
                                      if (currentDefault && !newValue.includes(currentDefault)) {
                                        setValue("keyAlgorithm.defaultKeyType", newValue[0]);
                                      }
                                    }}
                                  >
                                    {alg}
                                  </Button>
                                );
                              })}
                            </div>
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
            )}
          </div>

          <div className="flex gap-3">
            <Button type="submit" colorSchema="primary" isLoading={createTemplate.isPending}>
              Create
            </Button>
            <Button variant="outline_bg" onClick={onClose} disabled={createTemplate.isPending}>
              Cancel
            </Button>
          </div>
        </form>
      </ModalContent>
    </Modal>
  );
};
