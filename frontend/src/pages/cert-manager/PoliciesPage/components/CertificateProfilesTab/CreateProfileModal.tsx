/* eslint-disable jsx-a11y/label-has-associated-control */
import { useEffect } from "react";
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
import { useCreateCertificateProfile } from "@app/hooks/api/certificateProfiles";
import { useListCertificateTemplatesV2 } from "@app/hooks/api/certificateTemplates/queries";

const schema = z
  .object({
    name: z.string().trim().min(1, "Profile name is required"),
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

export type FormData = z.infer<typeof schema>;

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const CreateProfileModal = ({ isOpen, onClose }: Props) => {
  const { currentProject } = useProject();

  const { data: caData } = useListCasByProjectId(currentProject?.id || "");
  const { data: templateData } = useListCertificateTemplatesV2({
    projectId: currentProject?.id || "",
    limit: 100,
    offset: 0
  });

  const createProfile = useCreateCertificateProfile();

  const certificateAuthorities = caData || [];
  const certificateTemplates = templateData?.certificateTemplates || [];

  const {
    control,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { isSubmitting }
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
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

  const watchedName = watch("name");
  const watchedEnrollmentType = watch("enrollmentType");
  const watchedDisableBootstrapValidation = watch("estConfig.disableBootstrapCaValidation");
  const watchedAutoRenew = watch("apiConfig.autoRenew");

  useEffect(() => {
    if (watchedName && !watch("slug")) {
      const slug = watchedName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");
      setValue("slug", slug);
    }
  }, [watchedName, setValue, watch]);

  const onFormSubmit = async (data: FormData) => {
    try {
      if (!currentProject?.id) return;

      const payload: any = {
        projectId: currentProject.id,
        name: data.name,
        slug: data.slug,
        description: data.description,
        enrollmentType: data.enrollmentType,
        caId: data.certificateAuthorityId,
        certificateTemplateId: data.certificateTemplateId
      };

      if (data.enrollmentType === "est" && data.estConfig) {
        payload.estConfig = data.estConfig;
      } else if (data.enrollmentType === "api" && data.apiConfig) {
        payload.apiConfig = data.apiConfig;
      }
      await createProfile.mutateAsync(payload);

      createNotification({
        text: "Certificate profile created successfully",
        type: "success"
      });

      reset();
      onClose();
    } catch (error) {
      console.error("Error creating profile:", error);
      createNotification({
        text: "Failed to create certificate profile",
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
        title="Create Certificate Profile"
        subTitle="Configure a new certificate profile for unified certificate issuance"
      >
        <form onSubmit={handleSubmit(onFormSubmit)}>
          <Controller
            control={control}
            name="name"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="Profile Name"
                isRequired
                isError={Boolean(error)}
                errorText={error?.message}
              >
                <Input {...field} placeholder="Enter profile name" />
              </FormControl>
            )}
          />

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
                <Input {...field} placeholder="auto-generated-from-name" />
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
                label="Certificate Authority"
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
                    onChange(value);
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
                  }}
                  placeholder="Select a certificate template"
                  className="w-full"
                  position="popper"
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
                label="Enrollment Type"
                isRequired
                isError={Boolean(error)}
                errorText={error?.message}
              >
                <Select {...field} onValueChange={onChange} className="w-full" position="popper">
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
                      <div className="flex items-center gap-3 rounded-md border border-mineshaft-600 bg-mineshaft-900 p-4">
                        <Checkbox
                          id="disableBootstrapCaValidation"
                          isChecked={value}
                          onCheckedChange={onChange}
                        />
                        <div className="space-y-1">
                          <label
                            htmlFor="disableBootstrapCaValidation"
                            className="text-sm font-medium text-mineshaft-100"
                          >
                            Disable Bootstrap CA Validation
                          </label>
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
                      isRequired
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
                        isRequired
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
            <Button type="submit" colorSchema="primary" isLoading={isSubmitting}>
              Create
            </Button>
            <Button variant="outline_bg" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
          </div>
        </form>
      </ModalContent>
    </Modal>
  );
};
