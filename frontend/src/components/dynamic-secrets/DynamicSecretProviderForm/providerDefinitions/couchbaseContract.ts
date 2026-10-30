import { z } from "zod";

import {
  DynamicSecretProviders,
  TUpdateDynamicSecretDTO
} from "@app/hooks/api/dynamicSecret/types";

import {
  createDynamicSecretProviderFormSchema,
  DEFAULT_DYNAMIC_SECRET_USERNAME_TEMPLATE,
  editDynamicSecretProviderFormSchema,
  normalizeDynamicSecretUsernameTemplateForCreate
} from "../schemas";
import {
  TCreateDynamicSecretProviderDTO,
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
        (required) => Object.values(required).reduce((total, count) => total + count, 0) <= 128,
        "Sum of required characters cannot exceed 128"
      ),
    allowedSymbols: z
      .string()
      .refine(
        (symbols) =>
          !["<", ">", ";", ".", "*", "&", "|", "£"].some((character) =>
            symbols?.includes(character)
          ),
        "Cannot contain: < > ; . * & | £"
      )
      .optional()
  })
  .refine(
    ({ length, required }) =>
      Object.values(required).reduce((total, count) => total + count, 0) <= length,
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

const couchbaseInputFields = {
  url: z.string().url().trim().min(1),
  orgId: z.string().trim().min(1),
  projectId: z.string().trim().min(1),
  clusterId: z.string().trim().min(1),
  roles: z.array(z.string()).min(1, "At least one role must be selected"),
  buckets: z.union([z.string().trim().min(1), z.array(bucketSchema)]),
  useAdvancedBuckets: z.boolean().default(false),
  passwordRequirements: passwordRequirementsSchema.optional(),
  auth: z.object({ apiKey: z.string().trim().min(1) })
};

export const couchbaseCreateInputsSchema = z.object(couchbaseInputFields);
export const couchbaseEditInputsSchema = z.object(couchbaseInputFields).partial();

const couchbaseMetadataSchema = z
  .object({
    key: z.string().trim().min(1),
    value: z.string().trim().default("")
  })
  .array()
  .optional();

export type TCouchbaseCreateValues = TDynamicSecretProviderFormValues<
  z.infer<typeof couchbaseCreateInputsSchema>
>;
export type TCouchbaseEditValues = TDynamicSecretProviderFormValues<
  z.infer<typeof couchbaseEditInputsSchema>
> & {
  metadata?: { key: string; value: string }[];
};

export const couchbaseCreateFormSchema = createDynamicSecretProviderFormSchema(
  couchbaseCreateInputsSchema
) as z.ZodType<TCouchbaseCreateValues>;

export const couchbaseEditFormSchema = editDynamicSecretProviderFormSchema(
  couchbaseEditInputsSchema,
  { usernameTemplateSchema: z.string().trim().nullable().optional() }
).extend({ metadata: couchbaseMetadataSchema }) as z.ZodType<TCouchbaseEditValues>;

export const getCouchbaseCreateDefaultValues = (
  context: TCreateDynamicSecretProviderFormContext
): TCouchbaseCreateValues => ({
  name: "",
  defaultTTL: "1h",
  maxTTL: "24h",
  environment: context.isSingleEnvironmentMode ? context.environments[0] : undefined,
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
  context: TEditDynamicSecretProviderFormContext
): TCouchbaseEditValues => {
  const inputs = context.dynamicSecret.inputs as Omit<
    TCouchbaseCreateValues["inputs"],
    "useAdvancedBuckets"
  >;

  return {
    name: context.dynamicSecret.name,
    defaultTTL: context.dynamicSecret.defaultTTL,
    maxTTL: context.dynamicSecret.maxTTL || undefined,
    metadata: context.dynamicSecret.metadata,
    usernameTemplate: context.dynamicSecret.usernameTemplate,
    inputs: {
      ...inputs,
      useAdvancedBuckets: Array.isArray(inputs.buckets)
    }
  };
};

const getCouchbaseCreateProviderInputs = (values: TCouchbaseCreateValues) => {
  const { useAdvancedBuckets, ...inputs } = couchbaseCreateInputsSchema.parse(values.inputs);

  return {
    ...inputs,
    buckets: useAdvancedBuckets ? inputs.buckets : (inputs.buckets as string)
  };
};

const getCouchbaseEditProviderInputs = (values: TCouchbaseEditValues) => {
  const { useAdvancedBuckets, ...inputs } = couchbaseEditInputsSchema.parse(values.inputs);

  return {
    ...inputs,
    ...(inputs.buckets === undefined
      ? {}
      : { buckets: useAdvancedBuckets ? inputs.buckets : (inputs.buckets as string) })
  };
};

const normalizeCouchbaseUsernameTemplateForEdit = (usernameTemplate?: string | null) =>
  !usernameTemplate || usernameTemplate === DEFAULT_DYNAMIC_SECRET_USERNAME_TEMPLATE
    ? undefined
    : usernameTemplate;

export const getCouchbaseCreatePayload = (
  values: TCouchbaseCreateValues,
  context: TCreateDynamicSecretProviderFormContext
): TCreateDynamicSecretProviderDTO<DynamicSecretProviders.Couchbase> => ({
  provider: {
    type: DynamicSecretProviders.Couchbase,
    inputs: getCouchbaseCreateProviderInputs(values)
  },
  maxTTL: values.maxTTL ?? undefined,
  name: values.name,
  path: context.secretPath,
  defaultTTL: values.defaultTTL,
  projectSlug: context.projectSlug,
  environmentSlug: values.environment?.slug ?? "",
  usernameTemplate: normalizeDynamicSecretUsernameTemplateForCreate(values.usernameTemplate)
});

export const getCouchbaseEditPayload = (
  values: TCouchbaseEditValues,
  context: TEditDynamicSecretProviderFormContext
): TUpdateDynamicSecretDTO => ({
  name: context.dynamicSecret.name,
  path: context.secretPath,
  projectSlug: context.projectSlug,
  environmentSlug: context.environment,
  data: {
    maxTTL: values.maxTTL || undefined,
    defaultTTL: values.defaultTTL,
    inputs: getCouchbaseEditProviderInputs(values),
    metadata: values.metadata,
    newName: values.name === context.dynamicSecret.name ? undefined : values.name,
    usernameTemplate: normalizeCouchbaseUsernameTemplateForEdit(values.usernameTemplate)
  }
});
