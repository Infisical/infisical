import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import slugify from "@sindresorhus/slugify";
import ms from "ms";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  FormControl,
  Input,
  Modal,
  ModalContent,
  Select,
  SelectItem,
  Switch
} from "@app/components/v2";
import { useWorkspace } from "@app/context";
import {
  useCreateSshCertTemplate,
  useGetSshCaById,
  useGetSshCertTemplate,
  useListWorkspaceSshCas,
  useUpdateSshCertTemplate
} from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";

const schema = z
  .object({
    sshCaId: z.string(),
    name: z
      .string()
      .trim()
      .toLowerCase()
      .min(1)
      .max(36)
      .refine((v) => slugify(v) === v, {
        message: "Invalid name. Name can only contain alphanumeric characters and hyphens."
      }),
    ttl: z
      .string()
      .trim()
      .refine(
        (val) => ms(val) > 0,
        "TTL must be a valid time string such as 2 days, 1d, 2h 1y, ..."
      )
      .default("1h"),
    maxTTL: z
      .string()
      .trim()
      .refine(
        (val) => ms(val) > 0,
        "Max TTL must be a valid time string such as 2 days, 1d, 2h 1y, ..."
      )
      .default("30d"),
    allowedUsers: z.string(),
    allowedHosts: z.string(),
    allowUserCertificates: z.boolean().optional().default(false),
    allowHostCertificates: z.boolean().optional().default(false),
    allowCustomKeyIds: z.boolean().optional().default(false)
  })
  .refine((data) => ms(data.maxTTL) >= ms(data.ttl), {
    message: "Max TTL must be greater than or equal to TTL",
    path: ["maxTTL"]
  });

export type FormData = z.infer<typeof schema>;

type Props = {
  sshCaId: string;
  popUp: UsePopUpState<["sshCertificateTemplate"]>;
  handlePopUpToggle: (
    popUpName: keyof UsePopUpState<["sshCertificateTemplate"]>,
    state?: boolean
  ) => void;
};

export const SshCertificateTemplateModal = ({ popUp, handlePopUpToggle, sshCaId }: Props) => {
  const { currentWorkspace } = useWorkspace();

  const { data: ca } = useGetSshCaById(sshCaId);

  const { data: certTemplate } = useGetSshCertTemplate(
    (popUp?.sshCertificateTemplate?.data as { id: string })?.id || ""
  );

  const { data: cas } = useListWorkspaceSshCas(currentWorkspace?.id || "");

  const { mutateAsync: createSshCertTemplate } = useCreateSshCertTemplate();
  const { mutateAsync: updateSshCertTemplate } = useUpdateSshCertTemplate();

  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting }
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {}
  });

  useEffect(() => {
    if (certTemplate) {
      reset({
        sshCaId: certTemplate.sshCaId,
        name: certTemplate.name,
        ttl: certTemplate.ttl,
        maxTTL: certTemplate.maxTTL,
        allowedUsers: certTemplate.allowedUsers.join(", "),
        allowedHosts: certTemplate.allowedHosts.join(", "),
        allowUserCertificates: certTemplate.allowUserCertificates,
        allowHostCertificates: certTemplate.allowHostCertificates,
        allowCustomKeyIds: certTemplate.allowCustomKeyIds
      });
    } else {
      reset({
        sshCaId,
        name: "",
        ttl: "1h",
        maxTTL: "30d",
        allowedUsers: "",
        allowedHosts: "",
        allowUserCertificates: false,
        allowHostCertificates: false,
        allowCustomKeyIds: false
      });
    }
  }, [certTemplate, ca]);

  const onFormSubmit = async ({
    name,
    ttl,
    maxTTL,
    allowUserCertificates,
    allowHostCertificates,
    allowedUsers,
    allowedHosts,
    allowCustomKeyIds
  }: FormData) => {
    try {
      if (certTemplate) {
        await updateSshCertTemplate({
          id: certTemplate.id,
          name,
          ttl,
          maxTTL,
          allowedUsers: allowedUsers ? allowedUsers.split(",").map((user) => user.trim()) : [],
          allowedHosts: allowedHosts ? allowedHosts.split(",").map((host) => host.trim()) : [],
          allowUserCertificates,
          allowHostCertificates,
          allowCustomKeyIds
        });

        createNotification({
          text: "Successfully updated SSH certificate template",
          type: "success"
        });
      } else {
        await createSshCertTemplate({
          sshCaId,
          name,
          ttl,
          maxTTL,
          allowedUsers: allowedUsers ? allowedUsers.split(",").map((user) => user.trim()) : [],
          allowedHosts: allowedHosts ? allowedHosts.split(",").map((host) => host.trim()) : [],
          allowUserCertificates,
          allowHostCertificates,
          allowCustomKeyIds
        });

        createNotification({
          text: "Successfully created SSH certificate template",
          type: "success"
        });
      }

      reset();
      handlePopUpToggle("sshCertificateTemplate", false);
    } catch (err) {
      console.error(err);
      createNotification({
        text: "Failed to save changes",
        type: "error"
      });
    }
  };

  return (
    <Modal
      isOpen={popUp?.sshCertificateTemplate?.isOpen}
      onOpenChange={(isOpen) => {
        handlePopUpToggle("sshCertificateTemplate", isOpen);
        reset();
      }}
    >
      <ModalContent
        title={certTemplate ? "SSH Certificate Template" : "Create SSH Certificate Template"}
      >
        <form onSubmit={handleSubmit(onFormSubmit)}>
          {certTemplate && (
            <FormControl label="SSH Certificate Template ID">
              <Input value={certTemplate.id} isDisabled className="bg-white/[0.07]" />
            </FormControl>
          )}
          <Controller
            control={control}
            defaultValue=""
            name="name"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="SSH Template Name"
                isError={Boolean(error)}
                errorText={error?.message}
                isRequired
              >
                <Input {...field} placeholder="administrator" />
              </FormControl>
            )}
          />
          <Controller
            control={control}
            name="sshCaId"
            defaultValue={sshCaId}
            render={({ field: { onChange, ...field }, fieldState: { error } }) => (
              <FormControl
                label="Issuing SSH CA"
                errorText={error?.message}
                isError={Boolean(error)}
                className="mt-4"
                isRequired
              >
                <Select
                  defaultValue={field.value}
                  {...field}
                  onValueChange={(e) => onChange(e)}
                  className="w-full"
                  isDisabled
                >
                  {(cas || []).map(({ id, friendlyName }) => (
                    <SelectItem value={id} key={`ssh-ca-${id}`}>
                      {friendlyName}
                    </SelectItem>
                  ))}
                </Select>
              </FormControl>
            )}
          />
          <Controller
            control={control}
            name="allowedUsers"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="Allowed Users"
                isError={Boolean(error)}
                errorText={error?.message}
              >
                <Input {...field} placeholder="ec2-user, developer, ..." />
              </FormControl>
            )}
          />
          <Controller
            control={control}
            name="allowedHosts"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="Allowed Hosts"
                isError={Boolean(error)}
                errorText={error?.message}
              >
                <Input {...field} placeholder="*.compute.amazonaws.com, api.example.com, ..." />
              </FormControl>
            )}
          />
          <Controller
            control={control}
            name="ttl"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="Default TTL"
                isError={Boolean(error)}
                errorText={error?.message}
                isRequired
              >
                <Input {...field} placeholder="2 days, 1d, 2h, 1y, ..." />
              </FormControl>
            )}
          />
          <Controller
            control={control}
            name="maxTTL"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="Max TTL"
                isError={Boolean(error)}
                errorText={error?.message}
                isRequired
              >
                <Input {...field} placeholder="2 days, 1d, 2h, 1y, ..." />
              </FormControl>
            )}
          />
          <Controller
            control={control}
            name="allowUserCertificates"
            render={({ field, fieldState: { error } }) => {
              return (
                <FormControl isError={Boolean(error)} errorText={error?.message}>
                  <Switch
                    id="allow-user-certificates"
                    onCheckedChange={(value) => field.onChange(value)}
                    isChecked={field.value}
                  >
                    <p className="ml-1 w-full">Allow User Certificates</p>
                  </Switch>
                </FormControl>
              );
            }}
          />
          <Controller
            control={control}
            name="allowHostCertificates"
            render={({ field, fieldState: { error } }) => {
              return (
                <FormControl isError={Boolean(error)} errorText={error?.message}>
                  <Switch
                    id="allow-host-certificates"
                    onCheckedChange={(value) => field.onChange(value)}
                    isChecked={field.value}
                  >
                    <p className="ml-1 w-full">Allow Host Certificates</p>
                  </Switch>
                </FormControl>
              );
            }}
          />
          <Controller
            control={control}
            name="allowCustomKeyIds"
            render={({ field, fieldState: { error } }) => {
              return (
                <FormControl isError={Boolean(error)} errorText={error?.message}>
                  <Switch
                    id="allow-custom-key-ids"
                    onCheckedChange={(value) => field.onChange(value)}
                    isChecked={field.value}
                  >
                    <p className="ml-1 w-full">Allow Custom Key IDs</p>
                  </Switch>
                </FormControl>
              );
            }}
          />
          <div className="mt-4 flex items-center">
            <Button
              className="mr-4"
              size="sm"
              type="submit"
              isLoading={isSubmitting}
              isDisabled={isSubmitting}
            >
              Save
            </Button>
            <Button
              colorSchema="secondary"
              variant="plain"
              onClick={() => handlePopUpToggle("sshCertificateTemplate", false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      </ModalContent>
    </Modal>
  );
};
