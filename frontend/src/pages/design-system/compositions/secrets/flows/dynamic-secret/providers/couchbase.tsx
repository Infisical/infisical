/* eslint-disable react/no-array-index-key -- Couchbase bucket collections do not carry stable IDs. */
import type { ReactNode } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";

import {
  couchbaseCreateFormSchema,
  couchbaseEditFormSchema,
  getCouchbaseCreateDefaultValues,
  getCouchbaseCreatePayload,
  getCouchbaseEditDefaultValues,
  getCouchbaseEditPayload,
  type TCouchbaseCreateValues
} from "@app/components/dynamic-secrets/DynamicSecretProviderForm/providerDefinitions/couchbaseContract";
import type { TDynamicSecretProviderField } from "@app/components/dynamic-secrets/DynamicSecretProviderForm/types";
import { Button } from "@app/components/v4/ui/button";
import { Checkbox } from "@app/components/v4/ui/checkbox";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLegend,
  FieldSet
} from "@app/components/v4/ui/field";
import { Input } from "@app/components/v4/ui/input";
import { Inline, Stack } from "@app/components/v4/ui/layout";
import { Switch } from "@app/components/v4/ui/switch";
import { DynamicSecretProviders } from "@app/hooks/api/dynamicSecret/types";

import {
  fieldError,
  MetadataFields,
  ProviderFields,
  ProviderGroup,
  usernameTemplateFieldDefinition
} from "../fields";
import { defineFlowProvider, type DynamicSecretRendererProps } from "../types";

type TCouchbaseValues = TCouchbaseCreateValues;
type TCouchbaseBuckets = Exclude<TCouchbaseValues["inputs"]["buckets"], string>;

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
  usernameTemplateFieldDefinition
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

function RemovableRow({
  label,
  onRemove,
  children
}: {
  label: string;
  onRemove: () => void;
  children: ReactNode;
}) {
  return (
    <Inline gap={8} align="start" wrap={false}>
      <div className="min-w-0 flex-1">{children}</div>
      <Button
        type="button"
        variant="outline"
        size="icon"
        icon="trash"
        iconOnly
        aria-label={label}
        onClick={onRemove}
      />
    </Inline>
  );
}

function CouchbaseRolesField() {
  const { control } = useFormContext<TCouchbaseValues>();

  return (
    <Controller
      control={control}
      name="inputs.roles"
      render={({ field, fieldState: { error } }) => {
        const selectedRoles: string[] = field.value ?? [];

        return (
          <FieldSet>
            <FieldLegend>Roles</FieldLegend>
            <FieldDescription>Select one or more roles to assign to the user.</FieldDescription>
            <Stack gap={12}>
              {COUCHBASE_ROLES.map((role) => (
                <Checkbox
                  key={role.value}
                  label={role.label}
                  description={role.description}
                  checked={selectedRoles.includes(role.value)}
                  aria-invalid={Boolean(error) || undefined}
                  onCheckedChange={(checked) => {
                    field.onChange(
                      checked === true
                        ? [...selectedRoles, role.value]
                        : selectedRoles.filter((value) => value !== role.value)
                    );
                  }}
                />
              ))}
            </Stack>
            {fieldError(error) && <FieldError>{fieldError(error)}</FieldError>}
          </FieldSet>
        );
      }}
    />
  );
}

function CouchbaseBucketFields() {
  const { control, setValue } = useFormContext<TCouchbaseValues>();
  const useAdvancedBuckets = useWatch({ control, name: "inputs.useAdvancedBuckets" });
  const buckets = useWatch({ control, name: "inputs.buckets" });
  const advancedBuckets: TCouchbaseBuckets = Array.isArray(buckets) ? buckets : [];
  const updateBuckets = (mutate: (next: TCouchbaseBuckets) => void) => {
    const nextBuckets = structuredClone(advancedBuckets);
    mutate(nextBuckets);
    setValue("inputs.buckets", nextBuckets, { shouldDirty: true });
  };

  return (
    <ProviderGroup id="couchbase-buckets" presentation="panel" surface title="Buckets">
      <Controller
        control={control}
        name="inputs.useAdvancedBuckets"
        render={({ field }) => (
          <Switch
            ref={field.ref}
            layout="row"
            label="Advanced Bucket Configuration"
            description="Limit access by bucket, scope, and collection instead of using a bucket pattern."
            checked={Boolean(field.value)}
            onBlur={field.onBlur}
            onCheckedChange={(checked) => {
              field.onChange(checked);
              setValue("inputs.buckets", checked ? [] : "*", { shouldDirty: true });
            }}
          />
        )}
      />

      {!useAdvancedBuckets ? (
        <Controller
          control={control}
          name="inputs.buckets"
          render={({ field, fieldState: { error } }) => (
            <Field
              wide
              label="Bucket Access"
              description="Specify comma-separated bucket names, or use * for all buckets, scopes, and collections."
              error={fieldError(error)}
            >
              <Input
                value={typeof field.value === "string" ? field.value : "*"}
                onChange={field.onChange}
                onBlur={field.onBlur}
                invalid={Boolean(error)}
              />
            </Field>
          )}
        />
      ) : (
        <Stack gap={12} align="start">
          {advancedBuckets.map((bucket, bucketIndex) => (
            <div key={bucketIndex} className="w-full border border-[color:var(--v4-line)] p-3">
              <Stack gap={12}>
                <Controller
                  control={control}
                  name={`inputs.buckets.${bucketIndex}.name`}
                  render={({ field, fieldState: { error } }) => (
                    <Field wide label="Bucket Name" error={fieldError(error)}>
                      <RemovableRow
                        label={`Remove bucket ${bucketIndex + 1}`}
                        onRemove={() =>
                          setValue(
                            "inputs.buckets",
                            advancedBuckets.filter((_, index) => index !== bucketIndex),
                            { shouldDirty: true }
                          )
                        }
                      >
                        <Input {...field} placeholder="Bucket name" invalid={Boolean(error)} />
                      </RemovableRow>
                    </Field>
                  )}
                />

                <FieldSet>
                  <FieldLegend variant="label">Scopes</FieldLegend>
                  <FieldDescription>
                    No scopes grants access to every scope in this bucket.
                  </FieldDescription>
                  <Stack gap={12} align="start">
                    {(bucket.scopes ?? []).map((scope, scopeIndex) => (
                      <Stack key={scopeIndex} gap={12} className="w-full">
                        <Controller
                          control={control}
                          name={`inputs.buckets.${bucketIndex}.scopes.${scopeIndex}.name`}
                          render={({ field, fieldState: { error } }) => (
                            <Field wide label="Scope Name" error={fieldError(error)}>
                              <RemovableRow
                                label={`Remove scope ${scopeIndex + 1} from bucket ${bucketIndex + 1}`}
                                onRemove={() =>
                                  updateBuckets((nextBuckets) => {
                                    const currentBucket = nextBuckets[bucketIndex];
                                    currentBucket.scopes = (currentBucket.scopes ?? []).filter(
                                      (_, index) => index !== scopeIndex
                                    );
                                  })
                                }
                              >
                                <Input
                                  {...field}
                                  placeholder="Scope name"
                                  invalid={Boolean(error)}
                                />
                              </RemovableRow>
                            </Field>
                          )}
                        />
                        <FieldSet>
                          <FieldLegend variant="label">Collections (optional)</FieldLegend>
                          <FieldDescription>
                            No collections grants access to every collection in this scope.
                          </FieldDescription>
                          <Stack gap={12} align="start">
                            {(scope.collections ?? []).map((_collection, collectionIndex) => (
                              <Controller
                                key={collectionIndex}
                                control={control}
                                name={`inputs.buckets.${bucketIndex}.scopes.${scopeIndex}.collections.${collectionIndex}`}
                                render={({ field, fieldState: { error } }) => (
                                  <Field wide label="Collection Name" error={fieldError(error)}>
                                    <RemovableRow
                                      label={`Remove collection ${collectionIndex + 1} from scope ${scopeIndex + 1}`}
                                      onRemove={() =>
                                        updateBuckets((nextBuckets) => {
                                          const currentScope =
                                            nextBuckets[bucketIndex].scopes?.[scopeIndex];
                                          if (currentScope) {
                                            currentScope.collections = (
                                              currentScope.collections ?? []
                                            ).filter((_, index) => index !== collectionIndex);
                                          }
                                        })
                                      }
                                    >
                                      <Input
                                        {...field}
                                        placeholder="Collection name"
                                        invalid={Boolean(error)}
                                      />
                                    </RemovableRow>
                                  </Field>
                                )}
                              />
                            ))}
                            <Button
                              variant="outline"
                              type="button"
                              size="sm"
                              icon="plus"
                              onClick={() =>
                                updateBuckets((nextBuckets) => {
                                  const currentScope =
                                    nextBuckets[bucketIndex].scopes?.[scopeIndex];
                                  if (currentScope) {
                                    currentScope.collections = [
                                      ...(currentScope.collections ?? []),
                                      ""
                                    ];
                                  }
                                })
                              }
                            >
                              Add Collection
                            </Button>
                          </Stack>
                        </FieldSet>
                      </Stack>
                    ))}
                    <Button
                      variant="outline"
                      type="button"
                      size="sm"
                      icon="plus"
                      onClick={() =>
                        updateBuckets((nextBuckets) => {
                          const currentBucket = nextBuckets[bucketIndex];
                          currentBucket.scopes = [
                            ...(currentBucket.scopes ?? []),
                            { name: "", collections: [] }
                          ];
                        })
                      }
                    >
                      Add Scope
                    </Button>
                  </Stack>
                </FieldSet>
              </Stack>
            </div>
          ))}
          <Button
            variant="outline"
            type="button"
            size="sm"
            icon="plus"
            onClick={() =>
              setValue("inputs.buckets", [...advancedBuckets, { name: "", scopes: [] }], {
                shouldDirty: true
              })
            }
          >
            Add Bucket
          </Button>
        </Stack>
      )}
    </ProviderGroup>
  );
}

function CouchbasePasswordFields() {
  const { control } = useFormContext<TCouchbaseValues>();
  const length = useWatch({ control, name: "inputs.passwordRequirements.length" });
  const required = useWatch({ control, name: "inputs.passwordRequirements.required" });
  const requiredCount = Object.values(required ?? {}).reduce(
    (total, count) => total + Number(count ?? 0),
    0
  );
  const exceedsLength = typeof length === "number" && requiredCount > length;
  const total = `Total required characters: ${requiredCount}${
    exceedsLength ? ` (exceeds length of ${length})` : ""
  }`;

  return (
    <ProviderGroup
      id="couchbase-password-requirements"
      presentation="collapse"
      title="Password Configuration (optional)"
    >
      <FieldDescription>
        Set constraints on the generated Couchbase user password (8–128 characters). Forbidden
        characters: &lt; &gt; ; . * &amp; | £.
      </FieldDescription>
      <ProviderFields fields={passwordRequirementFields} />
      {exceedsLength ? (
        <FieldError>{total}</FieldError>
      ) : (
        <FieldDescription>{total}</FieldDescription>
      )}
    </ProviderGroup>
  );
}

function CouchbaseFields({ mode }: Pick<DynamicSecretRendererProps, "mode">) {
  return (
    <>
      <ProviderGroup id="couchbase-connection" presentation="panel">
        <ProviderFields fields={couchbaseConnectionFields} />
        <CouchbaseRolesField />
        <ProviderFields fields={usernameTemplateField} />
      </ProviderGroup>
      <CouchbaseBucketFields />
      <CouchbasePasswordFields />
      {mode === "edit" && <MetadataFields id="couchbase-metadata" />}
    </>
  );
}

export const couchbaseFlowProvider = defineFlowProvider({
  provider: DynamicSecretProviders.Couchbase,
  label: "Couchbase",
  schema: couchbaseCreateFormSchema,
  getDefaultValues: getCouchbaseCreateDefaultValues,
  toPayload: getCouchbaseCreatePayload,
  Renderer: CouchbaseFields,
  submitLabel: "Submit",
  edit: {
    schema: couchbaseEditFormSchema,
    getDefaultValues: getCouchbaseEditDefaultValues,
    toPayload: getCouchbaseEditPayload,
    submitLabel: "Save",
    successMessage: "Successfully updated dynamic secret"
  }
});
