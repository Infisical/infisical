import { Controller, useForm } from "react-hook-form";
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
  inputs: z.object({
    host: z.string().trim().min(1),
    port: z.coerce.number(), // important: this is the management plugin port

    username: z.string(),
    password: z.string(),

    tags: z.array(z.string().trim()),
    virtualHost: z.object({
      name: z.string().trim().min(1),
      permissions: z.object({
        read: z.string().trim().min(1),
        write: z.string().trim().min(1),
        configure: z.string().trim().min(1)
      })
    }),
    ca: z.string().optional()
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
export const EditDynamicSecretRabbitMqForm = ({
  onClose,
  dynamicSecret,
  secretPath,
  environment,
  projectSlug
}: Props) => {
  const {
    control,
    formState: { isSubmitting },
    handleSubmit,
    setValue,
    watch
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

  const selectedTags = watch("inputs.tags");

  return (
    <div>
      <form onSubmit={handleSubmit(handleUpdateDynamicSecret)} autoComplete="off">
        <div>
          <div className="flex items-center space-x-2">
            <div className="flex-grow">
              <Controller
                control={control}
                defaultValue=""
                name="newName"
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
                  name="inputs.host"
                  defaultValue=""
                  render={({ field, fieldState: { error } }) => (
                    <FormControl
                      label="Host"
                      className="flex-grow"
                      isError={Boolean(error?.message)}
                      errorText={error?.message}
                    >
                      <Input placeholder="https://your-rabbitmq-host.com" {...field} />
                    </FormControl>
                  )}
                />
                <Controller
                  control={control}
                  name="inputs.port"
                  defaultValue={443}
                  render={({ field, fieldState: { error } }) => (
                    <FormControl
                      tooltipText="The port on which the RabbitMQ management plugin is running. Default is 15672."
                      label="Management Port"
                      isError={Boolean(error?.message)}
                      errorText={error?.message}
                    >
                      <Input {...field} type="number" />
                    </FormControl>
                  )}
                />
              </div>

              <div className="flex w-full items-center gap-2">
                <Controller
                  control={control}
                  name="inputs.username"
                  defaultValue=""
                  render={({ field, fieldState: { error } }) => (
                    <FormControl
                      label="Username"
                      className="w-full"
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
                      className="w-full"
                      isError={Boolean(error?.message)}
                      errorText={error?.message}
                    >
                      <Input {...field} type="password" autoComplete="new-password" />
                    </FormControl>
                  )}
                />
              </div>

              <div>
                <FormLabel label="Virtual Host" className="mb-2" />
                <div className="mt-2 flex items-center justify-evenly gap-2">
                  <Controller
                    control={control}
                    name="inputs.virtualHost.name"
                    render={({ field, fieldState: { error } }) => (
                      <FormControl
                        label="Name"
                        tooltipText="The virtual host to which the user will be assigned. Default is /."
                        isError={Boolean(error?.message)}
                        errorText={error?.message}
                      >
                        <Input placeholder="/virtual-host" {...field} autoComplete="off" />
                      </FormControl>
                    )}
                  />

                  <Controller
                    control={control}
                    name="inputs.virtualHost.permissions.read"
                    render={({ field, fieldState: { error } }) => (
                      <FormControl
                        label="Read Permissions"
                        tooltipText="A regular expression matching resource names for which the user is granted read permissions."
                        isError={Boolean(error?.message)}
                        errorText={error?.message}
                      >
                        <Input placeholder=".*" {...field} autoComplete="off" />
                      </FormControl>
                    )}
                  />
                  <Controller
                    control={control}
                    name="inputs.virtualHost.permissions.write"
                    render={({ field, fieldState: { error } }) => (
                      <FormControl
                        label="Write Permissions"
                        tooltipText="A regular expression matching resource names for which the user is granted write permissions."
                        isError={Boolean(error?.message)}
                        errorText={error?.message}
                      >
                        <Input placeholder=".*" {...field} autoComplete="off" />
                      </FormControl>
                    )}
                  />
                  <Controller
                    control={control}
                    name="inputs.virtualHost.permissions.configure"
                    render={({ field, fieldState: { error } }) => (
                      <FormControl
                        label="Configure Permissions"
                        tooltipText="A regular expression matching resource names for which the user is granted configure permissions."
                        isError={Boolean(error?.message)}
                        errorText={error?.message}
                      >
                        <Input placeholder=".*" {...field} autoComplete="off" />
                      </FormControl>
                    )}
                  />
                </div>
              </div>

              <div className="flex flex-col">
                <FormLabel
                  isOptional
                  className="mb-2"
                  label="Tags"
                  tooltipText={
                    <div className="space-y-4">
                      <p>Select which tag(s) to assign the users provisioned by Infisical.</p>
                      <p>
                        There is a wide range of in-built roles in RabbitMQ. Some include,
                        management, policymaker, monitoring, administrator. <br />
                        <a
                          href="https://www.rabbitmq.com/docs/management#permissions"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <span className="cursor-pointer text-primary-400">
                            Read more about management tags here
                          </span>
                        </a>
                        .
                      </p>
                      <p>
                        You can also assign custom roles by providing the name of the custom role in
                        the input field.
                      </p>
                    </div>
                  }
                />
                <div className="flex flex-col -space-y-2">
                  {selectedTags.map((_, i) => (
                    <Controller
                      control={control}
                      name={`inputs.tags.${i}`}
                      // eslint-disable-next-line react/no-array-index-key
                      key={`role-${i}`}
                      render={({ field, fieldState: { error } }) => (
                        <FormControl isError={Boolean(error?.message)} errorText={error?.message}>
                          <div className="flex h-9 items-center gap-2">
                            <Input
                              placeholder="Insert tag name, (management, policymaker, etc.)"
                              className="mb-0 flex-grow"
                              {...field}
                            />
                            <IconButton
                              isDisabled={selectedTags.length === 1}
                              ariaLabel="delete key"
                              className="h-9"
                              variant="outline_bg"
                              onClick={() => {
                                if (selectedTags && selectedTags?.length > 1) {
                                  setValue(
                                    "inputs.tags",
                                    selectedTags.filter((__, idx) => idx !== i)
                                  );
                                }
                              }}
                            >
                              <FontAwesomeIcon icon={faTrash} />
                            </IconButton>
                          </div>
                        </FormControl>
                      )}
                    />
                  ))}
                </div>
              </div>
              <div>
                <Button
                  leftIcon={<FontAwesomeIcon icon={faPlus} />}
                  size="xs"
                  className="mb-4"
                  variant="outline_bg"
                  onClick={() => {
                    setValue("inputs.tags", [...selectedTags, ""]);
                  }}
                >
                  Add Tag
                </Button>
              </div>
              <div>
                <Controller
                  control={control}
                  name="inputs.ca"
                  render={({ field, fieldState: { error } }) => (
                    <FormControl
                      isOptional
                      label="CA (SSL)"
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
