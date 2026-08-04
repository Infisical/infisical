/* eslint-disable react/no-array-index-key */
import { Controller, useFormContext, useWatch } from "react-hook-form";
import { PlusIcon, Trash2Icon } from "lucide-react";

import {
  Button,
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  IconButton,
  Input,
  Switch
} from "@app/components/v3";
import { DynamicSecretProviders } from "@app/hooks/api/dynamicSecret/types";

import { DynamicSecretProviderFields } from "../DynamicSecretProviderFields";
import { DynamicSecretProviderGroup } from "../DynamicSecretProviderGroup";
import { DEFAULT_DYNAMIC_SECRET_USERNAME_TEMPLATE } from "../schemas";
import { defineDynamicSecretProvider, TDynamicSecretProviderField } from "../types";
import {
  couchbaseCreateFormSchema,
  couchbaseEditFormSchema,
  getCouchbaseCreateDefaultValues,
  getCouchbaseCreatePayload,
  getCouchbaseEditDefaultValues,
  getCouchbaseEditPayload,
  TCouchbaseValues
} from "./couchbaseContract";

const connectionFields = [
  { name: "inputs.url", type: "text", label: "URL" },
  { name: "inputs.orgId", type: "text", label: "Organization ID", layout: "half" },
  { name: "inputs.projectId", type: "text", label: "Project ID", layout: "half" },
  { name: "inputs.clusterId", type: "text", label: "Cluster ID" },
  { name: "inputs.auth.apiKey", type: "secret", label: "API Key", autoComplete: "new-password" }
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
  { name: "inputs.passwordRequirements.length", type: "number", label: "Password Length" },
  {
    name: "inputs.passwordRequirements.allowedSymbols",
    type: "text",
    label: "Allowed Symbols",
    isOptional: true
  }
] satisfies readonly TDynamicSecretProviderField<TCouchbaseValues>[];

const CouchbaseFields = ({ mode }: { mode: "create" | "edit" }) => {
  const { control, setValue } = useFormContext<TCouchbaseValues>();
  const advanced = useWatch({ control, name: "inputs.useAdvancedBuckets" });
  const buckets = useWatch({ control, name: "inputs.buckets" });
  const metadata = useWatch({ control, name: "metadata" }) ?? [];
  const advancedBuckets = Array.isArray(buckets) ? buckets : [];

  return (
    <>
      <DynamicSecretProviderGroup id="couchbase-connection" presentation="panel">
        <DynamicSecretProviderFields fields={connectionFields} />
        <Controller
          control={control}
          name="inputs.roles"
          render={({ field, fieldState: { error } }) => (
            <Field data-invalid={Boolean(error)}>
              <FieldLabel htmlFor="couchbase-roles">Roles</FieldLabel>
              <Input
                id="couchbase-roles"
                value={field.value.join(", ")}
                onChange={(e) =>
                  field.onChange(
                    e.target.value
                      .split(",")
                      .map((v) => v.trim())
                      .filter(Boolean)
                  )
                }
                isError={Boolean(error)}
              />
              <FieldError>{error?.message}</FieldError>
            </Field>
          )}
        />
        <DynamicSecretProviderFields fields={usernameTemplateField} />
      </DynamicSecretProviderGroup>

      <DynamicSecretProviderGroup id="couchbase-buckets" presentation="panel" surface title="Buckets">
        <Controller
          control={control}
          name="inputs.useAdvancedBuckets"
          render={({ field }) => (
            <Field orientation="horizontal">
              <FieldLabel htmlFor="couchbase-advanced">Advanced Bucket Configuration</FieldLabel>
              <Switch
                id="couchbase-advanced"
                variant="project"
                checked={field.value}
                onCheckedChange={(checked) => {
                  field.onChange(checked);
                  setValue("inputs.buckets", checked ? [{ name: "", scopes: [] }] : "*");
                }}
              />
            </Field>
          )}
        />
        {!advanced ? (
          <Controller
            control={control}
            name="inputs.buckets"
            render={({ field, fieldState: { error } }) => (
              <Field data-invalid={Boolean(error)}>
                <FieldLabel htmlFor="couchbase-buckets">Buckets</FieldLabel>
                <Input
                  id="couchbase-buckets"
                  value={typeof field.value === "string" ? field.value : "*"}
                  onChange={field.onChange}
                  isError={Boolean(error)}
                />
                <FieldError>{error?.message}</FieldError>
              </Field>
            )}
          />
        ) : (
          <div className="flex flex-col gap-3">
            {advancedBuckets.map((bucket, bi) => (
              <div
                key={`${bi}-${bucket.name}`}
                className="grid grid-cols-1 items-start gap-3 sm:grid-cols-[minmax(0,1fr)_auto]"
              >
                <Controller
                  control={control}
                  name={`inputs.buckets.${bi}.name`}
                  render={({ field, fieldState: { error } }) => (
                    <Field data-invalid={Boolean(error)}>
                      <FieldLabel htmlFor={`couchbase-bucket-${bi}-name`}>Bucket Name</FieldLabel>
                      <Input
                        {...field}
                        id={`couchbase-bucket-${bi}-name`}
                        placeholder="Bucket name"
                        isError={Boolean(error)}
                      />
                      <FieldError>{error?.message}</FieldError>
                    </Field>
                  )}
                />
                <div className="flex flex-col gap-2">
                  <FieldLabel className="invisible pointer-events-none select-none" aria-hidden>
                    &nbsp;
                  </FieldLabel>
                  <IconButton
                    type="button"
                    variant="outline"
                    aria-label={`Remove bucket ${bi + 1}`}
                    onClick={() =>
                      setValue(
                        "inputs.buckets",
                        advancedBuckets.filter((_, i) => i !== bi)
                      )
                    }
                  >
                    <Trash2Icon />
                  </IconButton>
                </div>
                {(bucket.scopes ?? []).map((scope, si) => (
                  <div
                    key={`${si}-${scope.name}`}
                    className="col-span-full grid grid-cols-1 items-start gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
                  >
                    <Controller
                      control={control}
                      name={`inputs.buckets.${bi}.scopes.${si}.name`}
                      render={({ field, fieldState: { error } }) => (
                        <Field data-invalid={Boolean(error)}>
                          <FieldLabel htmlFor={`couchbase-bucket-${bi}-scope-${si}-name`}>
                            Scope Name
                          </FieldLabel>
                          <Input
                            {...field}
                            id={`couchbase-bucket-${bi}-scope-${si}-name`}
                            placeholder="Scope name"
                            isError={Boolean(error)}
                          />
                          <FieldError>{error?.message}</FieldError>
                        </Field>
                      )}
                    />
                    <Controller
                      control={control}
                      name={`inputs.buckets.${bi}.scopes.${si}.collections`}
                      render={({ field, fieldState: { error } }) => (
                        <Field data-invalid={Boolean(error)}>
                          <FieldLabel htmlFor={`couchbase-bucket-${bi}-scope-${si}-collections`}>
                            Collections
                          </FieldLabel>
                          <Input
                            id={`couchbase-bucket-${bi}-scope-${si}-collections`}
                            value={(field.value ?? []).join(", ")}
                            onChange={(e) =>
                              field.onChange(
                                e.target.value
                                  .split(",")
                                  .map((v) => v.trim())
                                  .filter(Boolean)
                              )
                            }
                            placeholder="Collections (comma separated)"
                            isError={Boolean(error)}
                          />
                          <FieldError>{error?.message}</FieldError>
                        </Field>
                      )}
                    />
                    <div className="flex flex-col gap-2">
                      <FieldLabel
                        className="invisible pointer-events-none select-none"
                        aria-hidden
                      >
                        &nbsp;
                      </FieldLabel>
                      <IconButton
                        type="button"
                        variant="outline"
                        aria-label={`Remove scope ${si + 1} from bucket ${bi + 1}`}
                        onClick={() => {
                          const next = structuredClone(advancedBuckets);
                          next[bi].scopes = (next[bi].scopes ?? []).filter((_, i) => i !== si);
                          setValue("inputs.buckets", next);
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
                  className="col-span-full self-start"
                  onClick={() => {
                    const next = structuredClone(advancedBuckets);
                    next[bi].scopes = [...(next[bi].scopes ?? []), { name: "", collections: [] }];
                    setValue("inputs.buckets", next);
                  }}
                >
                  <PlusIcon />
                  Add Scope
                </Button>
              </div>
            ))}
            <Button
              type="button"
              size="sm"
              className="self-start"
              onClick={() =>
                setValue("inputs.buckets", [...advancedBuckets, { name: "", scopes: [] }])
              }
            >
              <PlusIcon />
              Add Bucket
            </Button>
          </div>
        )}
      </DynamicSecretProviderGroup>

      <DynamicSecretProviderGroup
        id="couchbase-password"
        presentation="collapse"
        title="Password Configuration (optional)"
      >
        <FieldDescription>Set constraints on the generated database password.</FieldDescription>
        <DynamicSecretProviderFields fields={passwordRequirementFields} />
      </DynamicSecretProviderGroup>

      {mode === "edit" && (
        <DynamicSecretProviderGroup id="couchbase-metadata" presentation="panel" surface title="Metadata">
          <div className="flex flex-col gap-3">
            {metadata.map((_, i) => (
              <div
                key={i}
                className="grid grid-cols-1 items-start gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
              >
                <Controller
                  control={control}
                  name={`metadata.${i}.key`}
                  render={({ field, fieldState: { error } }) => (
                    <Field data-invalid={Boolean(error)}>
                      <FieldLabel htmlFor={`couchbase-metadata-${i}-key`}>Key</FieldLabel>
                      <Input
                        {...field}
                        id={`couchbase-metadata-${i}-key`}
                        placeholder="Key"
                        isError={Boolean(error)}
                      />
                      <FieldError>{error?.message}</FieldError>
                    </Field>
                  )}
                />
                <Controller
                  control={control}
                  name={`metadata.${i}.value`}
                  render={({ field, fieldState: { error } }) => (
                    <Field data-invalid={Boolean(error)}>
                      <FieldLabel htmlFor={`couchbase-metadata-${i}-value`}>Value</FieldLabel>
                      <Input
                        {...field}
                        id={`couchbase-metadata-${i}-value`}
                        placeholder="Value"
                        isError={Boolean(error)}
                      />
                      <FieldError>{error?.message}</FieldError>
                    </Field>
                  )}
                />
                <div className="flex flex-col gap-2">
                  <FieldLabel className="invisible pointer-events-none select-none" aria-hidden>
                    &nbsp;
                  </FieldLabel>
                  <IconButton
                    type="button"
                    variant="outline"
                    aria-label={`Remove metadata ${i + 1}`}
                    onClick={() =>
                      setValue(
                        "metadata",
                        metadata.filter((__, x) => x !== i)
                      )
                    }
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
              onClick={() => setValue("metadata", [...metadata, { key: "", value: "" }])}
            >
              <PlusIcon />
              Add Metadata
            </Button>
          </div>
        </DynamicSecretProviderGroup>
      )}
    </>
  );
};
export const couchbaseDynamicSecretProvider = defineDynamicSecretProvider({
  provider: DynamicSecretProviders.Couchbase,
  label: "Couchbase",
  customRenderer: {
    reasons: ["repeatable-fields", "non-scalar-value"],
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
