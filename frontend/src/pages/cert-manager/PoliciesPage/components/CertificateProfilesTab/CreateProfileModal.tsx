import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { faQuestionCircle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Checkbox,
  FilterableSelect,
  FormControl,
  Input,
  Modal,
  ModalContent,
  Select,
  SelectItem,
  TextArea,
  Tooltip
} from "@app/components/v2";
import { useProject } from "@app/context";
import { CaType } from "@app/hooks/api/ca/enums";
import { useGetAzureAdcsTemplates, useListCasByProjectId } from "@app/hooks/api/ca/queries";
import { useListCertificatePolicies } from "@app/hooks/api/certificatePolicies";
import {
  EnrollmentType,
  IssuerType,
  TCertificateProfileWithDetails,
  TCreateCertificateProfileDTO,
  TUpdateCertificateProfileDTO,
  useCreateCertificateProfile,
  useUpdateCertificateProfile
} from "@app/hooks/api/certificateProfiles";

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
        skipDnsOwnershipVerification: z.boolean().optional()
      })
      .optional(),
    externalConfigs: z
      .object({
        template: z.string().min(1, "Azure ADCS template is required")
      })
      .optional(),
    defaultTtl: z
      .object({
        value: z.number().min(1, "Duration must be at least 1").nullable().optional(),
        unit: z.enum(["days", "months", "years"]).optional()
      })
      .optional()
      .refine(
        (data) => {
          // If value is provided, unit must also be provided
          if (data?.value != null && !data?.unit) return false;
          // If unit is provided (checkbox checked), value must also be provided
          if (data?.unit && data?.value == null) return false;
          return true;
        },
        { message: "Please enter a valid TTL duration" }
      )
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
        skipDnsOwnershipVerification: z.boolean().optional()
      })
      .optional(),
    externalConfigs: z
      .object({
        template: z.string().optional()
      })
      .optional(),
    defaultTtl: z
      .object({
        value: z.number().min(1, "Duration must be at least 1").nullable().optional(),
        unit: z.enum(["days", "months", "years"]).optional()
      })
      .nullable()
      .optional()
      .refine(
        (data) => {
          // If value is provided, unit must also be provided
          if (data?.value != null && !data?.unit) return false;
          // If unit is provided (checkbox checked), value must also be provided
          if (data?.unit && data?.value == null) return false;
          return true;
        },
        { message: "Please enter a valid TTL duration" }
      )
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

// Convert stored days (number) to form object for display
const parseDaysToTtl = (
  days: number | null | undefined
): { value: number; unit: "days" } | undefined => {
  if (!days) return undefined;
  return { value: days, unit: "days" };
};

// Convert form object to days (number) for storage
const convertTtlToDays = (
  ttl: { value?: number | null; unit?: "days" | "months" | "years" } | null | undefined
): number | undefined => {
  if (!ttl?.value || !ttl?.unit) return undefined;
  switch (ttl.unit) {
    case "days":
      return ttl.value;
    case "months":
      return ttl.value * 30;
    case "years":
      return ttl.value * 365;
    default:
      return undefined;
  }
};

// Convert days to ms for comparison with policy
const daysToMs = (days: number | undefined): number | null => {
  if (!days) return null;
  return days * 24 * 60 * 60 * 1000;
};

// Parse policy max validity string (like "365d") to ms
const parsePolicyValidityToMs = (validity: string | undefined | null): number | null => {
  if (!validity) return null;
  const match = validity.match(/^(\d+)([dmy])$/);
  if (!match) return null;
  const value = parseInt(match[1], 10);
  const msPerDay = 24 * 60 * 60 * 1000;
  switch (match[2]) {
    case "d":
      return value * msPerDay;
    case "m":
      return value * 30 * msPerDay;
    case "y":
      return value * 365 * msPerDay;
    default:
      return null;
  }
};

interface Props {
  isOpen: boolean;
  onClose: () => void;
  profile?: TCertificateProfileWithDetails;
  mode?: "create" | "edit";
}

export const CreateProfileModal = ({ isOpen, onClose, profile, mode = "create" }: Props) => {
  const { currentProject } = useProject();

  const { data: allCaData } = useListCasByProjectId(currentProject?.id || "");
  const { data: policyData } = useListCertificatePolicies({
    projectId: currentProject?.id || "",
    limit: 100,
    offset: 0
  });

  const createProfile = useCreateCertificateProfile();
  const updateProfile = useUpdateCertificateProfile();

  const isEdit = mode === "edit" && profile;

  const certificateAuthorities = (allCaData || []).map((ca) => ({
    ...ca,
    groupType: ca.type === "internal" ? "internal" : "external"
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

  const { control, handleSubmit, reset, watch, setValue, setError, formState } = useForm<FormData>({
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
                    profile.acmeConfig?.skipDnsOwnershipVerification || false
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
          defaultTtl: parseDaysToTtl(profile.defaultTtlDays)
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
            skipDnsOwnershipVerification: false
          },
          externalConfigs: undefined,
          defaultTtl: {
            value: 365,
            unit: "days"
          }
        }
  });

  const watchedEnrollmentType = watch("enrollmentType");
  const watchedIssuerType = watch("issuerType");
  const watchedCertificateAuthorityId = watch("certificateAuthorityId");
  const watchedDisableBootstrapValidation = watch("estConfig.disableBootstrapCaValidation");
  const watchedAutoRenew = watch("apiConfig.autoRenew");

  // Get the selected CA to check if it's Azure ADCS
  const selectedCa = certificateAuthorities.find((ca) => ca.id === watchedCertificateAuthorityId);
  const isAzureAdcsCa = selectedCa?.type === CaType.AZURE_AD_CS;

  // Fetch Azure ADCS templates if needed
  const { data: azureAdcsTemplatesData } = useGetAzureAdcsTemplates({
    caId: watchedCertificateAuthorityId || "",
    projectId: currentProject?.id || "",
    isAzureAdcsCa
  });

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
                  profile.acmeConfig?.skipDnsOwnershipVerification || false
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
        defaultTtl: parseDaysToTtl(profile.defaultTtlDays)
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
      // Re-set the external configs to ensure the template value is properly set
      // after the Azure ADCS templates have been loaded
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

    // Validate defaultTtl against policy's max validity
    if (data.defaultTtl?.value && data.defaultTtl?.unit) {
      const selectedPolicy = certificatePolicies.find((p) => p.id === data.certificatePolicyId);
      if (selectedPolicy?.validity?.max) {
        const defaultTtlDays = convertTtlToDays(data.defaultTtl);
        const defaultTtlMs = daysToMs(defaultTtlDays);
        const maxValidityMs = parsePolicyValidityToMs(selectedPolicy.validity.max);

        if (defaultTtlMs && maxValidityMs && defaultTtlMs > maxValidityMs) {
          setError("defaultTtl.value", {
            type: "manual",
            message: "Exceeds the selected policy's maximum validity"
          });
          return;
        }
      }
    }

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

      // Add external configs if present
      if (data.externalConfigs) {
        updateData.externalConfigs = data.externalConfigs;
      }

      // Add defaultTtlDays if present (or null to clear it)
      if (data.defaultTtl !== undefined) {
        updateData.defaultTtlDays = convertTtlToDays(data.defaultTtl) || null;
      }

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

      // Add external configs if present
      if (data.externalConfigs) {
        createData.externalConfigs = data.externalConfigs;
      }

      // Add defaultTtlDays if present
      const ttlDays = convertTtlToDays(data.defaultTtl);
      if (ttlDays) {
        createData.defaultTtlDays = ttlDays;
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
        title={isEdit ? "Edit Certificate Profile" : "Create Certificate Profile"}
        subTitle={
          isEdit
            ? `Update configuration for ${profile?.slug}`
            : "Configure a new certificate profile for unified certificate issuance"
        }
      >
        <form onSubmit={handleSubmit(onFormSubmit)}>
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
              <FormControl label="Description" isError={Boolean(error)} errorText={error?.message}>
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
                        skipDnsOwnershipVerification: false
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
                      azureAdcsTemplatesData?.templates.find((template) => template.id === value) ||
                      null
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
            render={({ field: { onChange, ...field }, fieldState: { error } }) => (
              <FormControl
                label="Certificate Policy"
                isRequired
                isError={Boolean(error)}
                errorText={error?.message}
              >
                <Select
                  {...field}
                  onValueChange={(value) => {
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
                        skipDnsOwnershipVerification: false
                      });
                    }
                    onChange(value);
                  }}
                  placeholder="Select a certificate policy"
                  className="w-full"
                  position="popper"
                  isDisabled={Boolean(isEdit)}
                >
                  {certificatePolicies.map((policy) => (
                    <SelectItem key={policy.id} value={policy.id}>
                      {policy.name}
                    </SelectItem>
                  ))}
                </Select>
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
                        skipDnsOwnershipVerification: false
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

          <div className="mb-4 space-y-4">
            <div className="flex items-center gap-2">
              <Checkbox
                id="enableDefaultTtl"
                isChecked={watch("defaultTtl")?.unit !== undefined}
                onCheckedChange={(checked) => {
                  if (checked) {
                    setValue("defaultTtl.value", 365);
                    setValue("defaultTtl.unit", "days");
                  } else {
                    setValue("defaultTtl", null, { shouldValidate: true });
                  }
                }}
              >
                Set default certificate TTL
              </Checkbox>
              <Tooltip content="Fallback validity period used when not explicitly specified in certificate request">
                <FontAwesomeIcon
                  icon={faQuestionCircle}
                  className="cursor-help text-mineshaft-400 hover:text-mineshaft-300"
                  size="sm"
                />
              </Tooltip>
            </div>

            {watch("defaultTtl")?.unit !== undefined && (
              <div className="ml-3 border-l-2 border-mineshaft-500 pl-4">
                <div className="grid grid-cols-2 gap-4">
                  <Controller
                    control={control}
                    name="defaultTtl.value"
                    render={({ field, fieldState: { error } }) => (
                      <FormControl
                        label="Duration"
                        isError={Boolean(error)}
                        errorText={error?.message}
                      >
                        <Input
                          {...field}
                          type="number"
                          placeholder="365"
                          value={field.value == null ? "" : field.value}
                          onChange={(e) => {
                            const val = e.target.value;
                            field.onChange(val === "" ? null : Number(val));
                          }}
                        />
                      </FormControl>
                    )}
                  />
                  <Controller
                    control={control}
                    name="defaultTtl.unit"
                    render={({ field, fieldState: { error } }) => (
                      <FormControl label="Unit" isError={Boolean(error)} errorText={error?.message}>
                        <Select
                          {...field}
                          value={field.value ?? "days"}
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
            )}
          </div>

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
                name="acmeConfig.skipDnsOwnershipVerification"
                render={({ field: { value, onChange }, fieldState: { error } }) => (
                  <FormControl isError={Boolean(error)} errorText={error?.message}>
                    <div className="flex items-center gap-3 rounded-md border border-mineshaft-600 bg-mineshaft-900 p-4">
                      <Checkbox
                        id="skipDnsOwnershipVerification"
                        isChecked={value || false}
                        onCheckedChange={onChange}
                      />
                      <div className="space-y-1">
                        <span className="text-sm font-medium text-mineshaft-100">
                          Skip DNS Ownership Validation
                        </span>
                        <p className="text-xs text-bunker-300">
                          Skip DNS ownership verification during ACME certificate issuance.
                        </p>
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

          <div className="flex gap-3">
            <Button
              type="submit"
              colorSchema="primary"
              isLoading={isEdit ? updateProfile.isPending : createProfile.isPending}
              isDisabled={
                !formState.isValid || (isEdit ? updateProfile.isPending : createProfile.isPending)
              }
            >
              {isEdit ? "Save Changes" : "Create"}
            </Button>
            <Button
              variant="outline_bg"
              onClick={() => {
                reset();
                onClose();
              }}
              disabled={isEdit ? updateProfile.isPending : createProfile.isPending}
            >
              Cancel
            </Button>
          </div>
        </form>
      </ModalContent>
    </Modal>
  );
};
