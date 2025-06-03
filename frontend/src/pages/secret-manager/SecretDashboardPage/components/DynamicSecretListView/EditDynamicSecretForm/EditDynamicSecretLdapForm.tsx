import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import ms from "ms";
import { z } from "zod";

import { TtlFormLabel } from "@app/components/features";
import { createNotification } from "@app/components/notifications";
import { Button, FormControl, Input, Select, SelectItem, TextArea } from "@app/components/v2";
import { useUpdateDynamicSecret } from "@app/hooks/api";
import { TDynamicSecret } from "@app/hooks/api/dynamicSecret/types";
import { slugSchema } from "@app/lib/schemas";

enum CredentialType {
  Dynamic = "dynamic",
  Static = "static"
}

const credentialTypes = [
  {
    label: "Dynamic",
    value: CredentialType.Dynamic
  },
  {
    label: "Static",
    value: CredentialType.Static
  }
] as const;

const formSchema = z.object({
  inputs: z.discriminatedUnion("credentialType", [
    z.object({
      url: z.string().trim().min(1),
      binddn: z.string().trim().min(1),
      bindpass: z.string().trim().min(1),
      ca: z.string().optional(),
      credentialType: z.literal(CredentialType.Dynamic),
      creationLdif: z.string().min(1),
      revocationLdif: z.string().min(1),
      rollbackLdif: z.string().optional()
    }),
    z.object({
      url: z.string().trim().min(1),
      binddn: z.string().trim().min(1),
      bindpass: z.string().trim().min(1),
      ca: z.string().optional(),
      credentialType: z.literal(CredentialType.Static),
      rotationLdif: z.string().min(1)
    })
  ]),
  defaultTTL: z.string().superRefine((val, ctx) => {
    const valMs = ms(val);
    if (valMs < 60 * 1000)
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "TTL must be a greater than 1min" });
    // a day
    if (valMs > 24 * 60 * 60 * 1000)
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "TTL must be less than a day" });
  }),
  maxTTL: z
    .string()
    .optional()
    .superRefine((val, ctx) => {
      if (!val) return;
      const valMs = ms(val);
      if (valMs < 60 * 1000)
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "TTL must be a greater than 1min" });
      // a day
      if (valMs > 24 * 60 * 60 * 1000)
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "TTL must be less than a day" });
    })
    .nullable(),
  newName: slugSchema().optional(),
  usernameTemplate: z.string().trim().nullable().optional()
});
type TForm = z.infer<typeof formSchema>;

type Props = {
  onClose: () => void;
  dynamicSecret: TDynamicSecret & { inputs: unknown };
  secretPath: string;
  environment: string;
  projectSlug: string;
};

export const EditDynamicSecretLdapForm = ({
  onClose,
  dynamicSecret,
  environment,
  secretPath,
  projectSlug
}: Props) => {
  const {
    control,
    formState: { isSubmitting },
    handleSubmit,
    watch,
    setValue
  } = useForm<TForm>({
    resolver: zodResolver(formSchema),
    values: {
      defaultTTL: dynamicSecret.defaultTTL,
      maxTTL: dynamicSecret.maxTTL,
      newName: dynamicSecret.name,
      usernameTemplate: dynamicSecret?.usernameTemplate || "{{randomUsername}}",
      inputs: {
        ...(dynamicSecret.inputs as TForm["inputs"])
      }
    }
  });

  const updateDynamicSecret = useUpdateDynamicSecret();
  const selectedCredentialType = watch("inputs.credentialType");

  const handleUpdateDynamicSecret = async ({
    inputs,
    maxTTL,
    defaultTTL,
    newName,
    usernameTemplate
  }: TForm) => {
    // wait till previous request is finished
    if (updateDynamicSecret.isPending) return;

    const isDefaultUsernameTemplate = usernameTemplate === "{{randomUsername}}";
    try {
      await updateDynamicSecret.mutateAsync({
        name: dynamicSecret.name,
        path: secretPath,
        projectSlug,
        environmentSlug: environment,
        data: {
          maxTTL: maxTTL || undefined,
          defaultTTL,
          inputs,
          newName: newName === dynamicSecret.name ? undefined : newName,
          usernameTemplate: !usernameTemplate || isDefaultUsernameTemplate ? null : usernameTemplate
        }
      });
      onClose();
      createNotification({
        type: "success",
        text: "Successfully updated dynamic secret"
      });
    } catch {
      createNotification({
        type: "error",
        text: "Failed to update dynamic secret"
      });
    }
  };

  return (
    <div>
      <form onSubmit={handleSubmit(handleUpdateDynamicSecret)} autoComplete="off">
        <div className="flex items-center space-x-2">
          <div className="flex-grow">
            <Controller
              control={control}
              name="newName"
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  label="Secret Name"
                  isError={Boolean(error)}
                  errorText={error?.message}
                >
                  <Input {...field} placeholder="DYN-1" />
                </FormControl>
              )}
            />
          </div>
          <div className="w-32">
            <Controller
              control={control}
              name="defaultTTL"
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  label={<TtlFormLabel label="Default TTL" />}
                  isError={Boolean(error?.message)}
                  errorText={error?.message}
                >
                  <Input {...field} />
                </FormControl>
              )}
            />
          </div>
          <div className="w-32">
            <Controller
              control={control}
              name="maxTTL"
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  label={<TtlFormLabel label="Max TTL" />}
                  isError={Boolean(error?.message)}
                  errorText={error?.message}
                >
                  <Input {...field} value={field.value || ""} />
                </FormControl>
              )}
            />
          </div>
        </div>
        <div className="mt-4">
          <Controller
            control={control}
            name="inputs.url"
            render={({ field, fieldState: { error } }) => (
              <FormControl label="URL" isError={Boolean(error)} errorText={error?.message}>
                <Input {...field} />
              </FormControl>
            )}
          />
          <Controller
            control={control}
            name="inputs.binddn"
            render={({ field, fieldState: { error } }) => (
              <FormControl label="Bind DN" isError={Boolean(error)} errorText={error?.message}>
                <Input {...field} />
              </FormControl>
            )}
          />
          <Controller
            control={control}
            name="inputs.bindpass"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="Bind Password"
                isError={Boolean(error)}
                errorText={error?.message}
              >
                <Input {...field} type="password" />
              </FormControl>
            )}
          />
          <Controller
            control={control}
            name="inputs.ca"
            render={({ field, fieldState: { error } }) => (
              <FormControl label="CA" isError={Boolean(error)} errorText={error?.message}>
                <TextArea {...field} />
              </FormControl>
            )}
          />
          <Controller
            control={control}
            name="inputs.credentialType"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="Credential Type"
                isError={Boolean(error?.message)}
                errorText={error?.message}
                className="w-full"
              >
                <Select
                  defaultValue={field.value}
                  {...field}
                  className="w-full"
                  onValueChange={(e) => {
                    const ldifFields = [
                      "inputs.creationLdif",
                      "inputs.revocationLdif",
                      "inputs.rollbackLdif",
                      "inputs.rotationLdif"
                    ] as const;

                    ldifFields.forEach((f) => {
                      setValue(f, "");
                    });

                    field.onChange(e);
                  }}
                >
                  {credentialTypes.map((credentialType) => (
                    <SelectItem
                      value={credentialType.value}
                      key={`credential-type-${credentialType.value}`}
                    >
                      {credentialType.label}
                    </SelectItem>
                  ))}
                </Select>
              </FormControl>
            )}
          />
          {selectedCredentialType === CredentialType.Dynamic && (
            <>
              <Controller
                control={control}
                name="inputs.creationLdif"
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    label="Creation LDIF"
                    isError={Boolean(error)}
                    errorText={error?.message}
                  >
                    <TextArea {...field} />
                  </FormControl>
                )}
              />
              <Controller
                control={control}
                name="inputs.revocationLdif"
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    label="Revocation LDIF"
                    isError={Boolean(error)}
                    errorText={error?.message}
                  >
                    <TextArea {...field} />
                  </FormControl>
                )}
              />
              <Controller
                control={control}
                name="inputs.rollbackLdif"
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    label="Rollback LDIF"
                    isError={Boolean(error)}
                    errorText={error?.message}
                  >
                    <TextArea {...field} />
                  </FormControl>
                )}
              />
            </>
          )}
          {selectedCredentialType === CredentialType.Static && (
            <Controller
              control={control}
              name="inputs.rotationLdif"
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  label="Rotation LDIF"
                  isError={Boolean(error?.message)}
                  errorText={error?.message}
                >
                  <TextArea {...field} />
                </FormControl>
              )}
            />
          )}
          <Controller
            control={control}
            name="usernameTemplate"
            defaultValue=""
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="Username Template"
                isError={Boolean(error?.message)}
                errorText={error?.message}
              >
                <Input
                  {...field}
                  value={field.value || undefined}
                  className="border-mineshaft-600 bg-mineshaft-900 text-sm"
                />
              </FormControl>
            )}
          />
        </div>
        <div className="mt-4 flex items-center space-x-4">
          <Button type="submit" isLoading={isSubmitting}>
            Submit
          </Button>
          <Button variant="outline_bg" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
};
