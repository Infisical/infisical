import { Controller, useFieldArray, useForm } from "react-hook-form";
import { faPlus, faQuestionCircle, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import ms from "ms";
import { z } from "zod";

import { TtlFormLabel } from "@app/components/features";
import {
  Button,
  FilterableSelect,
  FormControl,
  FormLabel,
  IconButton,
  Input,
  Select,
  SelectItem,
  Switch,
  Tooltip
} from "@app/components/v2";
import { useCreateDynamicSecret } from "@app/hooks/api";
import { DynamicSecretProviders, MILVUS_OBJECT_TYPES } from "@app/hooks/api/dynamicSecret/types";
import { ProjectEnv } from "@app/hooks/api/types";
import { slugSchema } from "@app/lib/schemas";

const formSchema = z.object({
  provider: z.object({
    host: z.string().trim().min(1),
    port: z.coerce.number(),
    username: z.string().trim().min(1),
    password: z.string().trim().min(1),
    database: z.string().trim().min(1).default("default"),
    privileges: z
      .array(
        z.object({
          objectType: z.string().trim().min(1),
          objectName: z.string().trim().min(1).default("*"),
          privilege: z.string().trim().min(1),
          dbName: z
            .string()
            .trim()
            .optional()
            .transform((val) => (val && val.length > 0 ? val : undefined))
        })
      )
      .default([]),
    ca: z.string().optional(),
    sslRejectUnauthorized: z.boolean().default(true)
  }),
  defaultTTL: z.string().superRefine((val, ctx) => {
    const valMs = ms(val);
    if (valMs < 60 * 1000)
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "TTL must be a greater than 1min" });
    if (valMs > ms("10y"))
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "TTL must be less than 10 years" });
  }),
  maxTTL: z
    .string()
    .optional()
    .superRefine((val, ctx) => {
      if (!val) return;
      const valMs = ms(val);
      if (valMs < 60 * 1000)
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "TTL must be a greater than 1min" });
      if (valMs > ms("10y"))
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "TTL must be less than 10 years" });
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
  environments: ProjectEnv[];
  isSingleEnvironmentMode?: boolean;
};

export const MilvusInputForm = ({
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
    handleSubmit
  } = useForm<TForm>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      provider: {
        host: "http://localhost",
        port: 19530,
        username: "root",
        password: "",
        database: "default",
        privileges: [],
        sslRejectUnauthorized: true
      },
      environment: isSingleEnvironmentMode ? environments[0] : undefined,
      usernameTemplate: "{{randomUsername}}"
    }
  });

  const privilegeFields = useFieldArray({
    control,
    name: "provider.privileges"
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
    if (createDynamicSecret.isPending) return;

    const isDefaultUsernameTemplate = usernameTemplate === "{{randomUsername}}";

    await createDynamicSecret.mutateAsync({
      provider: { type: DynamicSecretProviders.Milvus, inputs: provider },
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
  };

  return (
    <div>
      <form onSubmit={handleSubmit(handleCreateDynamicSecret)} autoComplete="off">
        <div>
          <div className="flex items-center space-x-2">
            <div className="grow">
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
            <div className="mt-4 mb-4 border-b border-mineshaft-500 pb-2 pl-1 font-medium text-mineshaft-200">
              Configuration
            </div>
            <div className="flex flex-col">
              <div className="flex items-start space-x-2">
                <Controller
                  control={control}
                  name="provider.host"
                  render={({ field, fieldState: { error } }) => (
                    <FormControl
                      label="Host"
                      className="grow"
                      isError={Boolean(error?.message)}
                      errorText={error?.message}
                      helperText="Optional URL scheme. Defaults to https when a CA is provided, otherwise http."
                    >
                      <Input {...field} placeholder="http://localhost" />
                    </FormControl>
                  )}
                />
                <Controller
                  control={control}
                  name="provider.port"
                  render={({ field, fieldState: { error } }) => (
                    <FormControl
                      label="Port"
                      className="w-32"
                      isError={Boolean(error?.message)}
                      errorText={error?.message}
                    >
                      <Input {...field} type="number" placeholder="19530" />
                    </FormControl>
                  )}
                />
              </div>
              <div className="flex items-center space-x-2">
                <Controller
                  control={control}
                  name="provider.username"
                  render={({ field, fieldState: { error } }) => (
                    <FormControl
                      label="Username"
                      className="grow"
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
                      className="grow"
                      isError={Boolean(error?.message)}
                      errorText={error?.message}
                    >
                      <Input {...field} type="password" autoComplete="new-password" />
                    </FormControl>
                  )}
                />
              </div>
              <Controller
                control={control}
                name="provider.database"
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    label="Default Database"
                    isError={Boolean(error?.message)}
                    errorText={error?.message}
                    helperText="Used as the dbName for granted privileges when not explicitly overridden."
                  >
                    <Input {...field} placeholder="default" />
                  </FormControl>
                )}
              />
              <FormLabel
                label="Privileges"
                isOptional
                className="mb-2"
                tooltipClassName="max-w-md whitespace-pre-line"
                tooltipText={
                  "Privileges granted to an ephemeral role assigned to the lease user. " +
                  "Leave empty to create a user with only the built-in public role. " +
                  "See https://milvus.io/docs/grant_privileges.md for the full list."
                }
              />
              <div className="mb-3 flex flex-col space-y-2">
                {privilegeFields.fields.map(({ id: privilegeFieldId }, i) => (
                  <div key={privilegeFieldId} className="flex items-end space-x-2">
                    <div className="w-36">
                      {i === 0 && <span className="text-xs text-mineshaft-400">Object Type</span>}
                      <Controller
                        control={control}
                        name={`provider.privileges.${i}.objectType`}
                        render={({ field, fieldState: { error } }) => (
                          <FormControl
                            isError={Boolean(error?.message)}
                            errorText={error?.message}
                            className="mb-0"
                          >
                            <Select
                              value={field.value}
                              onValueChange={(value) => field.onChange(value)}
                              className="w-full"
                            >
                              {MILVUS_OBJECT_TYPES.map((option) => (
                                <SelectItem
                                  value={option.value}
                                  key={`milvus-object-type-${option.value}`}
                                >
                                  {option.label}
                                </SelectItem>
                              ))}
                            </Select>
                          </FormControl>
                        )}
                      />
                    </div>
                    <div className="grow">
                      {i === 0 && <span className="text-xs text-mineshaft-400">Object Name</span>}
                      <Controller
                        control={control}
                        name={`provider.privileges.${i}.objectName`}
                        render={({ field, fieldState: { error } }) => (
                          <FormControl
                            isError={Boolean(error?.message)}
                            errorText={error?.message}
                            className="mb-0"
                          >
                            <Input {...field} placeholder="*" />
                          </FormControl>
                        )}
                      />
                    </div>
                    <div className="grow">
                      {i === 0 && <span className="text-xs text-mineshaft-400">Privilege</span>}
                      <Controller
                        control={control}
                        name={`provider.privileges.${i}.privilege`}
                        render={({ field, fieldState: { error } }) => (
                          <FormControl
                            isError={Boolean(error?.message)}
                            errorText={error?.message}
                            className="mb-0"
                          >
                            <Input {...field} placeholder="Search" />
                          </FormControl>
                        )}
                      />
                    </div>
                    <div className="grow">
                      {i === 0 && (
                        <FormLabel
                          label="DB Name"
                          isOptional
                          className="text-xs text-mineshaft-400"
                        />
                      )}
                      <Controller
                        control={control}
                        name={`provider.privileges.${i}.dbName`}
                        render={({ field, fieldState: { error } }) => (
                          <FormControl
                            isError={Boolean(error?.message)}
                            errorText={error?.message}
                            className="mb-0"
                          >
                            <Input
                              value={field.value || ""}
                              onChange={(e) => field.onChange(e.target.value)}
                              placeholder="default"
                            />
                          </FormControl>
                        )}
                      />
                    </div>
                    <IconButton
                      ariaLabel="Remove privilege"
                      className="bottom-0.5 h-9"
                      variant="outline_bg"
                      onClick={() => privilegeFields.remove(i)}
                    >
                      <FontAwesomeIcon icon={faTrash} />
                    </IconButton>
                  </div>
                ))}
                <div>
                  <Button
                    type="button"
                    leftIcon={<FontAwesomeIcon icon={faPlus} />}
                    size="xs"
                    variant="outline_bg"
                    onClick={() =>
                      privilegeFields.append({
                        objectType: "Collection",
                        objectName: "*",
                        privilege: "",
                        dbName: undefined
                      })
                    }
                  >
                    Add Privilege
                  </Button>
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
                      value={field.value || ""}
                      className="border-mineshaft-600 bg-mineshaft-900 text-sm"
                      placeholder="{{randomUsername}}"
                    />
                  </FormControl>
                )}
              />
              <Controller
                control={control}
                name="provider.ca"
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    label="CA Certificate"
                    isOptional
                    isError={Boolean(error?.message)}
                    errorText={error?.message}
                    helperText="PEM-encoded CA certificate for verifying the Milvus server's TLS certificate."
                  >
                    <Input {...field} value={field.value || ""} />
                  </FormControl>
                )}
              />
              <Controller
                control={control}
                name="provider.sslRejectUnauthorized"
                render={({ field: { value, onChange }, fieldState: { error } }) => (
                  <FormControl isError={Boolean(error?.message)} errorText={error?.message}>
                    <Switch
                      className="bg-mineshaft-400/50 shadow-inner data-[state=checked]:bg-green/80"
                      id="milvus-ssl-reject-unauthorized"
                      thumbClassName="bg-mineshaft-800"
                      isChecked={value}
                      onCheckedChange={onChange}
                    >
                      <p className="w-full">
                        SSL Reject Unauthorized
                        <Tooltip
                          className="max-w-md"
                          content={
                            <p>
                              If enabled, the server certificate will be verified against the list
                              of supplied CAs. Disable this option if you are using a self-signed
                              certificate.
                            </p>
                          }
                        >
                          <FontAwesomeIcon icon={faQuestionCircle} size="sm" className="ml-1" />
                        </Tooltip>
                      </p>
                    </Switch>
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
