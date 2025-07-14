import { Controller, useForm } from "react-hook-form";
import { faCheckCircle, faWarning } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import ms from "ms";
import { z } from "zod";

import { TtlFormLabel } from "@app/components/features";
import { createNotification } from "@app/components/notifications";
import { Button, FilterableSelect, FormControl, Input } from "@app/components/v2";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@app/components/v2/Dropdown/Dropdown";
import { Tooltip } from "@app/components/v2/Tooltip";
import { useCreateDynamicSecret } from "@app/hooks/api";
import { useGetDynamicSecretProviderData } from "@app/hooks/api/dynamicSecret/queries";
import { DynamicSecretProviders } from "@app/hooks/api/dynamicSecret/types";
import { WorkspaceEnv } from "@app/hooks/api/types";

const formSchema = z.object({
  selectedUsers: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      email: z.string().min(1)
    })
  ),
  provider: z.object({
    tenantId: z.string().min(1),
    applicationId: z.string().min(1),
    clientSecret: z.string().min(1)
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
  name: z
    .string()
    .min(1)
    .refine((val) => val.toLowerCase() === val, "Must be lowercase"),
  environment: z.object({ name: z.string(), slug: z.string() })
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

export const AzureEntraIdInputForm = ({
  onCompleted,
  onCancel,
  environments,
  secretPath,
  projectSlug,
  isSingleEnvironmentMode
}: Props) => {
  const {
    control,
    formState: { isSubmitting },
    watch,
    handleSubmit
  } = useForm<TForm>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      environment: isSingleEnvironmentMode ? environments[0] : undefined
    }
  });
  const tenantId = watch("provider.tenantId");
  const applicationId = watch("provider.applicationId");
  const clientSecret = watch("provider.clientSecret");

  const configurationComplete = !!(tenantId && applicationId && clientSecret);
  const { data, isLoading, isError, isFetching } = useGetDynamicSecretProviderData({
    tenantId,
    applicationId,
    clientSecret,
    enabled: !!configurationComplete
  });
  const loading = configurationComplete && isFetching;
  const errored = configurationComplete && !isFetching && isError;
  const createDynamicSecret = useCreateDynamicSecret();

  const handleCreateDynamicSecret = async ({
    name,
    selectedUsers,
    provider,
    maxTTL,
    defaultTTL,
    environment
  }: TForm) => {
    // wait till previous request is finished
    if (createDynamicSecret.isPending) return;
    try {
      selectedUsers.map(async (user: { id: string; name: string; email: string }) => {
        await createDynamicSecret.mutateAsync({
          provider: {
            type: DynamicSecretProviders.AzureEntraId,
            inputs: {
              userId: user.id,
              tenantId: provider.tenantId,
              email: user.email,
              applicationId: provider.applicationId,
              clientSecret: provider.clientSecret
            }
          },
          maxTTL,
          name: `${name}-${user.name}`,
          path: secretPath,
          defaultTTL,
          projectSlug,
          environmentSlug: environment.slug
        });
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
                    label="Secret Prefix"
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
              <div className="flex-grow">
                <Controller
                  control={control}
                  defaultValue=""
                  name="provider.tenantId"
                  render={({ field, fieldState: { error } }) => (
                    <FormControl
                      label="Tenant Id"
                      isError={Boolean(error)}
                      errorText={error?.message}
                    >
                      <Input
                        {...field}
                        placeholder="Tenant Id from Azure Entra ID App installation"
                      />
                    </FormControl>
                  )}
                />
              </div>
            </div>
            <div className="flex flex-col">
              <div className="flex-grow">
                <Controller
                  control={control}
                  defaultValue=""
                  name="provider.applicationId"
                  render={({ field, fieldState: { error } }) => (
                    <FormControl
                      label="Application Id"
                      isError={Boolean(error)}
                      errorText={error?.message}
                    >
                      <Input
                        {...field}
                        placeholder="Application ID from Azure Entra ID App installation"
                      />
                    </FormControl>
                  )}
                />
              </div>
            </div>
            <div className="flex flex-col">
              <div className="flex-grow">
                <Controller
                  control={control}
                  defaultValue=""
                  name="provider.clientSecret"
                  render={({ field, fieldState: { error } }) => (
                    <FormControl
                      label="Client Secret"
                      isError={Boolean(error)}
                      errorText={error?.message}
                    >
                      <Input
                        {...field}
                        placeholder="Client Secret from Azure Entra ID App installation"
                      />
                    </FormControl>
                  )}
                />
              </div>
            </div>
          </div>
          <div>
            <div className="mb-4 mt-4 border-b border-mineshaft-500 pb-2 pl-1 font-medium text-mineshaft-200">
              Select Users
            </div>
            <div className="mb-4 flex items-center text-sm font-normal text-mineshaft-400">
              &nbsp; We create a unique dynamic secret for each user in Entra Id.
            </div>
            <div className="flex flex-col">
              <div className="flex items-center space-x-4">
                <Controller
                  control={control}
                  name="selectedUsers"
                  render={({ field: { value, onChange }, fieldState: { error } }) => (
                    <FormControl isRequired isError={Boolean(error)} errorText={error?.message}>
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          className="w-72"
                          disabled={loading || errored || !configurationComplete}
                        >
                          <Tooltip
                            hidden={!loading && !errored && configurationComplete}
                            content={
                              <div>
                                {(() => {
                                  let icon;
                                  if (errored) {
                                    icon = <FontAwesomeIcon icon={faWarning} color="red" />;
                                  } else if (loading || !configurationComplete) {
                                    icon = <FontAwesomeIcon icon={faWarning} color="yellow" />;
                                  } else {
                                    icon = null;
                                  }
                                  return icon;
                                })()}
                                <span className="ml-4 cursor-default text-mineshaft-300 hover:text-mineshaft-200">
                                  {(() => {
                                    let message;
                                    if (loading) {
                                      message = "Loading, please wait...";
                                    } else if (errored) {
                                      message = "Check the configuration";
                                    } else if (!configurationComplete) {
                                      message = "Configuration incomplete";
                                    } else {
                                      message = ""; // or you can leave it undefined
                                    }
                                    return message;
                                  })()}
                                </span>
                              </div>
                            }
                          >
                            <div>
                              <Input
                                isReadOnly
                                value={value?.length ? `${value.length} selected` : ""}
                                className={`text-left ${loading || errored || !configurationComplete ? "cursor-not-allowed" : ""}`}
                                placeholder="Select users"
                              />
                            </div>
                          </Tooltip>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          align="start"
                          style={{ width: "var(--radix-dropdown-menu-trigger-width)" }}
                        >
                          {data &&
                            data.map((user) => {
                              const ids = value?.map((selectedUser) => selectedUser.id);
                              const isChecked = ids?.includes(user.id);
                              return (
                                <DropdownMenuItem
                                  onClick={(evt) => {
                                    evt.preventDefault();
                                    onChange(
                                      isChecked
                                        ? value?.filter((el) => el.id !== user.id)
                                        : [...(value || []), user]
                                    );
                                  }}
                                  key={`create-policy-members-${user.id}`}
                                  iconPos="right"
                                  icon={isChecked && <FontAwesomeIcon icon={faCheckCircle} />}
                                >
                                  {user.name} <br /> {`(${user.email})`}
                                </DropdownMenuItem>
                              );
                            })}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </FormControl>
                  )}
                />
              </div>
            </div>
          </div>
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
        <div className="mt-4 flex items-center space-x-4">
          <Button type="submit" isLoading={isSubmitting} isDisabled={isLoading || isError}>
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
