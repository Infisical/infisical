import { Controller, useFieldArray, useForm } from "react-hook-form";
import { faPlus, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import ms from "ms";
import { z } from "zod";

import { TtlFormLabel } from "@app/components/features";
import { createNotification } from "@app/components/notifications";
import { Button, FormControl, FormLabel, IconButton, Input, SecretInput } from "@app/components/v2";
import { useUpdateDynamicSecret } from "@app/hooks/api";
import { TDynamicSecret } from "@app/hooks/api/dynamicSecret/types";
import { slugSchema } from "@app/lib/schemas";

const formSchema = z.object({
  inputs: z
    .object({
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
    })
    .partial(),
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

export const EditDynamicSecretMongoDBForm = ({
  onClose,
  dynamicSecret,
  environment,
  secretPath,
  projectSlug
}: Props) => {
  const {
    control,
    getValues,
    setValue,
    formState: { isSubmitting },
    handleSubmit
  } = useForm<TForm>({
    resolver: zodResolver(formSchema),
    values: {
      defaultTTL: dynamicSecret.defaultTTL,
      maxTTL: dynamicSecret.maxTTL,
      newName: dynamicSecret.name,
      usernameTemplate: dynamicSecret?.usernameTemplate || "{{randomUsername}}",
      inputs: {
        ...(dynamicSecret.inputs as TForm["inputs"]),
        roles: (dynamicSecret.inputs as { roles: string[] }).roles?.map((roleName) => ({
          roleName
        }))
      }
    }
  });

  const roleFields = useFieldArray({
    control,
    name: "inputs.roles"
  });

  const updateDynamicSecret = useUpdateDynamicSecret();

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
          inputs: {
            ...inputs,
            port: inputs?.port ? inputs.port : undefined,
            roles: inputs?.roles?.map((el) => el.roleName)
          },
          usernameTemplate:
            !usernameTemplate || isDefaultUsernameTemplate ? null : usernameTemplate,
          newName: newName === dynamicSecret.name ? undefined : newName
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
        <div>
          <div className="mb-4 mt-4 border-b border-mineshaft-500 pb-2 pl-1 font-medium text-mineshaft-200">
            Configuration
          </div>
          <div className="flex flex-col">
            <div className="flex items-center space-x-2">
              <Controller
                control={control}
                name="inputs.host"
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
                name="inputs.port"
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
                name="inputs.username"
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
                name="inputs.password"
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
                name="inputs.database"
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
                      name={`inputs.roles.${i}.roleName`}
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
                      const roles = getValues("inputs.roles");
                      if (roles && roles?.length > 1) {
                        roleFields.remove(i);
                      } else {
                        setValue("inputs.roles", [{ roleName: "" }]);
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
                name="inputs.ca"
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
            <div>
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
          </div>
        </div>
        <div className="mt-4 flex items-center space-x-4">
          <Button type="submit" isLoading={isSubmitting}>
            Save
          </Button>
          <Button variant="outline_bg" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
};
