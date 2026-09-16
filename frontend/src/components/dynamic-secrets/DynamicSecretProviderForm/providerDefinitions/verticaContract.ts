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
import {
  TCreateDynamicSecretProviderDTO,
  TCreateDynamicSecretProviderFormContext,
  TDynamicSecretProviderFormValues,
  TEditDynamicSecretProviderFormContext
} from "../types";

export const VERTICA_CUSTOM_RENDERER_REASONS = [
  "permission-aware-fields",
  "non-scalar-value",
  "context-aware-fields"
] as const;

const buildVerticaPasswordRequirementsSchema = (minimumLength: number) =>
  z
    .object({
      length: z.number().min(minimumLength).max(250),
      required: z
        .object({
          lowercase: z.number().min(0),
          uppercase: z.number().min(0),
          digits: z.number().min(0),
          symbols: z.number().min(0)
        })
        .refine(
          (required) => Object.values(required).reduce((sum, count) => sum + count, 0) <= 250,
          "Sum of required characters cannot exceed 250"
        ),
      allowedSymbols: z.string().optional()
    })
    .refine(
      ({ length, required }) =>
        Object.values(required).reduce((sum, count) => sum + count, 0) <= length,
      "Sum of required characters cannot exceed the total length"
    );

export const verticaCreatePasswordRequirementsSchema = buildVerticaPasswordRequirementsSchema(8);
export const verticaEditPasswordRequirementsSchema = buildVerticaPasswordRequirementsSchema(1);

export const verticaCreateInputsSchema = z.object({
  host: z.string().toLowerCase().min(1),
  port: z.number(),
  database: z.string().min(1),
  username: z.string().min(1),
  password: z.string().min(1),
  passwordRequirements: verticaCreatePasswordRequirementsSchema.optional(),
  creationStatement: z.string().min(1),
  revocationStatement: z.string().min(1),
  gatewayId: z.string().optional(),
  gatewayPoolId: z.string().optional()
});

export const verticaEditInputsSchema = verticaCreateInputsSchema
  .extend({
    passwordRequirements: verticaEditPasswordRequirementsSchema.optional(),
    gatewayId: z.string().optional().nullable(),
    gatewayPoolId: z.string().optional().nullable()
  })
  .partial();

export type TVerticaCreateFormValues = TDynamicSecretProviderFormValues<
  z.infer<typeof verticaCreateInputsSchema>
>;
export type TVerticaEditFormValues = TDynamicSecretProviderFormValues<
  z.infer<typeof verticaEditInputsSchema>
>;

export const verticaCreateFormSchema = createDynamicSecretProviderFormSchema(
  verticaCreateInputsSchema
) as z.ZodType<TVerticaCreateFormValues>;

export const verticaEditFormSchema = editDynamicSecretProviderFormSchema(verticaEditInputsSchema, {
  usernameTemplateSchema: z.string().trim().nullable().optional()
}) as z.ZodType<TVerticaEditFormValues>;

export const getDefaultVerticaPasswordRequirements = () => ({
  length: 48,
  required: { lowercase: 1, uppercase: 1, digits: 1, symbols: 0 },
  allowedSymbols: "-_.~!*"
});

export const getVerticaCreateDefaultValues = (
  context: TCreateDynamicSecretProviderFormContext
): TVerticaCreateFormValues => ({
  name: "",
  defaultTTL: "1h",
  maxTTL: "24h",
  environment: context.isSingleEnvironmentMode ? context.environments[0] : undefined,
  usernameTemplate: DEFAULT_DYNAMIC_SECRET_USERNAME_TEMPLATE,
  inputs: {
    host: "",
    port: 5433,
    database: "",
    username: "",
    password: "",
    passwordRequirements: getDefaultVerticaPasswordRequirements(),
    creationStatement:
      "CREATE USER {{username}} IDENTIFIED BY '{{password}}';\nGRANT CREATE ON SCHEMA public TO {{username}};",
    revocationStatement: "DROP USER {{username}} CASCADE;"
  }
});

export const getVerticaEditDefaultValues = (
  context: TEditDynamicSecretProviderFormContext
): TVerticaEditFormValues => {
  const inputs = context.dynamicSecret.inputs as TVerticaEditFormValues["inputs"];
  return {
    name: context.dynamicSecret.name,
    defaultTTL: context.dynamicSecret.defaultTTL,
    maxTTL: context.dynamicSecret.maxTTL,
    usernameTemplate:
      context.dynamicSecret.usernameTemplate || DEFAULT_DYNAMIC_SECRET_USERNAME_TEMPLATE,
    inputs: {
      ...inputs,
      passwordRequirements: inputs.passwordRequirements || getDefaultVerticaPasswordRequirements()
    }
  };
};

export const getVerticaCreatePayload = (
  values: TVerticaCreateFormValues,
  context: TCreateDynamicSecretProviderFormContext
): TCreateDynamicSecretProviderDTO<DynamicSecretProviders.Vertica> => ({
  provider: {
    type: DynamicSecretProviders.Vertica,
    inputs: verticaCreateInputsSchema.parse(values.inputs)
  },
  maxTTL: values.maxTTL ?? undefined,
  name: values.name,
  path: context.secretPath,
  defaultTTL: values.defaultTTL,
  projectSlug: context.projectSlug,
  environmentSlug: values.environment?.slug ?? "",
  usernameTemplate: normalizeDynamicSecretUsernameTemplateForCreate(values.usernameTemplate)
});

export const getVerticaEditPayload = (
  values: TVerticaEditFormValues,
  context: TEditDynamicSecretProviderFormContext
): TUpdateDynamicSecretDTO => {
  const inputs = verticaEditInputsSchema.parse(values.inputs);
  return {
    name: context.dynamicSecret.name,
    path: context.secretPath,
    projectSlug: context.projectSlug,
    environmentSlug: context.environment,
    data: {
      maxTTL: values.maxTTL || undefined,
      defaultTTL: values.defaultTTL,
      inputs: {
        ...inputs,
        gatewayId: inputs.gatewayId ?? null,
        gatewayPoolId: inputs.gatewayPoolId ?? null
      },
      newName: values.name === context.dynamicSecret.name ? undefined : values.name,
      usernameTemplate: normalizeDynamicSecretUsernameTemplateForEdit(values.usernameTemplate)
    }
  };
};
