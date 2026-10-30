import ms from "ms";
import { z } from "zod";

import {
  DynamicSecretProviders,
  TUpdateDynamicSecretDTO
} from "@app/hooks/api/dynamicSecret/types";

import {
  TCreateDynamicSecretProviderDTO,
  TCreateDynamicSecretProviderFormContext,
  TDynamicSecretProviderFormMode,
  TDynamicSecretProviderFormValues,
  TEditDynamicSecretProviderFormContext
} from "../types";

export const IBM_API_CONNECT_CUSTOM_RENDERER_REASONS = [
  "permission-aware-fields",
  "remote-options"
] as const;

const validateIbmTtl = (value: string, context: z.RefinementCtx) => {
  if (!value) return;
  const milliseconds = ms(value);
  if (milliseconds === undefined) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid TTL format" });
    return;
  }
  if (milliseconds < 1000) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "TTL must be a greater than 1 second"
    });
  }
};

export const ibmApiConnectCreateInputsSchema = z.object({
  clientId: z.string().trim().min(1, "Client ID is required"),
  clientSecret: z.string().trim().min(1, "Client Secret is required"),
  instanceUrl: z.string().url("Must be a valid URL").trim().min(1, "Instance URL is required"),
  apiKey: z.string().trim().min(1, "API Key is required"),
  orgId: z.string().trim().min(1, "Organization is required"),
  catalogId: z.string().trim().min(1, "Catalog is required"),
  consumerOrgId: z.string().trim().min(1, "Consumer Organization is required"),
  appId: z.string().trim().min(1, "Application is required"),
  gatewayId: z.string().optional(),
  gatewayPoolId: z.string().optional()
});
export const ibmApiConnectEditInputsSchema = ibmApiConnectCreateInputsSchema.extend({
  gatewayId: z.string().optional().nullable(),
  gatewayPoolId: z.string().optional().nullable()
});

export type TIbmApiConnectCreateFormInputs = z.input<typeof ibmApiConnectCreateInputsSchema>;
export type TIbmApiConnectEditFormInputs = z.input<typeof ibmApiConnectEditInputsSchema>;
export type TIbmApiConnectCreateFormValues =
  TDynamicSecretProviderFormValues<TIbmApiConnectCreateFormInputs>;
export type TIbmApiConnectEditFormValues =
  TDynamicSecretProviderFormValues<TIbmApiConnectEditFormInputs>;
export type TIbmApiConnectFormValues = TIbmApiConnectEditFormValues;

export const normalizeIbmApiConnectGatewayValueForMode = (
  mode: TDynamicSecretProviderFormMode,
  value: string | null
) => (mode === "create" ? (value ?? undefined) : value);

const ibmBaseSchema = {
  name: z.string().refine((value) => value.toLowerCase() === value, "Must be lowercase"),
  defaultTTL: z.string().superRefine(validateIbmTtl),
  maxTTL: z
    .string()
    .optional()
    .superRefine((value, context) => value && validateIbmTtl(value, context)),
  usernameTemplate: z.string().nullable().optional()
};

export const ibmApiConnectCreateFormSchema = z
  .object({
    ...ibmBaseSchema,
    environment: z.object({ name: z.string(), slug: z.string() }),
    inputs: ibmApiConnectCreateInputsSchema
  })
  .refine((value) => !value.maxTTL || ms(value.maxTTL)! >= ms(value.defaultTTL)!, {
    path: ["maxTTL"],
    message: "Max TTL must be greater than or equal to Default TTL"
  }) as z.ZodType<TIbmApiConnectCreateFormValues>;

export const ibmApiConnectEditFormSchema = z
  .object({
    ...ibmBaseSchema,
    environment: z.object({ name: z.string(), slug: z.string() }).optional(),
    inputs: ibmApiConnectEditInputsSchema
  })
  .refine((value) => !value.maxTTL || ms(value.maxTTL)! >= ms(value.defaultTTL)!, {
    path: ["maxTTL"],
    message: "Max TTL must be greater than or equal to Default TTL"
  }) as z.ZodType<TIbmApiConnectEditFormValues>;

export const getIbmApiConnectCreateDefaultValues = (
  context: TCreateDynamicSecretProviderFormContext
): TIbmApiConnectCreateFormValues => ({
  name: "",
  defaultTTL: "1h",
  maxTTL: "24h",
  environment: context.isSingleEnvironmentMode ? context.environments[0] : undefined,
  inputs: {
    clientId: "",
    clientSecret: "",
    instanceUrl: "",
    apiKey: "",
    orgId: "",
    catalogId: "",
    consumerOrgId: "",
    appId: ""
  }
});

export const getIbmApiConnectEditDefaultValues = (
  context: TEditDynamicSecretProviderFormContext
): TIbmApiConnectEditFormValues => ({
  name: context.dynamicSecret.name,
  defaultTTL: context.dynamicSecret.defaultTTL,
  maxTTL: context.dynamicSecret.maxTTL,
  inputs: { ...(context.dynamicSecret.inputs as TIbmApiConnectEditFormInputs) }
});

export const getIbmApiConnectCreatePayload = (
  values: TIbmApiConnectCreateFormValues,
  context: TCreateDynamicSecretProviderFormContext
): TCreateDynamicSecretProviderDTO<DynamicSecretProviders.IbmApiConnect> => ({
  provider: {
    type: DynamicSecretProviders.IbmApiConnect,
    inputs: ibmApiConnectCreateInputsSchema.parse(values.inputs)
  },
  maxTTL: values.maxTTL ?? undefined,
  name: values.name,
  path: context.secretPath,
  defaultTTL: values.defaultTTL,
  projectSlug: context.projectSlug,
  environmentSlug: values.environment?.slug ?? ""
});

export const getIbmApiConnectEditPayload = (
  values: TIbmApiConnectEditFormValues,
  context: TEditDynamicSecretProviderFormContext
): TUpdateDynamicSecretDTO => ({
  name: context.dynamicSecret.name,
  path: context.secretPath,
  projectSlug: context.projectSlug,
  environmentSlug: context.environment,
  data: {
    maxTTL: values.maxTTL || undefined,
    defaultTTL: values.defaultTTL,
    inputs: ibmApiConnectEditInputsSchema.parse(values.inputs),
    newName: values.name === context.dynamicSecret.name ? undefined : values.name
  }
});
