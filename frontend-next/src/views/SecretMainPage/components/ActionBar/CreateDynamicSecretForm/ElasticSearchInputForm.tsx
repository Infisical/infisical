import { Controller, useForm } from "react-hook-form";
import Link from "next/link";
import { faPlus, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import ms from "ms";
import { z } from "zod";

import { TtlFormLabel } from "@app/components/features";
import { createNotification } from "@app/components/notifications";
import {
  Button,
  FormControl,
  FormLabel,
  IconButton,
  Input,
  SecretInput,
  Select,
  SelectItem
} from "@app/components/v2";
import { useCreateDynamicSecret } from "@app/hooks/api";
import { DynamicSecretProviders } from "@app/hooks/api/dynamicSecret/types";

const authMethods = [
  {
    label: "Username/Password",
    value: "user"
  },
  {
    label: "API Key",
    value: "api-key"
  }
] as const;

const formSchema = z.object({
  provider: z.object({
    host: z.string().trim().min(1),
    port: z.coerce.number(),

    // two auth types "user, apikey"
    auth: z.discriminatedUnion("type", [
      z.object({
        type: z.literal("user"),
        username: z.string().trim(),
        password: z.string().trim()
      }),
      z.object({
        type: z.literal("api-key"),
        apiKey: z.string().trim(),
        apiKeyId: z.string().trim()
      })
    ]),

    roles: z.array(z.string().trim().min(1)).min(1, "At least one role is required"),
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
  name: z.string().refine((val) => val.toLowerCase() === val, "Must be lowercase")
});
type TForm = z.infer<typeof formSchema>;

type Props = {
  onCompleted: () => void;
  onCancel: () => void;
  secretPath: string;
  projectSlug: string;
  environment: string;
};

export const ElasticSearchInputForm = ({
  onCompleted,
  onCancel,
  environment,
  secretPath,
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
    defaultValues: {
      provider: {
        auth: {
          type: "user"
        },
        roles: ["superuser"],
        port: 443
      }
    }
  });

  const createDynamicSecret = useCreateDynamicSecret();

  const handleCreateDynamicSecret = async ({ name, maxTTL, provider, defaultTTL }: TForm) => {
    // wait till previous request is finished
    if (createDynamicSecret.isLoading) return;
    try {
      await createDynamicSecret.mutateAsync({
        provider: { type: DynamicSecretProviders.ElasticSearch, inputs: provider },
        maxTTL,
        name,
        path: secretPath,
        defaultTTL,
        projectSlug,
        environmentSlug: environment
      });
      onCompleted();
    } catch (err) {
      createNotification({
        type: "error",
        text: "Failed to create dynamic secret"
      });
    }
  };

  const selectedAuthType = watch("provider.auth.type");
  const selectedRoles = watch("provider.roles");

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
                      <Input
                        placeholder="https://fgy543ws2w35dfh7jdaafa12ha.aws-us-east-1.io"
                        {...field}
                      />
                    </FormControl>
                  )}
                />
                <Controller
                  control={control}
                  name="provider.port"
                  defaultValue={443}
                  render={({ field, fieldState: { error } }) => (
                    <FormControl
                      label="Port"
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
                  name="provider.auth.type"
                  render={({ field, fieldState: { error } }) => (
                    <FormControl
                      label="Authentication Method"
                      isError={Boolean(error?.message)}
                      errorText={error?.message}
                      className="w-full"
                    >
                      <Select
                        defaultValue={field.value}
                        {...field}
                        className="w-full"
                        onValueChange={(e) => {
                          const authFields = [
                            "provider.auth.username",
                            "provider.auth.password",
                            "provider.auth.apiKey",
                            "provider.auth.apiKeyId"
                          ] as const;

                          authFields.forEach((f) => {
                            setValue(f, "");
                          });

                          field.onChange(e);
                        }}
                      >
                        {authMethods.map((authType) => (
                          <SelectItem value={authType.value} key={`auth-method-${authType.value}`}>
                            {authType.label}
                          </SelectItem>
                        ))}
                      </Select>
                    </FormControl>
                  )}
                />
                <Controller
                  control={control}
                  name={
                    selectedAuthType === "user"
                      ? "provider.auth.username"
                      : "provider.auth.apiKeyId"
                  }
                  defaultValue=""
                  render={({ field, fieldState: { error } }) => (
                    <FormControl
                      label={selectedAuthType === "user" ? "Username" : "API Key ID"}
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
                  name={
                    selectedAuthType === "user" ? "provider.auth.password" : "provider.auth.apiKey"
                  }
                  render={({ field, fieldState: { error } }) => (
                    <FormControl
                      label={selectedAuthType === "user" ? "Password" : "API Key"}
                      className="w-full"
                      isError={Boolean(error?.message)}
                      errorText={error?.message}
                    >
                      <Input {...field} type="password" autoComplete="new-password" />
                    </FormControl>
                  )}
                />
              </div>

              <div className="mb-3 flex flex-col">
                <FormLabel
                  className="mb-2"
                  label="Roles"
                  tooltipText={
                    <div className="space-y-4">
                      <p>Select which role(s) to assign the users provisioned by Infisical.</p>
                      <p>
                        There is a wide range of in-built roles in Elastic Search. Some include,
                        superuser, apm_user, kibana_admin, monitoring_user, and many more. You can{" "}
                        <Link
                          passHref
                          href="https://www.elastic.co/guide/en/elasticsearch/reference/current/built-in-roles.html"
                        >
                          <a target="_blank" rel="noopener noreferrer">
                            <span className="cursor-pointer text-primary-400">
                              read more about roles here
                            </span>
                          </a>
                        </Link>
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
                  {selectedRoles.map((_, i) => (
                    <Controller
                      control={control}
                      name={`provider.roles.${i}`}
                      // eslint-disable-next-line react/no-array-index-key
                      key={`role-${i}`}
                      render={({ field, fieldState: { error } }) => (
                        <FormControl isError={Boolean(error?.message)} errorText={error?.message}>
                          <div className="flex h-9 items-center gap-2">
                            <Input
                              placeholder="Insert role name, (superuser, kibana_admin, custom_role)"
                              className="mb-0 flex-grow"
                              {...field}
                            />
                            <IconButton
                              isDisabled={selectedRoles.length === 1}
                              ariaLabel="delete key"
                              className="h-9"
                              variant="outline_bg"
                              onClick={() => {
                                if (selectedRoles && selectedRoles?.length > 1) {
                                  setValue(
                                    "provider.roles",
                                    selectedRoles.filter((__, idx) => idx !== i)
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
                  className="mb-3"
                  variant="outline_bg"
                  onClick={() => {
                    setValue("provider.roles", [...selectedRoles, ""]);
                  }}
                >
                  Add Role
                </Button>
              </div>
              <div>
                <Controller
                  control={control}
                  name="provider.ca"
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
