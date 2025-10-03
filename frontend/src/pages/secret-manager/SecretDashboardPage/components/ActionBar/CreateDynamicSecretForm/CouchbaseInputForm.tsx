/* eslint-disable jsx-a11y/label-has-associated-control */
import { Controller, useForm } from "react-hook-form";
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
  IconButton,
  Input,
  SecretInput,
  Switch,
  Tooltip
} from "@app/components/v2";
import { useCreateDynamicSecret } from "@app/hooks/api";
import { DynamicSecretProviders } from "@app/hooks/api/dynamicSecret/types";
import { ProjectEnv } from "@app/hooks/api/types";
import { slugSchema } from "@app/lib/schemas";

// Component for managing scopes and collections within a bucket
const BucketScopesConfiguration = ({
  control,
  bucketIndex,
  bucketsValue,
  setValue,
  addScope,
  removeScope,
  addCollection,
  removeCollection
}: {
  control: any;
  bucketIndex: number;
  bucketsValue: any;
  setValue: any;
  addScope: (bucketIndex: number) => void;
  removeScope: (bucketIndex: number, scopeIndex: number) => void;
  addCollection: (bucketIndex: number, scopeIndex: number) => void;
  removeCollection: (bucketIndex: number, scopeIndex: number, collectionIndex: number) => void;
}) => {
  const bucket = Array.isArray(bucketsValue) ? bucketsValue[bucketIndex] : null;
  const scopeFields = bucket?.scopes || [];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-mineshaft-300">Scopes</label>
        <Button
          type="button"
          variant="outline_bg"
          size="xs"
          onClick={() => addScope(bucketIndex)}
          leftIcon={<FontAwesomeIcon icon={faPlus} />}
        >
          Add Scope
        </Button>
      </div>

      {scopeFields.map((_scope: any, scopeIndex: number) => (
        <div
          key={`scope-${scopeIndex + 1}`}
          className="space-y-3 rounded border border-mineshaft-600 bg-mineshaft-700 p-3"
        >
          <div className="flex items-center justify-between">
            <h5 className="text-xs font-medium text-mineshaft-200">Scope {scopeIndex + 1}</h5>
            <IconButton
              type="button"
              variant="plain"
              ariaLabel="Remove scope"
              size="sm"
              onClick={() => removeScope(bucketIndex, scopeIndex)}
            >
              <FontAwesomeIcon icon={faTrash} className="text-red-400" />
            </IconButton>
          </div>

          <Controller
            control={control}
            name={`provider.buckets.${bucketIndex}.scopes.${scopeIndex}.name`}
            render={({ field, fieldState: { error } }) => (
              <FormControl label="Scope Name" isError={Boolean(error)} errorText={error?.message}>
                <Input {...field} placeholder="e.g., inventory, _default" className="text-sm" />
              </FormControl>
            )}
          />

          <div className="space-y-2 pl-4">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-mineshaft-300">Collections</label>
              <Button
                type="button"
                variant="outline_bg"
                size="xs"
                onClick={() => addCollection(bucketIndex, scopeIndex)}
                leftIcon={<FontAwesomeIcon icon={faPlus} />}
              >
                Add Collection
              </Button>
            </div>

            {scopeFields[scopeIndex]?.collections?.map(
              (collection: string, collectionIndex: number) => (
                <div
                  // eslint-disable-next-line react/no-array-index-key
                  key={`collection-${bucketIndex}-${scopeIndex}-${collectionIndex}`}
                  className="flex items-center space-x-2"
                >
                  <FormControl className="flex-1">
                    <Input
                      value={collection || ""}
                      onChange={(e) => {
                        const currentBuckets = Array.isArray(bucketsValue) ? [...bucketsValue] : [];
                        if (currentBuckets[bucketIndex]?.scopes?.[scopeIndex]?.collections) {
                          currentBuckets[bucketIndex].scopes[scopeIndex].collections[
                            collectionIndex
                          ] = e.target.value;
                          setValue("provider.buckets", currentBuckets);
                        }
                      }}
                      placeholder="e.g., airport, airline"
                      className="text-sm"
                    />
                  </FormControl>
                  <IconButton
                    type="button"
                    variant="plain"
                    ariaLabel="Remove collection"
                    className="mb-4"
                    size="sm"
                    onClick={() => removeCollection(bucketIndex, scopeIndex, collectionIndex)}
                  >
                    <FontAwesomeIcon icon={faTrash} className="text-red-400" />
                  </IconButton>
                </div>
              )
            )}

            {(!scopeFields[scopeIndex]?.collections ||
              scopeFields[scopeIndex].collections.length === 0) && (
              <div className="text-xs italic text-mineshaft-400">
                No collections specified (access to all collections in scope)
              </div>
            )}
          </div>
        </div>
      ))}

      {scopeFields.length === 0 && (
        <div className="rounded border border-dashed border-mineshaft-600 bg-mineshaft-700 p-4 text-center">
          <p className="mb-2 text-xs text-mineshaft-400">
            No scopes configured (access to all scopes in bucket)
          </p>
          <Button
            type="button"
            variant="outline_bg"
            size="xs"
            onClick={() => addScope(bucketIndex)}
            leftIcon={<FontAwesomeIcon icon={faPlus} />}
          >
            Add Scope
          </Button>
        </div>
      )}
    </div>
  );
};

const couchbaseRoles = [
  { value: "read", label: "Read", description: "Read-only access to bucket data" },
  {
    value: "write",
    label: "Write",
    description: "Full write access to bucket data"
  }
];

const passwordRequirementsSchema = z
  .object({
    length: z.number().min(8, "Password must be at least 8 characters").max(128),
    required: z
      .object({
        lowercase: z.number().min(1, "At least 1 lowercase character required"),
        uppercase: z.number().min(1, "At least 1 uppercase character required"),
        digits: z.number().min(1, "At least 1 digit required"),
        symbols: z.number().min(1, "At least 1 special character required")
      })
      .refine((data) => {
        const total = Object.values(data).reduce((sum, count) => sum + count, 0);
        return total <= 128;
      }, "Sum of required characters cannot exceed 128"),
    allowedSymbols: z
      .string()
      .refine((symbols) => {
        const forbiddenChars = ["<", ">", ";", ".", "*", "&", "|", "£"];
        return !forbiddenChars.some((char) => symbols?.includes(char));
      }, "Cannot contain: < > ; . * & | £")
      .optional()
  })
  .refine((data) => {
    const total = Object.values(data.required).reduce((sum, count) => sum + count, 0);
    return total <= data.length;
  }, "Sum of required characters cannot exceed the total length");

const bucketSchema = z.object({
  name: z.string().trim().min(1, "Bucket name is required"),
  scopes: z
    .array(
      z.object({
        name: z.string().trim().min(1, "Scope name is required"),
        collections: z.array(z.string().trim().min(1)).optional()
      })
    )
    .optional()
});

const formSchema = z.object({
  provider: z.object({
    url: z.string().url().trim().min(1),
    orgId: z.string().trim().min(1),
    projectId: z.string().trim().min(1),
    clusterId: z.string().trim().min(1),
    roles: z.array(z.string()).min(1, "At least one role must be selected"),
    buckets: z.union([z.string().trim().min(1), z.array(bucketSchema)]),
    useAdvancedBuckets: z.boolean().default(false),
    passwordRequirements: passwordRequirementsSchema.optional(),
    auth: z.object({
      apiKey: z.string().trim().min(1)
    })
  }),
  defaultTTL: z.string().superRefine((val, ctx) => {
    const valMs = ms(val);
    if (valMs < 60 * 1000)
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "TTL must be a greater than 1min" });
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
  environments: ProjectEnv[];
  isSingleEnvironmentMode?: boolean;
};

export const CouchbaseInputForm = ({
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
    handleSubmit,
    setValue,
    getValues,
    watch
  } = useForm<TForm>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      provider: {
        url: "https://cloudapi.cloud.couchbase.com",
        roles: ["read"],
        buckets: "*",
        useAdvancedBuckets: false,
        passwordRequirements: {
          length: 12,
          required: {
            lowercase: 1,
            uppercase: 1,
            digits: 1,
            symbols: 1
          },
          allowedSymbols: "!@#$%^()_+-=[]{}:,?/~`"
        },
        auth: {
          apiKey: ""
        }
      },
      environment: isSingleEnvironmentMode ? environments[0] : undefined,
      usernameTemplate: "{{randomUsername}}"
    }
  });

  const createDynamicSecret = useCreateDynamicSecret();

  const isAdvancedMode = watch("provider.useAdvancedBuckets");
  const bucketsValue = watch("provider.buckets");

  const addBucket = () => {
    const currentBuckets = Array.isArray(bucketsValue) ? bucketsValue : [];
    setValue("provider.buckets", [...currentBuckets, { name: "", scopes: [] }]);
  };

  const removeBucket = (index: number) => {
    const currentBuckets = Array.isArray(bucketsValue) ? bucketsValue : [];
    const newBuckets = currentBuckets.filter((_, i) => i !== index);
    setValue("provider.buckets", newBuckets);
  };

  const addScope = (bucketIndex: number) => {
    const currentBuckets = Array.isArray(bucketsValue) ? [...bucketsValue] : [];
    if (currentBuckets[bucketIndex]) {
      const currentScopes = currentBuckets[bucketIndex].scopes || [];
      currentBuckets[bucketIndex] = {
        ...currentBuckets[bucketIndex],
        scopes: [...currentScopes, { name: "", collections: [] }]
      };
      setValue("provider.buckets", currentBuckets);
    }
  };

  const removeScope = (bucketIndex: number, scopeIndex: number) => {
    const currentBuckets = Array.isArray(bucketsValue) ? [...bucketsValue] : [];
    if (currentBuckets[bucketIndex]?.scopes) {
      currentBuckets[bucketIndex].scopes = currentBuckets[bucketIndex].scopes.filter(
        (_, i) => i !== scopeIndex
      );
      setValue("provider.buckets", currentBuckets);
    }
  };

  const addCollection = (bucketIndex: number, scopeIndex: number) => {
    const currentBuckets = Array.isArray(bucketsValue) ? [...bucketsValue] : [];
    if (currentBuckets[bucketIndex]?.scopes?.[scopeIndex]) {
      const currentCollections = currentBuckets[bucketIndex].scopes[scopeIndex].collections || [];
      currentBuckets[bucketIndex].scopes[scopeIndex].collections = [...currentCollections, ""];
      setValue("provider.buckets", currentBuckets);
    }
  };

  const removeCollection = (bucketIndex: number, scopeIndex: number, collectionIndex: number) => {
    const currentBuckets = Array.isArray(bucketsValue) ? [...bucketsValue] : [];
    if (currentBuckets[bucketIndex]?.scopes?.[scopeIndex]?.collections) {
      currentBuckets[bucketIndex].scopes[scopeIndex].collections = currentBuckets[
        bucketIndex
      ].scopes[scopeIndex].collections.filter((_, i) => i !== collectionIndex);
      setValue("provider.buckets", currentBuckets);
    }
  };

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

    const transformedProvider = {
      ...provider,
      buckets: provider.useAdvancedBuckets ? provider.buckets : (provider.buckets as string)
    };

    const { useAdvancedBuckets, ...finalProvider } = transformedProvider;

    try {
      await createDynamicSecret.mutateAsync({
        provider: { type: DynamicSecretProviders.Couchbase, inputs: finalProvider },
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
                  name="provider.url"
                  defaultValue="https://cloudapi.cloud.couchbase.com"
                  render={({ field, fieldState: { error } }) => (
                    <FormControl
                      label="URL"
                      className="w-full"
                      isError={Boolean(error?.message)}
                      errorText={error?.message}
                    >
                      <Input placeholder="https://cloudapi.cloud.couchbase.com" {...field} />
                    </FormControl>
                  )}
                />
              </div>
              <div className="flex flex-col space-y-4">
                <Controller
                  control={control}
                  name="provider.orgId"
                  defaultValue=""
                  render={({ field, fieldState: { error } }) => (
                    <FormControl
                      label="Organization ID"
                      className="w-full"
                      isError={Boolean(error?.message)}
                      errorText={error?.message}
                    >
                      <Input {...field} />
                    </FormControl>
                  )}
                />
                <div className="flex items-center space-x-2">
                  <Controller
                    control={control}
                    name="provider.projectId"
                    defaultValue=""
                    render={({ field, fieldState: { error } }) => (
                      <FormControl
                        label="Project ID"
                        className="w-full"
                        isError={Boolean(error?.message)}
                        errorText={error?.message}
                      >
                        <Input {...field} />
                      </FormControl>
                    )}
                  />
                  <Controller
                    control={control}
                    name="provider.clusterId"
                    defaultValue=""
                    render={({ field, fieldState: { error } }) => (
                      <FormControl
                        label="Cluster ID"
                        className="w-full"
                        isError={Boolean(error?.message)}
                        errorText={error?.message}
                      >
                        <Input {...field} />
                      </FormControl>
                    )}
                  />
                </div>
                <Controller
                  control={control}
                  name="provider.roles"
                  defaultValue={["read"]}
                  render={({ field: { value, onChange }, fieldState: { error } }) => (
                    <FormControl
                      label="Roles"
                      className="w-full"
                      isError={Boolean(error?.message)}
                      errorText={error?.message}
                      helperText="Select one or more roles to assign to the user"
                    >
                      <FilterableSelect
                        isMulti
                        value={couchbaseRoles.filter((role) => value?.includes(role.value))}
                        onChange={(selectedRoles) => {
                          if (Array.isArray(selectedRoles)) {
                            onChange(selectedRoles.map((role: any) => role.value));
                          } else {
                            onChange([]);
                          }
                        }}
                        options={couchbaseRoles}
                        placeholder="Select roles..."
                        getOptionLabel={(option) => option.label}
                        getOptionValue={(option) => option.value}
                      />
                    </FormControl>
                  )}
                />

                <Controller
                  control={control}
                  name="provider.useAdvancedBuckets"
                  render={({ field: { value, onChange } }) => (
                    <FormControl
                      label="Advanced Bucket Configuration"
                      helperText="Enable to configure specific buckets, scopes and collections. When disabled, '*' grants access to all buckets, scopes, and collections."
                    >
                      <Switch
                        id="advanced-buckets-switch"
                        isChecked={value}
                        onCheckedChange={(checked) => {
                          onChange(checked);
                          const bucketsController = getValues("provider.buckets");
                          if (checked && typeof bucketsController === "string") {
                            setValue("provider.buckets", []);
                          } else if (!checked && Array.isArray(bucketsController)) {
                            setValue("provider.buckets", "*");
                          }
                        }}
                      />
                    </FormControl>
                  )}
                />

                {!watch("provider.useAdvancedBuckets") && (
                  <Controller
                    control={control}
                    name="provider.buckets"
                    defaultValue="*"
                    render={({ field, fieldState: { error } }) => (
                      <FormControl
                        label="Bucket Access"
                        className="w-full"
                        isError={Boolean(error?.message)}
                        errorText={error?.message}
                        helperText="Specify bucket names separated by commas (e.g., 'bucket1,bucket2') or use '*' for all buckets, scopes, and collections"
                      >
                        <Input
                          {...field}
                          value={typeof field.value === "string" ? field.value : "*"}
                          onChange={(e) => field.onChange(e.target.value)}
                          placeholder="* (all buckets, scopes & collections) or bucket1,bucket2,bucket3"
                        />
                      </FormControl>
                    )}
                  />
                )}

                {isAdvancedMode && Array.isArray(bucketsValue) && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-medium text-mineshaft-200">
                          Advanced Bucket Configuration
                        </div>
                        <div className="text-sm text-mineshaft-400">
                          Configure specific buckets with their scopes and collections. Leave scopes
                          empty for access to all scopes in a bucket.
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="outline_bg"
                        size="sm"
                        onClick={addBucket}
                        leftIcon={<FontAwesomeIcon icon={faPlus} />}
                      >
                        Add Bucket
                      </Button>
                    </div>

                    <div className="space-y-4">
                      {Array.isArray(bucketsValue) &&
                        (bucketsValue as any[]).map((_, bucketIndex) => (
                          <div
                            key={`bucket-${bucketIndex + 1}`}
                            className="space-y-4 rounded border border-mineshaft-600 bg-mineshaft-800 p-4"
                          >
                            <div className="flex items-center justify-between">
                              <h4 className="text-sm font-medium text-mineshaft-200">
                                Bucket {bucketIndex + 1}
                              </h4>
                              <IconButton
                                type="button"
                                variant="plain"
                                ariaLabel="Remove bucket"
                                onClick={() => removeBucket(bucketIndex)}
                              >
                                <FontAwesomeIcon icon={faTrash} className="text-red-400" />
                              </IconButton>
                            </div>

                            <Controller
                              control={control}
                              name={`provider.buckets.${bucketIndex}.name`}
                              render={({ field, fieldState: { error } }) => (
                                <FormControl
                                  label="Bucket Name"
                                  isError={Boolean(error)}
                                  errorText={error?.message}
                                >
                                  <Input {...field} placeholder="e.g., travel-sample" />
                                </FormControl>
                              )}
                            />

                            <BucketScopesConfiguration
                              control={control}
                              bucketIndex={bucketIndex}
                              bucketsValue={bucketsValue}
                              setValue={setValue}
                              addScope={addScope}
                              removeScope={removeScope}
                              addCollection={addCollection}
                              removeCollection={removeCollection}
                            />
                          </div>
                        ))}

                      {(!Array.isArray(bucketsValue) || bucketsValue.length === 0) && (
                        <div className="rounded border border-dashed border-mineshaft-600 p-8 text-center">
                          <p className="mb-2 text-sm text-mineshaft-400">No buckets configured</p>
                          <Button
                            type="button"
                            variant="outline_bg"
                            size="sm"
                            onClick={addBucket}
                            leftIcon={<FontAwesomeIcon icon={faPlus} />}
                          >
                            Add First Bucket
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                <Controller
                  name="provider.auth.apiKey"
                  control={control}
                  render={({ field: { value, onChange }, fieldState: { error } }) => (
                    <FormControl
                      errorText={error?.message}
                      isError={Boolean(error?.message)}
                      className="w-full"
                      label="API Key"
                    >
                      <SecretInput
                        containerClassName="text-gray-400 group-focus-within:!border-primary-400/50 border border-mineshaft-500 bg-mineshaft-900 px-2.5 py-1.5"
                        value={value}
                        valueAlwaysHidden
                        rows={1}
                        wrap="hard"
                        onChange={(e) => onChange(e.target.value)}
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
              <Accordion type="multiple" className="mb-2 mt-4 w-full bg-mineshaft-700">
                <AccordionItem value="password-config">
                  <AccordionTrigger>
                    <div className="flex items-center space-x-2">
                      <span>Password Configuration (optional)</span>
                      <Tooltip content="Couchbase password requirements: minimum 8 characters, at least 1 uppercase, 1 lowercase, 1 digit, 1 special character. Cannot contain: < > ; . * & | £">
                        <div className="flex h-4 w-4 cursor-help items-center justify-center rounded-full bg-mineshaft-600 text-xs text-mineshaft-300">
                          ?
                        </div>
                      </Tooltip>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="mb-4 text-sm text-mineshaft-300">
                      Set constraints on the generated Couchbase user password (8-128 characters)
                      <br />
                      <span className="text-xs text-mineshaft-400">
                        Forbidden characters: &lt; &gt; ; . * &amp; | £
                      </span>
                    </div>
                    <div className="space-y-4">
                      <div>
                        <Controller
                          control={control}
                          name="provider.passwordRequirements.length"
                          defaultValue={12}
                          render={({ field, fieldState: { error } }) => (
                            <FormControl
                              label="Password Length"
                              isError={Boolean(error)}
                              errorText={error?.message}
                            >
                              <Input
                                type="number"
                                min={8}
                                max={128}
                                {...field}
                                onChange={(e) => field.onChange(Number(e.target.value))}
                              />
                            </FormControl>
                          )}
                        />
                      </div>

                      <div className="space-y-2">
                        <h4 className="text-sm font-medium">Minimum Required Character Counts</h4>
                        <div className="text-sm text-gray-500">
                          {(() => {
                            const total = Object.values(
                              watch("provider.passwordRequirements.required") || {}
                            ).reduce((sum, count) => sum + Number(count || 0), 0);
                            const length = watch("provider.passwordRequirements.length") || 0;
                            const isError = total > length;
                            return (
                              <span className={isError ? "text-red-500" : ""}>
                                Total required characters: {total}{" "}
                                {isError ? `(exceeds length of ${length})` : ""}
                              </span>
                            );
                          })()}
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <Controller
                            control={control}
                            name="provider.passwordRequirements.required.lowercase"
                            defaultValue={1}
                            render={({ field, fieldState: { error } }) => (
                              <FormControl
                                label="Lowercase Count"
                                isError={Boolean(error)}
                                errorText={error?.message}
                                helperText="Min lowercase letters (required: ≥1)"
                              >
                                <Input
                                  type="number"
                                  min={1}
                                  {...field}
                                  onChange={(e) => field.onChange(Number(e.target.value))}
                                />
                              </FormControl>
                            )}
                          />
                          <Controller
                            control={control}
                            name="provider.passwordRequirements.required.uppercase"
                            defaultValue={1}
                            render={({ field, fieldState: { error } }) => (
                              <FormControl
                                label="Uppercase Count"
                                isError={Boolean(error)}
                                errorText={error?.message}
                                helperText="Min uppercase letters (required: ≥1)"
                              >
                                <Input
                                  type="number"
                                  min={1}
                                  {...field}
                                  onChange={(e) => field.onChange(Number(e.target.value))}
                                />
                              </FormControl>
                            )}
                          />
                          <Controller
                            control={control}
                            name="provider.passwordRequirements.required.digits"
                            defaultValue={1}
                            render={({ field, fieldState: { error } }) => (
                              <FormControl
                                label="Digit Count"
                                isError={Boolean(error)}
                                errorText={error?.message}
                                helperText="Min digits (required: ≥1)"
                              >
                                <Input
                                  type="number"
                                  min={1}
                                  {...field}
                                  onChange={(e) => field.onChange(Number(e.target.value))}
                                />
                              </FormControl>
                            )}
                          />
                          <Controller
                            control={control}
                            name="provider.passwordRequirements.required.symbols"
                            defaultValue={1}
                            render={({ field, fieldState: { error } }) => (
                              <FormControl
                                label="Symbol Count"
                                isError={Boolean(error)}
                                errorText={error?.message}
                                helperText="Min special characters (required: ≥1)"
                              >
                                <Input
                                  type="number"
                                  min={1}
                                  {...field}
                                  onChange={(e) => field.onChange(Number(e.target.value))}
                                />
                              </FormControl>
                            )}
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <h4 className="text-sm font-medium">Allowed Symbols</h4>
                        <Controller
                          control={control}
                          name="provider.passwordRequirements.allowedSymbols"
                          defaultValue="!@#$%^()_+-=[]{}:,?/~`"
                          render={({ field, fieldState: { error } }) => (
                            <FormControl
                              label="Allowed Symbols"
                              isError={Boolean(error)}
                              errorText={error?.message}
                              helperText="Cannot contain: < > ; . * & | £"
                            >
                              <Input {...field} placeholder="!@#$%^()_+-=[]{}:,?/~`" />
                            </FormControl>
                          )}
                        />
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
