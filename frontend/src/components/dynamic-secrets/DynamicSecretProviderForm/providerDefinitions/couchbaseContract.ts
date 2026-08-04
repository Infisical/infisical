import { z } from "zod";

import {
  DynamicSecretProviders,
  TUpdateDynamicSecretDTO
} from "@app/hooks/api/dynamicSecret/types";

import {
  createDynamicSecretProviderFormSchema,
  DEFAULT_DYNAMIC_SECRET_USERNAME_TEMPLATE,
  editDynamicSecretProviderFormSchema,
  normalizeDynamicSecretUsernameTemplateForCreate,
  normalizeDynamicSecretUsernameTemplateForEdit
} from "../schemas";
import type {
  TCreateDynamicSecretProviderFormContext,
  TDynamicSecretProviderFormValues,
  TEditDynamicSecretProviderFormContext
} from "../types";

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
      .refine(
        (d) => Object.values(d).reduce((a, b) => a + b, 0) <= 128,
        "Sum of required characters cannot exceed 128"
      ),
    allowedSymbols: z
      .string()
      .refine(
        (s) => !["<", ">", ";", ".", "*", "&", "|", "£"].some((c) => s?.includes(c)),
        "Cannot contain: < > ; . * & | £"
      )
      .optional()
  })
  .refine(
    (d) => Object.values(d.required).reduce((a, b) => a + b, 0) <= d.length,
    "Sum of required characters cannot exceed the total length"
  );
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
export const couchbaseInputsSchema = z.object({
  url: z.string().url().trim().min(1),
  orgId: z.string().trim().min(1),
  projectId: z.string().trim().min(1),
  clusterId: z.string().trim().min(1),
  roles: z.array(z.string()).min(1, "At least one role must be selected"),
  buckets: z.union([z.string().trim().min(1), z.array(bucketSchema)]),
  useAdvancedBuckets: z.boolean().default(false),
  passwordRequirements: passwordRequirementsSchema.optional(),
  auth: z.object({ apiKey: z.string().trim().min(1) })
});
export type TCouchbaseValues = TDynamicSecretProviderFormValues<
  z.infer<typeof couchbaseInputsSchema>
> & { metadata?: { key: string; value: string }[] };
export const couchbaseCreateFormSchema = createDynamicSecretProviderFormSchema(
  couchbaseInputsSchema
) as z.ZodType<TCouchbaseValues>;
export const couchbaseEditFormSchema = editDynamicSecretProviderFormSchema(couchbaseInputsSchema, {
  usernameTemplateSchema: z.string().trim().nullable().optional()
}).extend({
  metadata: z.array(z.object({ key: z.string(), value: z.string() })).optional()
}) as z.ZodType<TCouchbaseValues>;
export const getCouchbaseCreateDefaultValues = (
  c: TCreateDynamicSecretProviderFormContext
): TCouchbaseValues => ({
  name: "",
  defaultTTL: "1h",
  maxTTL: "24h",
  environment: c.isSingleEnvironmentMode ? c.environments[0] : undefined,
  usernameTemplate: DEFAULT_DYNAMIC_SECRET_USERNAME_TEMPLATE,
  inputs: {
    url: "https://cloudapi.cloud.couchbase.com",
    orgId: "",
    projectId: "",
    clusterId: "",
    roles: ["read"],
    buckets: "*",
    useAdvancedBuckets: false,
    passwordRequirements: {
      length: 12,
      required: { lowercase: 1, uppercase: 1, digits: 1, symbols: 1 },
      allowedSymbols: "!@#$%^()_+-=[]{}:,?/~`"
    },
    auth: { apiKey: "" }
  }
});
export const getCouchbaseEditDefaultValues = (
  c: TEditDynamicSecretProviderFormContext
): TCouchbaseValues => {
  const i = c.dynamicSecret.inputs as Omit<TCouchbaseValues["inputs"], "useAdvancedBuckets">;
  return {
    name: c.dynamicSecret.name,
    defaultTTL: c.dynamicSecret.defaultTTL,
    maxTTL: c.dynamicSecret.maxTTL || undefined,
    metadata: c.dynamicSecret.metadata,
    usernameTemplate: c.dynamicSecret.usernameTemplate || DEFAULT_DYNAMIC_SECRET_USERNAME_TEMPLATE,
    inputs: { ...i, useAdvancedBuckets: Array.isArray(i.buckets) }
  };
};
const providerInputs = (v: TCouchbaseValues) => {
  const { useAdvancedBuckets, ...inputs } = couchbaseInputsSchema.parse(v.inputs);
  return { ...inputs, buckets: useAdvancedBuckets ? inputs.buckets : (inputs.buckets as string) };
};
export const getCouchbaseCreatePayload = (
  v: TCouchbaseValues,
  c: TCreateDynamicSecretProviderFormContext
) => ({
  provider: { type: DynamicSecretProviders.Couchbase as const, inputs: providerInputs(v) },
  maxTTL: v.maxTTL ?? undefined,
  name: v.name,
  path: c.secretPath,
  defaultTTL: v.defaultTTL,
  projectSlug: c.projectSlug,
  environmentSlug: v.environment?.slug ?? "",
  usernameTemplate: normalizeDynamicSecretUsernameTemplateForCreate(v.usernameTemplate)
});
export const getCouchbaseEditPayload = (
  v: TCouchbaseValues,
  c: TEditDynamicSecretProviderFormContext
): TUpdateDynamicSecretDTO => ({
  name: c.dynamicSecret.name,
  path: c.secretPath,
  projectSlug: c.projectSlug,
  environmentSlug: c.environment,
  data: {
    maxTTL: v.maxTTL || undefined,
    defaultTTL: v.defaultTTL,
    inputs: providerInputs(v),
    metadata: v.metadata,
    newName: v.name === c.dynamicSecret.name ? undefined : v.name,
    usernameTemplate: normalizeDynamicSecretUsernameTemplateForEdit(v.usernameTemplate)
  }
});
