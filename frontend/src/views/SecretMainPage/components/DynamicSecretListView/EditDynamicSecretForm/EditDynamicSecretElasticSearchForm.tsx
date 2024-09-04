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
import { useUpdateDynamicSecret } from "@app/hooks/api";
import { TDynamicSecret } from "@app/hooks/api/dynamicSecret/types";

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
  inputs: z.object({
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
  newName: z
    .string()
    .refine((val) => val.toLowerCase() === val, "Must be lowercase")
    .optional()
});
type TForm = z.infer<typeof formSchema>;

type Props = {
  onClose: () => void;
  dynamicSecret: TDynamicSecret & { inputs: unknown };
  secretPath: string;
  environment: string;
  projectSlug: string;
};

export const EditDynamicSecretElasticSearchForm = ({
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
      inputs: {
        ...(dynamicSecret.inputs as TForm["inputs"])
      }
    }
  });

  const updateDynamicSecret = useUpdateDynamicSecret();

  const handleUpdateDynamicSecret = async ({ inputs, maxTTL, defaultTTL, newName }: TForm) => {
    // wait till previous request is finished
    if (updateDynamicSecret.isLoading) return;
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
          newName: newName === dynamicSecret.name ? undefined : newName
        }
      });
      onClose();
      createNotification({
        type: "success",
        text: "Successfully updated dynamic secret"
      });
    } catch (err) {
      createNotification({
        type: "error",
        text: "Failed to update dynamic secret"
      });
    }
  };

  const selectedAuthType = watch("inputs.auth.type");
  const selectedRoles = watch("inputs.roles");

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
                      <Input {...field} />
                    </FormControl>
                  )}
                />
                <Controller
                  control={control}
                  name="inputs.port"
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
                  name="inputs.auth.type"
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
                            "inputs.auth.username",
                            "inputs.auth.password",
                            "inputs.auth.apiKey",
                            "inputs.auth.apiKeyId"
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
                    selectedAuthType === "user" ? "inputs.auth.username" : "inputs.auth.apiKeyId"
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
                  name={selectedAuthType === "user" ? "inputs.auth.password" : "inputs.auth.apiKey"}
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

              <div className="relative mb-3 flex flex-col">
                <FormLabel
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
                {selectedRoles.map((_, i) => (
                  <Controller
                    control={control}
                    name={`inputs.roles.${i}`}
                    // eslint-disable-next-line react/no-array-index-key
                    key={`role-${i}`}
                    render={({ field, fieldState: { error } }) => (
                      <div className="flex items-center gap-2">
                        <div className="flex-grow">
                          <FormControl isError={Boolean(error?.message)} errorText={error?.message}>
                            <Input
                              placeholder="Insert role name, (superuser, kibana_admin, custom_role)"
                              className="mb-0 flex-grow"
                              {...field}
                            />
                          </FormControl>
                        </div>

                        <IconButton
                          isDisabled={selectedRoles.length === 1}
                          ariaLabel="delete key"
                          className="bottom-2 h-9"
                          variant="outline_bg"
                          onClick={() => {
                            if (selectedRoles && selectedRoles?.length > 1) {
                              setValue(
                                "inputs.roles",
                                selectedRoles.filter((__, idx) => idx !== i)
                              );
                            }
                          }}
                        >
                          <FontAwesomeIcon icon={faTrash} />
                        </IconButton>
                      </div>
                    )}
                  />
                ))}

                <div>
                  <Button
                    leftIcon={<FontAwesomeIcon icon={faPlus} />}
                    size="xs"
                    className="bottom-2"
                    variant="outline_bg"
                    onClick={() => {
                      setValue("inputs.roles", [...selectedRoles, ""]);
                    }}
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
          <Button variant="outline_bg" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
};
