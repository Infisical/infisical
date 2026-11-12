import { z } from "zod";

import {
  DynamicSecretProviders,
  OpenRouterLimitReset,
  TDynamicSecretProvider,
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

export const OPEN_ROUTER_NO_LIMIT_RESET = "none";

type TOpenRouterInputs = Extract<
  TDynamicSecretProvider,
  { type: DynamicSecretProviders.OpenRouter }
>["inputs"];

const openRouterInputFields = {
  workspaceId: z.string().trim().max(100).optional(),
  limit: z
    .string()
    .trim()
    .max(32)
    .refine(
      (value) => !value || /^\d+(\.\d+)?$/.test(value),
      "Credit limit must be a non-negative number, such as 10 or 2.5"
    )
    .optional(),
  limitReset: z.union([z.nativeEnum(OpenRouterLimitReset), z.literal(OPEN_ROUTER_NO_LIMIT_RESET)]),
  includeByokInLimit: z.boolean()
};

const openRouterCreateInputsSchema = z.object({
  ...openRouterInputFields,
  managementKey: z.string().trim().min(1, "Management key is required")
});
const openRouterEditInputsSchema = z.object({
  ...openRouterInputFields,
  managementKey: z.string().trim().optional()
});

export type TOpenRouterFormValues = TDynamicSecretProviderFormValues<
  z.infer<typeof openRouterEditInputsSchema>
>;

export const openRouterCreateFormSchema = createDynamicSecretProviderFormSchema(
  openRouterCreateInputsSchema
) as z.ZodType<TOpenRouterFormValues>;

export const openRouterEditFormSchema = editDynamicSecretProviderFormSchema(
  openRouterEditInputsSchema
) as z.ZodType<TOpenRouterFormValues>;

const buildInputs = (inputs: TOpenRouterFormValues["inputs"]): TOpenRouterInputs => ({
  ...(inputs.managementKey ? { managementKey: inputs.managementKey } : {}),
  workspaceId: inputs.workspaceId || null,
  limit: inputs.limit || null,
  limitReset: inputs.limitReset === OPEN_ROUTER_NO_LIMIT_RESET ? null : inputs.limitReset,
  includeByokInLimit: inputs.includeByokInLimit
});

export const getOpenRouterCreateDefaultValues = (
  context: TCreateDynamicSecretProviderFormContext
): TOpenRouterFormValues => ({
  name: "",
  defaultTTL: "1h",
  maxTTL: "24h",
  environment: context.isSingleEnvironmentMode ? context.environments[0] : undefined,
  usernameTemplate: DEFAULT_DYNAMIC_SECRET_USERNAME_TEMPLATE,
  inputs: {
    managementKey: "",
    workspaceId: "",
    limit: "",
    limitReset: OPEN_ROUTER_NO_LIMIT_RESET,
    includeByokInLimit: false
  }
});

export const getOpenRouterEditDefaultValues = (
  context: TEditDynamicSecretProviderFormContext
): TOpenRouterFormValues => {
  const inputs = context.dynamicSecret.inputs as TOpenRouterInputs;
  return {
    name: context.dynamicSecret.name,
    defaultTTL: context.dynamicSecret.defaultTTL,
    maxTTL: context.dynamicSecret.maxTTL,
    usernameTemplate:
      context.dynamicSecret.usernameTemplate || DEFAULT_DYNAMIC_SECRET_USERNAME_TEMPLATE,
    inputs: {
      managementKey: "",
      workspaceId: inputs.workspaceId ?? "",
      limit: inputs.limit ?? "",
      limitReset: inputs.limitReset ?? OPEN_ROUTER_NO_LIMIT_RESET,
      includeByokInLimit: inputs.includeByokInLimit ?? false
    }
  };
};

export const getOpenRouterCreatePayload = (
  values: TOpenRouterFormValues,
  context: TCreateDynamicSecretProviderFormContext
): TCreateDynamicSecretProviderDTO<DynamicSecretProviders.OpenRouter> => ({
  provider: { type: DynamicSecretProviders.OpenRouter, inputs: buildInputs(values.inputs) },
  maxTTL: values.maxTTL ?? undefined,
  name: values.name,
  path: context.secretPath,
  defaultTTL: values.defaultTTL,
  projectSlug: context.projectSlug,
  environmentSlug: values.environment?.slug ?? "",
  usernameTemplate: normalizeDynamicSecretUsernameTemplateForCreate(values.usernameTemplate)
});

export const getOpenRouterEditPayload = (
  values: TOpenRouterFormValues,
  context: TEditDynamicSecretProviderFormContext
): TUpdateDynamicSecretDTO => ({
  name: context.dynamicSecret.name,
  path: context.secretPath,
  projectSlug: context.projectSlug,
  environmentSlug: context.environment,
  data: {
    maxTTL: values.maxTTL || undefined,
    defaultTTL: values.defaultTTL,
    inputs: buildInputs(values.inputs),
    newName: values.name === context.dynamicSecret.name ? undefined : values.name,
    usernameTemplate: normalizeDynamicSecretUsernameTemplateForEdit(values.usernameTemplate)
  }
});
