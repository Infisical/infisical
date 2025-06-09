import { Controller, useFieldArray, useForm } from "react-hook-form";
import { faPlus, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import ms from "ms";
import { z } from "zod";

import { TtlFormLabel } from "@app/components/features";
import { createNotification } from "@app/components/notifications";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Button,
  FilterableSelect,
  FormControl,
  FormLabel,
  IconButton,
  Input,
  Select,
  SelectItem
} from "@app/components/v2";
import { useCreateDynamicSecret } from "@app/hooks/api";
import { DynamicSecretProviders } from "@app/hooks/api/dynamicSecret/types";
import { WorkspaceEnv } from "@app/hooks/api/types";
import { slugSchema } from "@app/lib/schemas";

const formSchema = z.object({
  provider: z.object({
    adminPublicKey: z.string().trim().min(1),
    adminPrivateKey: z.string().trim().min(1),
    groupId: z.string().trim().min(1),
    roles: z
      .object({
        collectionName: z.string().optional(),
        databaseName: z.string().min(1),
        roleName: z.string().min(1)
      })
      .array()
      .min(1),
    scopes: z
      .object({
        name: z.string().min(1),
        type: z.string().min(1)
      })
      .array()
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

const ATLAS_SCOPE_TYPES = [
  {
    label: "Cluster",
    value: "CLUSTER"
  },
  {
    label: "Data Lake",
    value: "DATA_LAKE"
  },
  {
    label: "Stream",
    value: "STREAM"
  }
];

export const MongoAtlasInputForm = ({
  onCompleted,
  onCancel,
  environments,
  secretPath,
  projectSlug,
  isSingleEnvironmentMode
}: Props) => {
  const {
    control,
    getValues,
    setValue,
    formState: { isSubmitting },
    handleSubmit
  } = useForm<TForm>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      provider: {
        roles: [{ databaseName: "", roleName: "" }]
      },
      environment: isSingleEnvironmentMode ? environments[0] : undefined,
      usernameTemplate: "{{randomUsername}}"
    }
  });

  const roleFields = useFieldArray({
    control,
    name: "provider.roles"
  });

  const scopeFields = useFieldArray({
    control,
    name: "provider.scopes"
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
        provider: { type: DynamicSecretProviders.MongoAtlas, inputs: provider },
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
                  name="provider.adminPublicKey"
                  defaultValue=""
                  render={({ field, fieldState: { error } }) => (
                    <FormControl
                      label="Admin Public Key"
                      className="flex-grow"
                      isError={Boolean(error?.message)}
                      errorText={error?.message}
                    >
                      <Input {...field} placeholder="" />
                    </FormControl>
                  )}
                />
                <Controller
                  control={control}
                  name="provider.adminPrivateKey"
                  defaultValue=""
                  render={({ field, fieldState: { error } }) => (
                    <FormControl
                      label="Admin Private Key"
                      className="flex-grow"
                      isError={Boolean(error?.message)}
                      errorText={error?.message}
                    >
                      <Input {...field} type="password" />
                    </FormControl>
                  )}
                />
              </div>
              <Controller
                control={control}
                name="provider.groupId"
                defaultValue=""
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    label="Group/Project ID"
                    isError={Boolean(error?.message)}
                    errorText={error?.message}
                    helperText="Unique 24-hexadecimal digit string that identifies your project"
                  >
                    <Input {...field} />
                  </FormControl>
                )}
              />
              <FormLabel label="Roles" />
              <div className="mb-3 flex flex-col space-y-2">
                {roleFields.fields.map(({ id: roleFieldId }, i) => (
                  <div key={roleFieldId} className="flex items-end space-x-2">
                    <div className="flex-grow">
                      {i === 0 && <span className="text-xs text-mineshaft-400">Database Name</span>}
                      <Controller
                        control={control}
                        name={`provider.roles.${i}.databaseName`}
                        render={({ field, fieldState: { error } }) => (
                          <FormControl
                            isError={Boolean(error?.message)}
                            errorText={error?.message}
                            className="mb-0"
                          >
                            <Input {...field} />
                          </FormControl>
                        )}
                      />
                    </div>
                    <div className="flex-grow">
                      {i === 0 && (
                        <FormLabel
                          label="Collection Name"
                          className="text-xs text-mineshaft-400"
                          isOptional
                        />
                      )}
                      <Controller
                        control={control}
                        name={`provider.roles.${i}.collectionName`}
                        render={({ field, fieldState: { error } }) => (
                          <FormControl
                            isError={Boolean(error?.message)}
                            errorText={error?.message}
                            className="mb-0"
                          >
                            <Input {...field} />
                          </FormControl>
                        )}
                      />
                    </div>
                    <div className="flex-grow">
                      {i === 0 && (
                        <FormLabel
                          label="Role"
                          className="text-xs text-mineshaft-400"
                          tooltipClassName="max-w-md whitespace-pre-line"
                          tooltipText={`Human-readable label that identifies a group of privileges assigned to a database user. This value can either be a built-in role or a custom role.
														Built-in: atlasAdmin, backup, clusterMonitor, dbAdmin, dbAdminAnyDatabase, enableSharding, read, readAnyDatabase, readWrite, readWriteAnyDatabase.`}
                        />
                      )}
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
                          setValue("provider.roles", [{ databaseName: "", roleName: "" }]);
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
                    onClick={() => roleFields.append({ databaseName: "", roleName: "" })}
                  >
                    Add Role
                  </Button>
                </div>
              </div>
              <Accordion type="single" collapsible className="mb-2 w-full bg-mineshaft-700">
                <AccordionItem value="advance-section">
                  <AccordionTrigger>Advanced</AccordionTrigger>
                  <AccordionContent>
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
                    <FormLabel
                      label="Scopes"
                      isOptional
                      className="mb-2"
                      tooltipClassName="max-w-md whitespace-pre-line"
                      tooltipText="List that contains clusters, MongoDB Atlas Data Lakes, and MongoDB Atlas Streams Instances that this database user can access. If omitted, MongoDB Cloud grants the database user access to all the clusters, MongoDB Atlas Data Lakes, and MongoDB Atlas Streams Instances in the project."
                    />
                    <div className="mb-2 flex flex-col space-y-2">
                      {scopeFields.fields.map(({ id: scopeFieldId }, i) => (
                        <div key={scopeFieldId} className="flex items-end space-x-2">
                          <div className="flex-grow">
                            {i === 0 && (
                              <FormLabel
                                label="Label"
                                className="text-xs text-mineshaft-400"
                                tooltipClassName="max-w-md whitespace-pre-line"
                                tooltipText="Human-readable label that identifies the cluster or MongoDB Atlas Data Lake that this database user can access."
                              />
                            )}
                            <Controller
                              control={control}
                              name={`provider.scopes.${i}.name`}
                              render={({ field, fieldState: { error } }) => (
                                <FormControl
                                  isError={Boolean(error?.message)}
                                  errorText={error?.message}
                                  className="mb-0 flex-grow"
                                >
                                  <Input {...field} placeholder="Cluster or data lake id" />
                                </FormControl>
                              )}
                            />
                          </div>
                          <div className="flex-grow">
                            {i === 0 && <span className="text-xs text-mineshaft-400">Type</span>}
                            <Controller
                              control={control}
                              name={`provider.scopes.${i}.type`}
                              render={({ field, fieldState: { error } }) => (
                                <FormControl
                                  isError={Boolean(error?.message)}
                                  errorText={error?.message}
                                  className="mb-0 flex-grow"
                                >
                                  <Select
                                    defaultValue={field.value}
                                    {...field}
                                    onValueChange={(e) => field.onChange(e)}
                                    className="w-full"
                                  >
                                    {ATLAS_SCOPE_TYPES.map((el) => (
                                      <SelectItem value={el.value} key={`atlas-scope-${el.value}`}>
                                        {el.label}
                                      </SelectItem>
                                    ))}
                                  </Select>
                                </FormControl>
                              )}
                            />
                          </div>
                          <IconButton
                            ariaLabel="delete key"
                            className="bottom-0.5 h-9"
                            variant="outline_bg"
                            onClick={() => {
                              scopeFields.remove(i);
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
                          onClick={() =>
                            scopeFields.append({ name: "", type: ATLAS_SCOPE_TYPES[0].value })
                          }
                        >
                          Add Scope
                        </Button>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
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
