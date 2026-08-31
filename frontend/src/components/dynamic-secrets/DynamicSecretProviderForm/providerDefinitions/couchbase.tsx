/* eslint-disable react/no-array-index-key -- Couchbase bucket collections do not carry stable IDs. */
import { Controller, useFieldArray, useFormContext, useWatch } from "react-hook-form";
import { PlusIcon, Trash2Icon } from "lucide-react";

import {
  Button,
  Checkbox,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
  FieldTitle,
  IconButton,
  Input,
  Switch
} from "@app/components/v3";
import { DynamicSecretProviders } from "@app/hooks/api/dynamicSecret/types";

import { DynamicSecretProviderFields } from "../DynamicSecretProviderFields";
import { DynamicSecretProviderGroup } from "../DynamicSecretProviderGroup";
import { DEFAULT_DYNAMIC_SECRET_USERNAME_TEMPLATE } from "../schemas";
import {
  defineDynamicSecretProvider,
  TDynamicSecretProviderField,
  TDynamicSecretProviderRendererProps
} from "../types";
import {
  couchbaseCreateFormSchema,
  couchbaseEditFormSchema,
  getCouchbaseCreateDefaultValues,
  getCouchbaseCreatePayload,
  getCouchbaseEditDefaultValues,
  getCouchbaseEditPayload,
  TCouchbaseCreateValues,
  TCouchbaseEditValues
} from "./couchbaseContract";

type TCouchbaseValues = TCouchbaseCreateValues | TCouchbaseEditValues;

const COUCHBASE_ROLES = [
  { value: "read", label: "Read", description: "Read-only access to bucket data." },
  { value: "write", label: "Write", description: "Full write access to bucket data." }
] as const;

const couchbaseConnectionFields = [
  {
    name: "inputs.url",
    type: "text",
    label: "URL",
    placeholder: "https://cloudapi.cloud.couchbase.com"
  },
  {
    name: "inputs.orgId",
    type: "text",
    label: "Organization ID",
    placeholder: "00000000-0000-0000-0000-000000000000",
    layout: "half"
  },
  {
    name: "inputs.projectId",
    type: "text",
    label: "Project ID",
    placeholder: "00000000-0000-0000-0000-000000000000",
    layout: "half"
  },
  {
    name: "inputs.clusterId",
    type: "text",
    label: "Cluster ID",
    placeholder: "00000000-0000-0000-0000-000000000000"
  },
  {
    name: "inputs.auth.apiKey",
    type: "secret",
    label: "API Key",
    placeholder: "Enter API key",
    autoComplete: "new-password"
  }
] satisfies readonly TDynamicSecretProviderField<TCouchbaseValues>[];

const usernameTemplateField = [
  {
    name: "usernameTemplate",
    type: "text",
    label: "Username Template",
    placeholder: DEFAULT_DYNAMIC_SECRET_USERNAME_TEMPLATE
  }
] satisfies readonly TDynamicSecretProviderField<TCouchbaseValues>[];

const passwordRequirementFields = [
  {
    name: "inputs.passwordRequirements.length",
    type: "number",
    label: "Password Length",
    min: 8,
    max: 128
  },
  {
    name: "inputs.passwordRequirements.required.lowercase",
    type: "number",
    label: "Lowercase Count",
    description: "Minimum lowercase letters (required: at least 1).",
    min: 1,
    layout: "half"
  },
  {
    name: "inputs.passwordRequirements.required.uppercase",
    type: "number",
    label: "Uppercase Count",
    description: "Minimum uppercase letters (required: at least 1).",
    min: 1,
    layout: "half"
  },
  {
    name: "inputs.passwordRequirements.required.digits",
    type: "number",
    label: "Digit Count",
    description: "Minimum digits (required: at least 1).",
    min: 1,
    layout: "half"
  },
  {
    name: "inputs.passwordRequirements.required.symbols",
    type: "number",
    label: "Symbol Count",
    description: "Minimum special characters (required: at least 1).",
    min: 1,
    layout: "half"
  },
  {
    name: "inputs.passwordRequirements.allowedSymbols",
    type: "text",
    label: "Allowed Symbols",
    description: "Cannot contain: < > ; . * & | £.",
    isOptional: true
  }
] satisfies readonly TDynamicSecretProviderField<TCouchbaseValues>[];

const CouchbaseRolesField = () => {
  const { control } = useFormContext<TCouchbaseValues>();

  return (
    <Controller
      control={control}
      name="inputs.roles"
      render={({ field, fieldState: { error } }) => {
        const selectedRoles = field.value ?? [];

        return (
          <FieldSet>
            <FieldLegend>Roles</FieldLegend>
            <FieldDescription>Select one or more roles to assign to the user.</FieldDescription>
            <FieldGroup>
              {COUCHBASE_ROLES.map((role) => {
                const id = `couchbase-role-${role.value}`;
                const isChecked = selectedRoles.includes(role.value);

                return (
                  <Field key={role.value} orientation="horizontal">
                    <Checkbox
                      id={id}
                      variant="project"
                      isChecked={isChecked}
                      isError={Boolean(error)}
                      onCheckedChange={(checked) => {
                        field.onChange(
                          checked === true
                            ? [...selectedRoles, role.value]
                            : selectedRoles.filter((value) => value !== role.value)
                        );
                      }}
                    />
                    <FieldContent>
                      <FieldTitle>
                        <label htmlFor={id}>{role.label}</label>
                      </FieldTitle>
                      <FieldDescription>{role.description}</FieldDescription>
                    </FieldContent>
                  </Field>
                );
              })}
            </FieldGroup>
            {error?.message && <FieldError>{error.message}</FieldError>}
          </FieldSet>
        );
      }}
    />
  );
};

const CouchbaseBucketFields = () => {
  const { control, setValue } = useFormContext<TCouchbaseValues>();
  const useAdvancedBuckets = useWatch({ control, name: "inputs.useAdvancedBuckets" });
  const buckets = useWatch({ control, name: "inputs.buckets" });
  const advancedBuckets = Array.isArray(buckets) ? buckets : [];

  return (
    <DynamicSecretProviderGroup id="couchbase-buckets" presentation="panel" surface title="Buckets">
      <Controller
        control={control}
        name="inputs.useAdvancedBuckets"
        render={({ field }) => (
          <Field orientation="horizontal">
            <FieldContent>
              <FieldTitle>
                <FieldLabel htmlFor="couchbase-advanced-buckets">
                  Advanced Bucket Configuration
                </FieldLabel>
              </FieldTitle>
              <FieldDescription>
                Limit access by bucket, scope, and collection instead of using a bucket pattern.
              </FieldDescription>
            </FieldContent>
            <Switch
              ref={field.ref}
              id="couchbase-advanced-buckets"
              variant="project"
              checked={Boolean(field.value)}
              onBlur={field.onBlur}
              onCheckedChange={(checked) => {
                field.onChange(checked);
                setValue("inputs.buckets", checked ? [] : "*", {
                  shouldDirty: true
                });
              }}
            />
          </Field>
        )}
      />

      {!useAdvancedBuckets ? (
        <Controller
          control={control}
          name="inputs.buckets"
          render={({ field, fieldState: { error } }) => (
            <Field data-invalid={Boolean(error)}>
              <FieldLabel htmlFor="couchbase-bucket-access">Bucket Access</FieldLabel>
              <Input
                id="couchbase-bucket-access"
                value={typeof field.value === "string" ? field.value : "*"}
                onChange={field.onChange}
                onBlur={field.onBlur}
                isError={Boolean(error)}
              />
              <FieldDescription>
                Specify comma-separated bucket names, or use * for all buckets, scopes, and
                collections.
              </FieldDescription>
              {error?.message && <FieldError>{error.message}</FieldError>}
            </Field>
          )}
        />
      ) : (
        <div className="flex flex-col gap-3">
          {advancedBuckets.map((bucket, bucketIndex) => (
            <div
              key={bucketIndex}
              className="rounded-md border border-border bg-container p-3 text-foreground"
            >
              <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                <Controller
                  control={control}
                  name={`inputs.buckets.${bucketIndex}.name`}
                  render={({ field, fieldState: { error } }) => (
                    <Field data-invalid={Boolean(error)}>
                      <FieldLabel htmlFor={`couchbase-bucket-${bucketIndex}-name`}>
                        Bucket Name
                      </FieldLabel>
                      <Input
                        {...field}
                        id={`couchbase-bucket-${bucketIndex}-name`}
                        placeholder="Bucket name"
                        isError={Boolean(error)}
                      />
                      {error?.message && <FieldError>{error.message}</FieldError>}
                    </Field>
                  )}
                />
                <div className="flex flex-col gap-2">
                  <FieldLabel className="pointer-events-none invisible select-none" aria-hidden>
                    &nbsp;
                  </FieldLabel>
                  <IconButton
                    type="button"
                    variant="outline"
                    aria-label={`Remove bucket ${bucketIndex + 1}`}
                    onClick={() =>
                      setValue(
                        "inputs.buckets",
                        advancedBuckets.filter((_, index) => index !== bucketIndex),
                        { shouldDirty: true }
                      )
                    }
                  >
                    <Trash2Icon />
                  </IconButton>
                </div>
              </div>

              <FieldSet className="mt-3">
                <FieldLegend variant="label">Scopes</FieldLegend>
                <FieldDescription>
                  No scopes grants access to every scope in this bucket.
                </FieldDescription>
                <div className="flex flex-col gap-3">
                  {(bucket.scopes ?? []).map((scope, scopeIndex) => (
                    <div
                      key={scopeIndex}
                      className="grid grid-cols-1 items-start gap-3 sm:grid-cols-[minmax(0,1fr)_auto]"
                    >
                      <Controller
                        control={control}
                        name={`inputs.buckets.${bucketIndex}.scopes.${scopeIndex}.name`}
                        render={({ field, fieldState: { error } }) => (
                          <Field data-invalid={Boolean(error)}>
                            <FieldLabel
                              htmlFor={`couchbase-bucket-${bucketIndex}-scope-${scopeIndex}-name`}
                            >
                              Scope Name
                            </FieldLabel>
                            <Input
                              {...field}
                              id={`couchbase-bucket-${bucketIndex}-scope-${scopeIndex}-name`}
                              placeholder="Scope name"
                              isError={Boolean(error)}
                            />
                            {error?.message && <FieldError>{error.message}</FieldError>}
                          </Field>
                        )}
                      />
                      <div className="flex flex-col gap-2">
                        <FieldLabel
                          className="pointer-events-none invisible select-none"
                          aria-hidden
                        >
                          &nbsp;
                        </FieldLabel>
                        <IconButton
                          type="button"
                          variant="outline"
                          aria-label={`Remove scope ${scopeIndex + 1} from bucket ${bucketIndex + 1}`}
                          onClick={() => {
                            const nextBuckets = structuredClone(advancedBuckets);
                            nextBuckets[bucketIndex].scopes = (
                              nextBuckets[bucketIndex].scopes ?? []
                            ).filter((_, index) => index !== scopeIndex);
                            setValue("inputs.buckets", nextBuckets, { shouldDirty: true });
                          }}
                        >
                          <Trash2Icon />
                        </IconButton>
                      </div>
                      <FieldSet className="col-span-full">
                        <FieldLegend variant="label">
                          Collections <span className="font-normal text-muted">(optional)</span>
                        </FieldLegend>
                        <FieldDescription>
                          No collections grants access to every collection in this scope.
                        </FieldDescription>
                        <div className="flex flex-col gap-3">
                          {(scope.collections ?? []).map((_collection, collectionIndex) => (
                            <div
                              key={collectionIndex}
                              className="grid grid-cols-1 items-start gap-3 sm:grid-cols-[minmax(0,1fr)_auto]"
                            >
                              <Controller
                                control={control}
                                name={`inputs.buckets.${bucketIndex}.scopes.${scopeIndex}.collections.${collectionIndex}`}
                                render={({ field, fieldState: { error } }) => (
                                  <Field data-invalid={Boolean(error)}>
                                    <FieldLabel
                                      htmlFor={`couchbase-bucket-${bucketIndex}-scope-${scopeIndex}-collection-${collectionIndex}`}
                                    >
                                      Collection Name
                                    </FieldLabel>
                                    <Input
                                      {...field}
                                      id={`couchbase-bucket-${bucketIndex}-scope-${scopeIndex}-collection-${collectionIndex}`}
                                      placeholder="Collection name"
                                      isError={Boolean(error)}
                                    />
                                    {error?.message && <FieldError>{error.message}</FieldError>}
                                  </Field>
                                )}
                              />
                              <div className="flex flex-col gap-2">
                                <FieldLabel
                                  className="pointer-events-none invisible select-none"
                                  aria-hidden
                                >
                                  &nbsp;
                                </FieldLabel>
                                <IconButton
                                  type="button"
                                  variant="outline"
                                  aria-label={`Remove collection ${collectionIndex + 1} from scope ${scopeIndex + 1}`}
                                  onClick={() => {
                                    const nextBuckets = structuredClone(advancedBuckets);
                                    const currentScope =
                                      nextBuckets[bucketIndex].scopes?.[scopeIndex];
                                    if (currentScope) {
                                      currentScope.collections = (
                                        currentScope.collections ?? []
                                      ).filter((_, index) => index !== collectionIndex);
                                    }
                                    setValue("inputs.buckets", nextBuckets, {
                                      shouldDirty: true
                                    });
                                  }}
                                >
                                  <Trash2Icon />
                                </IconButton>
                              </div>
                            </div>
                          ))}
                          <Button
                            type="button"
                            size="sm"
                            className="self-start"
                            onClick={() => {
                              const nextBuckets = structuredClone(advancedBuckets);
                              const currentScope = nextBuckets[bucketIndex].scopes?.[scopeIndex];
                              if (currentScope) {
                                currentScope.collections = [
                                  ...(currentScope.collections ?? []),
                                  ""
                                ];
                              }
                              setValue("inputs.buckets", nextBuckets, { shouldDirty: true });
                            }}
                          >
                            <PlusIcon />
                            Add Collection
                          </Button>
                        </div>
                      </FieldSet>
                    </div>
                  ))}
                  <Button
                    type="button"
                    size="sm"
                    className="self-start"
                    onClick={() => {
                      const nextBuckets = structuredClone(advancedBuckets);
                      nextBuckets[bucketIndex].scopes = [
                        ...(nextBuckets[bucketIndex].scopes ?? []),
                        { name: "", collections: [] }
                      ];
                      setValue("inputs.buckets", nextBuckets, { shouldDirty: true });
                    }}
                  >
                    <PlusIcon />
                    Add Scope
                  </Button>
                </div>
              </FieldSet>
            </div>
          ))}
          <Button
            type="button"
            size="sm"
            className="self-start"
            onClick={() =>
              setValue("inputs.buckets", [...advancedBuckets, { name: "", scopes: [] }], {
                shouldDirty: true
              })
            }
          >
            <PlusIcon />
            Add Bucket
          </Button>
        </div>
      )}
    </DynamicSecretProviderGroup>
  );
};

const CouchbasePasswordFields = () => {
  const { control } = useFormContext<TCouchbaseValues>();
  const length = useWatch({ control, name: "inputs.passwordRequirements.length" });
  const required = useWatch({ control, name: "inputs.passwordRequirements.required" });
  const requiredCount = Object.values(required ?? {}).reduce(
    (total, count) => total + Number(count ?? 0),
    0
  );
  const exceedsLength = typeof length === "number" && requiredCount > length;

  return (
    <DynamicSecretProviderGroup
      id="couchbase-password-requirements"
      presentation="collapse"
      title="Password Configuration (optional)"
    >
      <FieldDescription>
        Set constraints on the generated Couchbase user password (8–128 characters). Forbidden
        characters: &lt; &gt; ; . * &amp; | £.
      </FieldDescription>
      <DynamicSecretProviderFields fields={passwordRequirementFields} />
      <FieldDescription className={exceedsLength ? "text-danger" : undefined}>
        Total required characters: {requiredCount}
        {exceedsLength ? ` (exceeds length of ${length})` : ""}
      </FieldDescription>
    </DynamicSecretProviderGroup>
  );
};

const CouchbaseMetadataFields = () => {
  const { control } = useFormContext<TCouchbaseEditValues>();
  const metadata = useFieldArray({ control, name: "metadata" });

  return (
    <DynamicSecretProviderGroup
      id="couchbase-metadata"
      presentation="panel"
      surface
      title="Metadata"
    >
      <div className="flex flex-col gap-3">
        {metadata.fields.map(({ id }, index) => (
          <div
            key={id}
            className="grid grid-cols-1 items-start gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
          >
            <Controller
              control={control}
              name={`metadata.${index}.key`}
              render={({ field, fieldState: { error } }) => (
                <Field data-invalid={Boolean(error)}>
                  <FieldLabel htmlFor={`couchbase-metadata-${index}-key`}>Key</FieldLabel>
                  <Input
                    {...field}
                    id={`couchbase-metadata-${index}-key`}
                    placeholder="Key"
                    isError={Boolean(error)}
                  />
                  {error?.message && <FieldError>{error.message}</FieldError>}
                </Field>
              )}
            />
            <Controller
              control={control}
              name={`metadata.${index}.value`}
              render={({ field, fieldState: { error } }) => (
                <Field data-invalid={Boolean(error)}>
                  <FieldLabel htmlFor={`couchbase-metadata-${index}-value`}>Value</FieldLabel>
                  <Input
                    {...field}
                    id={`couchbase-metadata-${index}-value`}
                    placeholder="Value"
                    isError={Boolean(error)}
                  />
                  {error?.message && <FieldError>{error.message}</FieldError>}
                </Field>
              )}
            />
            <div className="flex flex-col gap-2">
              <FieldLabel className="pointer-events-none invisible select-none" aria-hidden>
                &nbsp;
              </FieldLabel>
              <IconButton
                type="button"
                variant="outline"
                aria-label={`Remove metadata ${index + 1}`}
                onClick={() => metadata.remove(index)}
              >
                <Trash2Icon />
              </IconButton>
            </div>
          </div>
        ))}
        <Button
          type="button"
          size="sm"
          className="self-start"
          onClick={() => metadata.append({ key: "", value: "" })}
        >
          <PlusIcon />
          Add Metadata
        </Button>
      </div>
    </DynamicSecretProviderGroup>
  );
};

const CouchbaseFields = ({ mode }: TDynamicSecretProviderRendererProps) => (
  <>
    <DynamicSecretProviderGroup id="couchbase-connection" presentation="panel">
      <DynamicSecretProviderFields fields={couchbaseConnectionFields} />
      <CouchbaseRolesField />
      <DynamicSecretProviderFields fields={usernameTemplateField} />
    </DynamicSecretProviderGroup>
    <CouchbaseBucketFields />
    <CouchbasePasswordFields />
    {mode === "edit" && <CouchbaseMetadataFields />}
  </>
);

export const couchbaseDynamicSecretProvider = defineDynamicSecretProvider({
  provider: DynamicSecretProviders.Couchbase,
  label: "Couchbase",
  customRenderer: {
    reasons: ["conditional-fields", "repeatable-fields", "non-scalar-value"],
    Component: CouchbaseFields
  },
  create: {
    schema: couchbaseCreateFormSchema,
    getDefaultValues: getCouchbaseCreateDefaultValues,
    toPayload: getCouchbaseCreatePayload,
    submitLabel: "Submit"
  },
  edit: {
    schema: couchbaseEditFormSchema,
    getDefaultValues: getCouchbaseEditDefaultValues,
    toPayload: getCouchbaseEditPayload,
    submitLabel: "Save",
    successMessage: "Successfully updated dynamic secret"
  }
});
