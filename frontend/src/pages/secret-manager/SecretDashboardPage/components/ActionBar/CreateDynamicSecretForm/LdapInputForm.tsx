import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import ms from "ms";
import { z } from "zod";

import { TtlFormLabel } from "@app/components/features";
import { createNotification } from "@app/components/notifications";
import {
  Button,
  FilterableSelect,
  FormControl,
  Input,
  Select,
  SelectItem,
  TextArea
} from "@app/components/v2";
import { useCreateDynamicSecret } from "@app/hooks/api";
import { DynamicSecretProviders } from "@app/hooks/api/dynamicSecret/types";
import { WorkspaceEnv } from "@app/hooks/api/types";
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
  provider: z.discriminatedUnion("credentialType", [
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
    }),
  name: slugSchema(),
  environment: z.object({ name: z.string(), slug: z.string() }),
  usernameTemplate: z.string().nullable().optional()
});

type TForm = z.infer<typeof formSchema>;

type Props = {
  onCompleted: () => void;
  onCancel: () => void;
  secretPath: string;
  projectSlug: string;
  environments: WorkspaceEnv[];
  isSingleEnvironmentMode?: boolean;
};

export const LdapInputForm = ({
  onCompleted,
  onCancel,
  secretPath,
  projectSlug,
  environments,
  isSingleEnvironmentMode
}: Props) => {
  const {
    control,
    formState: { isSubmitting },
    setValue,
    watch,
    handleSubmit
  } = useForm<TForm>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      provider: {
        url: "",
        binddn: "",
        bindpass: "",
        ca: "",
        creationLdif: "",
        revocationLdif: "",
        rollbackLdif: "",
        credentialType: CredentialType.Dynamic
      },
      environment: isSingleEnvironmentMode ? environments[0] : undefined,
      usernameTemplate: "{{randomUsername}}"
    }
  });

  const selectedCredentialType = watch("provider.credentialType");

  const createDynamicSecret = useCreateDynamicSecret();

  const handleCreateDynamicSecret = async ({
    name,
    maxTTL,
    provider,
    defaultTTL,
    environment,
    usernameTemplate
  }: TForm) => {
    // wait till previous request is finished
    if (createDynamicSecret.isPending) return;

    const isDefaultUsernameTemplate = usernameTemplate === "{{randomUsername}}";
    try {
      await createDynamicSecret.mutateAsync({
        provider: { type: DynamicSecretProviders.Ldap, inputs: provider },
        maxTTL,
        name,
        path: secretPath,
        defaultTTL,
        projectSlug,
        usernameTemplate:
          !usernameTemplate || isDefaultUsernameTemplate ? undefined : usernameTemplate,
        environmentSlug: environment.slug
      });
      onCompleted();
    } catch {
      createNotification({
        type: "error",
        text: "Failed to create dynamic secret"
      });
    }
  };

  return (
    <form onSubmit={handleSubmit(handleCreateDynamicSecret)} autoComplete="off">
      <div>
        <div className="flex items-center space-x-2">
          <div className="flex-grow">
            <Controller
              control={control}
              defaultValue=""
              name="name"
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  label="Secret Name"
                  isError={Boolean(error)}
                  errorText={error?.message}
                >
                  <Input {...field} placeholder="dynamic-secret" />
                </FormControl>
              )}
            />
          </div>
          <div className="w-32">
            <Controller
              control={control}
              name="defaultTTL"
              defaultValue="1h"
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
              defaultValue="24h"
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  label={<TtlFormLabel label="Max TTL" />}
                  isError={Boolean(error?.message)}
                  errorText={error?.message}
                >
                  <Input {...field} />
                </FormControl>
              )}
            />
          </div>
        </div>
        <div>
          <div className="mb-4 mt-4 border-b border-mineshaft-500 pb-2 pl-1 font-medium text-mineshaft-200">
            Configuration
          </div>
          <div className="flex flex-col">
            <div className="flex items-center space-x-2">
              <div className="flex-grow">
                <Controller
                  control={control}
                  name="provider.url"
                  render={({ field, fieldState: { error } }) => (
                    <FormControl
                      label="URL"
                      isError={Boolean(error?.message)}
                      errorText={error?.message}
                    >
                      <Input {...field} />
                    </FormControl>
                  )}
                />

                <Controller
                  control={control}
                  name="provider.binddn"
                  render={({ field, fieldState: { error } }) => (
                    <FormControl
                      label="Bind DN"
                      isError={Boolean(error?.message)}
                      errorText={error?.message}
                    >
                      <Input {...field} />
                    </FormControl>
                  )}
                />

                <Controller
                  control={control}
                  name="provider.bindpass"
                  render={({ field, fieldState: { error } }) => (
                    <FormControl
                      label="Bind Password"
                      isError={Boolean(error?.message)}
                      errorText={error?.message}
                    >
                      <Input {...field} type="password" />
                    </FormControl>
                  )}
                />

                <Controller
                  control={control}
                  name="provider.ca"
                  render={({ field, fieldState: { error } }) => (
                    <FormControl
                      label="CA"
                      isError={Boolean(error?.message)}
                      errorText={error?.message}
                    >
                      <TextArea {...field} placeholder="-----BEGIN CERTIFICATE----- ..." />
                    </FormControl>
                  )}
                />

                <Controller
                  control={control}
                  name="provider.credentialType"
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
                            "provider.creationLdif",
                            "provider.revocationLdif",
                            "provider.rollbackLdif",
                            "provider.rotationLdif"
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
                      name="provider.creationLdif"
                      render={({ field, fieldState: { error } }) => (
                        <FormControl
                          label="Creation LDIF"
                          isError={Boolean(error?.message)}
                          errorText={error?.message}
                        >
                          <TextArea {...field} />
                        </FormControl>
                      )}
                    />

                    <Controller
                      control={control}
                      name="provider.revocationLdif"
                      render={({ field, fieldState: { error } }) => (
                        <FormControl
                          label="Revocation LDIF"
                          isError={Boolean(error?.message)}
                          errorText={error?.message}
                        >
                          <TextArea {...field} />
                        </FormControl>
                      )}
                    />

                    <Controller
                      control={control}
                      name="provider.rollbackLdif"
                      render={({ field, fieldState: { error } }) => (
                        <FormControl
                          label="Rollback LDIF"
                          isError={Boolean(error?.message)}
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
                    name="provider.rotationLdif"
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
                {!isSingleEnvironmentMode && (
                  <Controller
                    control={control}
                    name="environment"
                    render={({ field: { value, onChange }, fieldState: { error } }) => (
                      <FormControl
                        label="Environment"
                        isError={Boolean(error)}
                        errorText={error?.message}
                      >
                        <FilterableSelect
                          options={environments}
                          value={value}
                          onChange={onChange}
                          placeholder="Select the environment to create secret in..."
                          getOptionLabel={(option) => option.name}
                          getOptionValue={(option) => option.slug}
                          menuPlacement="top"
                        />
                      </FormControl>
                    )}
                  />
                )}
              </div>
            </div>
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
                    placeholder="{{randomUsername}}"
                  />
                </FormControl>
              )}
            />
          </div>
        </div>
      </div>
      <div className="mt-4 flex items-center space-x-4">
        <Button type="submit" isLoading={isSubmitting}>
          Submit
        </Button>
        <Button variant="outline_bg" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
};
