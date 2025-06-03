import { Controller, useFieldArray, useForm } from "react-hook-form";
import { faPlus, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import ms from "ms";
import { z } from "zod";

import { TtlFormLabel } from "@app/components/features";
import { createNotification } from "@app/components/notifications";
import {
  Button,
  FilterableSelect,
  FormControl,
  FormLabel,
  IconButton,
  Input,
  SecretInput
} from "@app/components/v2";
import { useCreateDynamicSecret } from "@app/hooks/api";
import { DynamicSecretProviders } from "@app/hooks/api/dynamicSecret/types";
import { WorkspaceEnv } from "@app/hooks/api/types";
import { slugSchema } from "@app/lib/schemas";

const formSchema = z.object({
  provider: z.object({
    host: z.string().toLowerCase().min(1),
    port: z.coerce.number().optional(),
    database: z.string().min(1),
    username: z.string().min(1),
    password: z.string().min(1),
    ca: z.string().optional(),
    roles: z
      .object({
        roleName: z.string().min(1)
      })
      .array()
      .min(1)
  }),
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

export const MongoDBDatabaseInputForm = ({
  onCompleted,
  onCancel,
  environments,
  secretPath,
  projectSlug,
  isSingleEnvironmentMode
}: Props) => {
  const {
    control,
    setValue,
    getValues,
    formState: { isSubmitting },
    handleSubmit
  } = useForm<TForm>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      provider: {
        roles: [{ roleName: "readWrite" }]
      },
      environment: isSingleEnvironmentMode ? environments[0] : undefined,
      usernameTemplate: "{{randomUsername}}"
    }
  });

  const roleFields = useFieldArray({
    control,
    name: "provider.roles"
  });

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
        provider: {
          type: DynamicSecretProviders.MongoDB,
          inputs: {
            ...provider,
            port: provider?.port ? provider.port : undefined,
            roles: provider.roles.map((el) => el.roleName)
          }
        },
        maxTTL,
        name,
        path: secretPath,
        defaultTTL,
        projectSlug,
        environmentSlug: environment.slug,
        usernameTemplate:
          !usernameTemplate || isDefaultUsernameTemplate ? undefined : usernameTemplate
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
    <div>
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
                <Controller
                  control={control}
                  name="provider.host"
                  defaultValue=""
                  render={({ field, fieldState: { error } }) => (
                    <FormControl
                      label="Host"
                      className="flex-grow"
                      isError={Boolean(error?.message)}
                      errorText={error?.message}
                    >
                      <Input {...field} />
                    </FormControl>
                  )}
                />
                <Controller
                  control={control}
                  name="provider.port"
                  defaultValue={27017}
                  render={({ field, fieldState: { error } }) => (
                    <FormControl
                      label="Port"
                      isOptional
                      isError={Boolean(error?.message)}
                      errorText={error?.message}
                    >
                      <Input {...field} type="number" />
                    </FormControl>
                  )}
                />
              </div>
              <div className="flex items-center space-x-2">
                <Controller
                  control={control}
                  name="provider.username"
                  defaultValue=""
                  render={({ field, fieldState: { error } }) => (
                    <FormControl
                      label="User"
                      isError={Boolean(error?.message)}
                      errorText={error?.message}
                    >
                      <Input {...field} autoComplete="off" />
                    </FormControl>
                  )}
                />
                <Controller
                  control={control}
                  name="provider.password"
                  render={({ field, fieldState: { error } }) => (
                    <FormControl
                      label="Password"
                      isError={Boolean(error?.message)}
                      errorText={error?.message}
                    >
                      <Input {...field} type="password" autoComplete="new-password" />
                    </FormControl>
                  )}
                />
                <Controller
                  control={control}
                  name="provider.database"
                  defaultValue="default"
                  render={({ field, fieldState: { error } }) => (
                    <FormControl
                      label="Database Name"
                      isError={Boolean(error?.message)}
                      errorText={error?.message}
                    >
                      <Input {...field} />
                    </FormControl>
                  )}
                />
              </div>
              <FormLabel
                label="Roles"
                tooltipClassName="max-w-md whitespace-pre-line"
                tooltipText={`Human-readable label that identifies a group of privileges assigned to a database user. This value can either be a built-in role or a custom role.
														Built-in: atlasAdmin, backup, clusterMonitor, dbAdmin, dbAdminAnyDatabase, enableSharding, read, readAnyDatabase, readWrite, readWriteAnyDatabase.`}
              />
              <div className="mb-3 mt-1 flex flex-col space-y-2">
                {roleFields.fields.map(({ id: roleFieldId }, i) => (
                  <div key={roleFieldId} className="flex items-end space-x-2">
                    <div className="flex-grow">
                      <Controller
                        control={control}
                        name={`provider.roles.${i}.roleName`}
                        render={({ field, fieldState: { error } }) => (
                          <FormControl
                            isError={Boolean(error?.message)}
                            errorText={error?.message}
                            className="mb-0 flex-grow"
                          >
                            <Input {...field} />
                          </FormControl>
                        )}
                      />
                    </div>
                    <IconButton
                      ariaLabel="delete key"
                      className="bottom-0.5 h-9"
                      variant="outline_bg"
                      onClick={() => {
                        const roles = getValues("provider.roles");
                        if (roles && roles?.length > 1) {
                          roleFields.remove(i);
                        } else {
                          setValue("provider.roles", [{ roleName: "" }]);
                        }
                      }}
                    >
                      <FontAwesomeIcon icon={faTrash} />
                    </IconButton>
                  </div>
                ))}
                <div>
                  <Button
                    leftIcon={<FontAwesomeIcon icon={faPlus} />}
                    size="xs"
                    variant="outline_bg"
                    onClick={() => roleFields.append({ roleName: "" })}
                  >
                    Add Role
                  </Button>
                </div>
              </div>
              <div>
                <Controller
                  control={control}
                  name="provider.ca"
                  render={({ field, fieldState: { error } }) => (
                    <FormControl
                      isOptional
                      label="CA(SSL)"
                      isError={Boolean(error?.message)}
                      errorText={error?.message}
                    >
                      <SecretInput
                        {...field}
                        containerClassName="text-bunker-300 hover:border-primary-400/50 border border-mineshaft-600 bg-mineshaft-900 px-2 py-1.5"
                      />
                    </FormControl>
                  )}
                />
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
    </div>
  );
};
