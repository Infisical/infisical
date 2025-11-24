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
  FormControl,
  Input,
  Modal,
  ModalContent,
  Select,
  SelectItem,
  TextArea,
  Tooltip
} from "@app/components/v2";
import { useProject, useSubscription } from "@app/context";
import { useListCasByProjectId } from "@app/hooks/api/ca/queries";
import {
  EnrollmentType,
  IssuerType,
  TCertificateProfileWithDetails,
  TCreateCertificateProfileDTO,
  TUpdateCertificateProfileDTO,
  useCreateCertificateProfile,
  useUpdateCertificateProfile
} from "@app/hooks/api/certificateProfiles";
import { useListCertificateTemplatesV2 } from "@app/hooks/api/certificateTemplates/queries";
import { UsePopUpState } from "@app/hooks/usePopUp";

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
    certificateTemplateId: z.string().min(1, "Certificate Template is required"),
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
    acmeConfig: z.object({}).optional()
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
    certificateTemplateId: z.string().optional(),
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
    acmeConfig: z.object({}).optional()
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

interface Props {
  isOpen: boolean;
  onClose: () => void;
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<["upgradePlan"]>,
    data?: {
      isEnterpriseFeature?: boolean;
    }
  ) => void;
  profile?: TCertificateProfileWithDetails;
  mode?: "create" | "edit";
}

export const CreateProfileModal = ({
  isOpen,
  onClose,
  handlePopUpOpen,
  profile,
  mode = "create"
}: Props) => {
  const { currentProject } = useProject();
  const { subscription } = useSubscription();

  const { data: caData } = useListCasByProjectId(currentProject?.id || "");
  const { data: templateData } = useListCertificateTemplatesV2({
    projectId: currentProject?.id || "",
    limit: 100,
    offset: 0
  });

  const createProfile = useCreateCertificateProfile();
  const updateProfile = useUpdateCertificateProfile();

  const isEdit = mode === "edit" && profile;

  const certificateAuthorities = caData || [];
  const certificateTemplates = templateData?.certificateTemplates || [];

  const { control, handleSubmit, reset, watch, setValue, formState } = useForm<FormData>({
    resolver: zodResolver(isEdit ? editSchema : createSchema),
    defaultValues: isEdit
      ? {
          slug: profile.slug,
          description: profile.description || "",
          enrollmentType: profile.enrollmentType,
          issuerType: profile.issuerType,
          certificateAuthorityId: profile.caId || undefined,
          certificateTemplateId: profile.certificateTemplateId,
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
          acmeConfig: profile.enrollmentType === EnrollmentType.ACME ? {} : undefined
        }
      : {
          slug: "",
          description: "",
          enrollmentType: EnrollmentType.API,
          issuerType: IssuerType.CA,
          certificateAuthorityId: "",
          certificateTemplateId: "",
          apiConfig: {
            autoRenew: false,
            renewBeforeDays: 30
          },
          acmeConfig: {}
        }
  });

  const watchedEnrollmentType = watch("enrollmentType");
  const watchedIssuerType = watch("issuerType");
  const watchedDisableBootstrapValidation = watch("estConfig.disableBootstrapCaValidation");
  const watchedAutoRenew = watch("apiConfig.autoRenew");

  useEffect(() => {
    if (isEdit && profile) {
      reset({
        slug: profile.slug,
        description: profile.description || "",
        enrollmentType: profile.enrollmentType,
        issuerType: profile.issuerType,
        certificateAuthorityId: profile.caId || undefined,
        certificateTemplateId: profile.certificateTemplateId,
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
        acmeConfig: profile.enrollmentType === EnrollmentType.ACME ? {} : undefined
      });
    }
  }, [isEdit, profile, reset]);

  const onFormSubmit = async (data: FormData) => {
    if (!isEdit && !subscription?.pkiAcme && data.enrollmentType === EnrollmentType.ACME) {
      reset();
      onClose();
      handlePopUpOpen("upgradePlan", {
        isEnterpriseFeature: true
      });
      return;
    }

    if (!currentProject?.id && !isEdit) return;

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
        certificateTemplateId: data.certificateTemplateId
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
                      setValue("acmeConfig", undefined);
                    }
                    onChange(value);
                  }}
                  className="w-full"
                  position="popper"
                  isDisabled={Boolean(isEdit)}
                >
                  <SelectItem value="ca">Certificate Authority</SelectItem>
                  <SelectItem value="self-signed">Self-signed</SelectItem>
                </Select>
              </FormControl>
            )}
          />

          {watchedIssuerType === "ca" && (
            <Controller
              control={control}
              name="certificateAuthorityId"
              render={({ field: { onChange, value, ...field }, fieldState: { error } }) => (
                <FormControl
                  label="Issuing CA"
                  isRequired
                  isError={Boolean(error)}
                  errorText={error?.message}
                >
                  <Select
                    {...field}
                    value={value || undefined}
                    onValueChange={onChange}
                    placeholder="Select a certificate authority"
                    className="w-full"
                    position="popper"
                    isDisabled={Boolean(isEdit)}
                  >
                    {certificateAuthorities.map((ca) => (
                      <SelectItem key={ca.id} value={ca.id}>
                        {ca.type === "internal" && ca.configuration.friendlyName
                          ? ca.configuration.friendlyName
                          : ca.name}
                      </SelectItem>
                    ))}
                  </Select>
                </FormControl>
              )}
            />
          )}

          <Controller
            control={control}
            name="certificateTemplateId"
            render={({ field: { onChange, ...field }, fieldState: { error } }) => (
              <FormControl
                label="Certificate Template"
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
                      setValue("acmeConfig", {});
                    }
                    onChange(value);
                  }}
                  placeholder="Select a certificate template"
                  className="w-full"
                  position="popper"
                  isDisabled={Boolean(isEdit)}
                >
                  {certificateTemplates.map((template) => (
                    <SelectItem key={template.id} value={template.id}>
                      {template.name}
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
                      setValue("acmeConfig", {});
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
                name="acmeConfig"
                render={({ fieldState: { error } }) => (
                  <FormControl isError={Boolean(error)} errorText={error?.message}>
                    <div className="flex items-center gap-2">{/* FIXME: ACME configuration */}</div>
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
              onClick={onClose}
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
