import { Controller, useForm } from "react-hook-form";
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
  TextArea
} from "@app/components/v2";
import { useProject } from "@app/context";
import { useListCasByProjectId } from "@app/hooks/api/ca/queries";
import {
  TCertificateProfileWithDetails,
  useCreateCertificateProfile,
  useUpdateCertificateProfile
} from "@app/hooks/api/certificateProfiles";
import { useListCertificateTemplatesV2 } from "@app/hooks/api/certificateTemplates/queries";

const createSchema = z
  .object({
    slug: z.string().trim().min(1, "Profile slug is required"),
    description: z.string().optional(),
    enrollmentType: z.enum(["api", "est"]),
    certificateAuthorityId: z.string().min(1, "Certificate Authority is required"),
    certificateTemplateId: z.string().min(1, "Certificate Template is required"),
    estConfig: z
      .object({
        disableBootstrapCaValidation: z.boolean().optional(),
        passphrase: z.string().min(1, "EST passphrase is required"),
        caChain: z.string().min(1, "EST CA chain is required")
      })
      .optional(),
    apiConfig: z
      .object({
        autoRenew: z.boolean().optional(),
        autoRenewDays: z.number().min(1).max(365).optional()
      })
      .optional()
  })
  .refine(
    (data) => {
      if (data.enrollmentType === "est" && !data.estConfig) {
        return false;
      }
      if (data.enrollmentType === "api" && !data.apiConfig) {
        return false;
      }
      return true;
    },
    {
      message: "Configuration is required for selected enrollment type"
    }
  );

const editSchema = z
  .object({
    slug: z.string().trim().min(1, "Profile slug is required"),
    description: z.string().optional(),
    enrollmentType: z.enum(["api", "est"]),
    certificateAuthorityId: z.string().optional(),
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
        autoRenewDays: z.number().min(1).max(365).optional()
      })
      .optional()
  })
  .refine(
    (data) => {
      if (data.enrollmentType === "est" && !data.estConfig) {
        return false;
      }
      if (data.enrollmentType === "api" && !data.apiConfig) {
        return false;
      }
      return true;
    },
    {
      message: "Configuration is required for selected enrollment type"
    }
  );

export type FormData = z.infer<typeof createSchema>;

interface Props {
  isOpen: boolean;
  onClose: () => void;
  profile?: TCertificateProfileWithDetails;
  mode?: "create" | "edit";
}

export const CreateProfileModal = ({ isOpen, onClose, profile, mode = "create" }: Props) => {
  const { currentProject } = useProject();

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
          certificateAuthorityId: profile.caId,
          certificateTemplateId: profile.certificateTemplateId,
          estConfig: {
            disableBootstrapCaValidation: profile.estConfig?.disableBootstrapCaValidation || false,
            passphrase: "",
            caChain: ""
          },
          apiConfig: {
            autoRenew: profile.apiConfig?.autoRenew || false,
            autoRenewDays: profile.apiConfig?.autoRenewDays || 30
          }
        }
      : {
          slug: "",
          description: "",
          enrollmentType: "api",
          certificateAuthorityId: "",
          certificateTemplateId: "",
          apiConfig: {
            autoRenew: false,
            autoRenewDays: 30
          }
        }
  });

  const watchedEnrollmentType = watch("enrollmentType");
  const watchedDisableBootstrapValidation = watch("estConfig.disableBootstrapCaValidation");
  const watchedAutoRenew = watch("apiConfig.autoRenew");

  const onFormSubmit = async (data: FormData) => {
    try {
      if (!currentProject?.id && !isEdit) return;

      if (isEdit) {
        const updateData: any = {
          profileId: profile.id,
          name: data.slug,
          description: data.description
        };

        if (data.enrollmentType === "est" && data.estConfig) {
          updateData.estConfig = data.estConfig;
        } else if (data.enrollmentType === "api" && data.apiConfig) {
          updateData.apiConfig = data.apiConfig;
        }

        await updateProfile.mutateAsync(updateData);
      } else {
        const createData: any = {
          projectId: currentProject!.id,
          slug: data.slug,
          description: data.description,
          enrollmentType: data.enrollmentType,
          caId: data.certificateAuthorityId,
          certificateTemplateId: data.certificateTemplateId
        };

        if (data.enrollmentType === "est" && data.estConfig) {
          createData.estConfig = data.estConfig;
        } else if (data.enrollmentType === "api" && data.apiConfig) {
          createData.apiConfig = data.apiConfig;
        }

        await createProfile.mutateAsync(createData);
      }

      createNotification({
        text: `Certificate profile ${isEdit ? "updated" : "created"} successfully`,
        type: "success"
      });

      reset();
      onClose();
    } catch (error) {
      console.error(`Error ${isEdit ? "updating" : "creating"} profile:`, error);
      createNotification({
        text: `Failed to ${isEdit ? "update" : "create"} certificate profile`,
        type: "error"
      });
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
                label="Profile Slug"
                isRequired
                isError={Boolean(error)}
                errorText={error?.message}
              >
                <Input {...field} placeholder="your-profile-name" isDisabled={Boolean(isEdit)} />
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
            name="certificateAuthorityId"
            render={({ field: { onChange, ...field }, fieldState: { error } }) => (
              <FormControl
                label="Issuing CA"
                isRequired
                isError={Boolean(error)}
                errorText={error?.message}
              >
                <Select
                  {...field}
                  onValueChange={onChange}
                  placeholder="Select a certificate authority"
                  className="w-full"
                  position="popper"
                  isDisabled={Boolean(isEdit)}
                >
                  {certificateAuthorities.map((ca: any) => (
                    <SelectItem key={ca.id} value={ca.id}>
                      {ca.friendlyName || ca.name || ca.commonName}
                    </SelectItem>
                  ))}
                </Select>
              </FormControl>
            )}
          />

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
                      setValue("estConfig", {
                        disableBootstrapCaValidation: false,
                        passphrase: "",
                        caChain: ""
                      });
                      setValue("apiConfig", undefined);
                    } else {
                      setValue("apiConfig", {
                        autoRenew: false,
                        autoRenewDays: 30
                      });
                      setValue("estConfig", undefined);
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
                      {template.slug}
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
                label="Enrollment Type"
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
                        passphrase: "",
                        caChain: ""
                      });
                    } else {
                      setValue("estConfig", undefined);
                      setValue("apiConfig", {
                        autoRenew: false,
                        autoRenewDays: 30
                      });
                    }
                    onChange(value);
                  }}
                  className="w-full"
                  position="popper"
                  isDisabled={Boolean(isEdit)}
                >
                  <SelectItem value="api">API</SelectItem>
                  <SelectItem value="est">EST</SelectItem>
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
                      <div className="border-mineshaft-600 bg-mineshaft-900 flex items-center gap-3 rounded-md border p-4">
                        <Checkbox
                          id="disableBootstrapCaValidation"
                          isChecked={value}
                          onCheckedChange={onChange}
                        />
                        <div className="space-y-1">
                          <span className="text-mineshaft-100 text-sm font-medium">
                            Disable Bootstrap CA Validation
                          </span>
                          <p className="text-bunker-300 text-xs">
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
                          <p className="text-bunker-400 text-xs">
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
                    <Checkbox id="autoRenew" isChecked={value} onCheckedChange={onChange}>
                      Enable Auto-Renewal
                    </Checkbox>
                  </FormControl>
                )}
              />
            </div>
          )}

          {watchedAutoRenew && (
            <div className="mb-4 space-y-4">
              <Controller
                control={control}
                name="apiConfig.autoRenewDays"
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    label="Auto-Renewal Days"
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
                      onChange={(e) => field.onChange(parseInt(e.target.value, 10) || 30)}
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
