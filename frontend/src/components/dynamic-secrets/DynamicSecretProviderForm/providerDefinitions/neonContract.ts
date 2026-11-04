import { z } from "zod";

import {
  DynamicSecretProviders,
  NeonLeaseType,
  TUpdateDynamicSecretDTO
} from "@app/hooks/api/dynamicSecret/types";

import {
  createDynamicSecretProviderFormSchema,
  DEFAULT_DYNAMIC_SECRET_USERNAME_TEMPLATE,
  editDynamicSecretProviderFormSchema,
  normalizeDynamicSecretUsernameTemplateForCreate,
  normalizeDynamicSecretUsernameTemplateForEdit
} from "../schemas";
import {
  TCreateDynamicSecretProviderDTO,
  TCreateDynamicSecretProviderFormContext,
  TDynamicSecretProviderFormValues,
  TEditDynamicSecretProviderFormContext
} from "../types";

export const NEON_CUSTOM_RENDERER_REASONS = ["conditional-fields"] as const;

const NEON_RESOURCE_ID_REGEX = /^[a-z0-9-]{1,60}$/;

const optionalResourceId = (message: string) =>
  z
    .string()
    .trim()
    .optional()
    .transform((value) => value || undefined)
    .refine((value) => value === undefined || NEON_RESOURCE_ID_REGEX.test(value), message);

const neonInputsObjectSchema = z.object({
  apiKey: z.string().trim().min(1, "API key is required"),
  projectId: z
    .string()
    .trim()
    .min(1, "Project ID is required")
    .regex(NEON_RESOURCE_ID_REGEX, "Must be a valid Neon project ID"),
  leaseType: z.nativeEnum(NeonLeaseType),
  branchId: optionalResourceId("Must be a valid Neon branch ID"),
  databaseName: z.string().trim().min(1, "Database name is required").max(63),
  roleName: z
    .string()
    .trim()
    .max(63)
    .optional()
    .transform((value) => value || undefined),
  pooled: z.boolean().default(false),
  resetRolePassword: z.boolean().default(true),
  setBranchExpiration: z.boolean().default(false)
});

type TNeonInputsObject = z.infer<typeof neonInputsObjectSchema>;

const refineNeonInputs = (
  inputs: Partial<TNeonInputsObject>,
  context: z.RefinementCtx,
  leaseType = inputs.leaseType
) => {
  if (leaseType === NeonLeaseType.Role && !inputs.branchId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["branchId"],
      message: "Branch ID is required when each lease creates a role"
    });
  }
  if (leaseType === NeonLeaseType.Branch && !inputs.roleName) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["roleName"],
      message: "Role name is required when each lease creates a branch"
    });
  }
};

export const neonCreateInputsSchema = neonInputsObjectSchema.superRefine((inputs, context) =>
  refineNeonInputs(inputs, context)
);

// The stored API key is never sent back to the browser, so a blank key on edit means "keep it"
export const neonEditInputsSchema = neonInputsObjectSchema
  .partial()
  .extend({
    apiKey: z
      .string()
      .trim()
      .optional()
      .transform((value) => value || undefined)
  })
  .superRefine((inputs, context) => refineNeonInputs(inputs, context));

export type TNeonCreateInputs = z.infer<typeof neonCreateInputsSchema>;
export type TNeonEditInputs = z.infer<typeof neonEditInputsSchema>;
export type TNeonCreateFormValues = TDynamicSecretProviderFormValues<TNeonCreateInputs>;
export type TNeonEditFormValues = TDynamicSecretProviderFormValues<TNeonEditInputs>;
export type TNeonFormValues = TNeonCreateFormValues | TNeonEditFormValues;

export const neonCreateFormSchema = createDynamicSecretProviderFormSchema(
  neonCreateInputsSchema
) as z.ZodType<TNeonCreateFormValues>;

export const neonEditFormSchema = editDynamicSecretProviderFormSchema(neonEditInputsSchema, {
  usernameTemplateSchema: z.string().trim().nullable().optional()
}) as z.ZodType<TNeonEditFormValues>;

export const getNeonCreateDefaultValues = (
  context: TCreateDynamicSecretProviderFormContext
): TNeonCreateFormValues => ({
  name: "",
  defaultTTL: "1h",
  maxTTL: "24h",
  environment: context.isSingleEnvironmentMode ? context.environments[0] : undefined,
  usernameTemplate: DEFAULT_DYNAMIC_SECRET_USERNAME_TEMPLATE,
  inputs: {
    apiKey: "",
    projectId: "",
    leaseType: NeonLeaseType.Role,
    branchId: undefined,
    databaseName: "neondb",
    roleName: "neondb_owner",
    pooled: false,
    resetRolePassword: true,
    setBranchExpiration: false
  }
});

export const getNeonEditDefaultValues = (
  context: TEditDynamicSecretProviderFormContext
): TNeonEditFormValues => ({
  name: context.dynamicSecret.name,
  defaultTTL: context.dynamicSecret.defaultTTL,
  maxTTL: context.dynamicSecret.maxTTL,
  usernameTemplate:
    context.dynamicSecret.usernameTemplate || DEFAULT_DYNAMIC_SECRET_USERNAME_TEMPLATE,
  inputs: { ...(context.dynamicSecret.inputs as TNeonEditInputs), apiKey: "" }
});

export const getNeonCreatePayload = (
  values: TNeonCreateFormValues,
  context: TCreateDynamicSecretProviderFormContext
): TCreateDynamicSecretProviderDTO<DynamicSecretProviders.Neon> => {
  const inputs = neonCreateInputsSchema.parse(values.inputs);
  return {
    provider: {
      type: DynamicSecretProviders.Neon,
      // role leases don't use the branch-only settings, so don't store them
      inputs:
        inputs.leaseType === NeonLeaseType.Role
          ? { ...inputs, roleName: undefined, resetRolePassword: true, setBranchExpiration: false }
          : inputs
    },
    maxTTL: values.maxTTL ?? undefined,
    name: values.name,
    path: context.secretPath,
    defaultTTL: values.defaultTTL,
    projectSlug: context.projectSlug,
    environmentSlug: values.environment?.slug ?? "",
    usernameTemplate: normalizeDynamicSecretUsernameTemplateForCreate(values.usernameTemplate)
  };
};

export const getNeonEditPayload = (
  values: TNeonEditFormValues,
  context: TEditDynamicSecretProviderFormContext
): TUpdateDynamicSecretDTO => ({
  name: context.dynamicSecret.name,
  path: context.secretPath,
  projectSlug: context.projectSlug,
  environmentSlug: context.environment,
  data: {
    maxTTL: values.maxTTL || undefined,
    defaultTTL: values.defaultTTL,
    inputs: neonEditInputsSchema.parse(values.inputs),
    newName: values.name === context.dynamicSecret.name ? undefined : values.name,
    usernameTemplate: normalizeDynamicSecretUsernameTemplateForEdit(values.usernameTemplate)
  }
});
