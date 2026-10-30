import ms from "ms";
import { z } from "zod";

import {
  DynamicSecretProviders,
  TailscaleAuthMethod,
  TailscaleKeyAuthType,
  TDynamicSecretProvider,
  TUpdateDynamicSecretDTO
} from "@app/hooks/api/dynamicSecret/types";
import { slugSchema } from "@app/lib/schemas";

import {
  TCreateDynamicSecretProviderDTO,
  TCreateDynamicSecretProviderFormContext,
  TDynamicSecretProviderFormValues,
  TEditDynamicSecretProviderFormContext
} from "../types";

export const TAILSCALE_CUSTOM_RENDERER_REASONS = [
  "conditional-fields",
  "non-scalar-value"
] as const;

type TTailscaleInputs = Extract<
  TDynamicSecretProvider,
  { type: DynamicSecretProviders.Tailscale }
>["inputs"];

const validateTtl = (value: string, context: z.RefinementCtx) => {
  const valueMs = ms(value);
  if (valueMs === undefined) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "TTL must be a valid duration" });
    return;
  }
  if (valueMs < 60 * 1000)
    context.addIssue({ code: z.ZodIssueCode.custom, message: "TTL must be greater than 1 minute" });
  if (valueMs > ms("90d"))
    context.addIssue({ code: z.ZodIssueCode.custom, message: "TTL must be less than 90 days" });
};
const authSchema = z.discriminatedUnion("method", [
  z.object({
    method: z.literal(TailscaleAuthMethod.ApiKey),
    apiKey: z.string().trim().min(1, "API key is required")
  }),
  z.object({
    method: z.literal(TailscaleAuthMethod.OAuth),
    clientId: z.string().trim().min(1, "Client ID is required"),
    clientSecret: z.string().trim().min(1, "Client secret is required")
  })
]);
const inputsSchema = z.discriminatedUnion("authType", [
  z.object({
    authType: z.literal(TailscaleKeyAuthType.AuthKeys),
    auth: authSchema,
    tailnet: z.string().trim().min(1, "Tailnet is required"),
    description: z.string().trim().max(50).optional(),
    tags: z.string().trim().optional(),
    reusable: z.boolean().default(false),
    preauthorized: z.boolean().default(false)
  }),
  z.object({
    authType: z.literal(TailscaleKeyAuthType.OAuthKeys),
    auth: authSchema,
    tailnet: z.string().trim().min(1, "Tailnet is required"),
    description: z.string().trim().max(50).optional(),
    tags: z.string().trim().optional(),
    scopes: z.string().trim().min(1, "At least one scope is required")
  }),
  z.object({
    authType: z.literal(TailscaleKeyAuthType.FederatedKeys),
    auth: authSchema,
    tailnet: z.string().trim().min(1, "Tailnet is required"),
    description: z.string().trim().max(50).optional(),
    tags: z.string().trim().optional(),
    scopes: z.string().trim().min(1, "At least one scope is required"),
    issuer: z.string().trim().min(1, "Issuer is required").url("Issuer must be a valid https URL"),
    subject: z.string().trim().min(1, "Subject is required"),
    audience: z.string().trim().optional()
  })
]);

export type TTailscaleFormValues = TDynamicSecretProviderFormValues<z.infer<typeof inputsSchema>>;

const makeSchema = (create: boolean) =>
  z
    .object({
      inputs: inputsSchema,
      defaultTTL: z.string().superRefine(validateTtl),
      maxTTL: z
        .string()
        .optional()
        .nullable()
        .superRefine((value, context) => {
          if (value) validateTtl(value, context);
        }),
      name: slugSchema(),
      environment: create
        ? z.object({ name: z.string(), slug: z.string() })
        : z.object({ name: z.string(), slug: z.string() }).optional(),
      usernameTemplate: z.string().nullable().optional()
    })
    .superRefine((value, context) => {
      const tagsRequired =
        value.inputs.authType !== TailscaleKeyAuthType.AuthKeys ||
        value.inputs.auth.method === TailscaleAuthMethod.OAuth;

      if (tagsRequired && !value.inputs.tags?.trim()) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["inputs", "tags"],
          message:
            value.inputs.authType === TailscaleKeyAuthType.AuthKeys
              ? "Tags are required when creating auth keys with OAuth authentication"
              : "Tags are required when the key type is OAuth or Federated Identity"
        });
      }
    });

export const tailscaleCreateFormSchema = makeSchema(true) as z.ZodType<TTailscaleFormValues>;
export const tailscaleEditFormSchema = makeSchema(false) as z.ZodType<TTailscaleFormValues>;

export const getTailscaleCreateDefaultValues = (
  context: TCreateDynamicSecretProviderFormContext
): TTailscaleFormValues => ({
  name: "",
  defaultTTL: "1h",
  maxTTL: "24h",
  environment: context.isSingleEnvironmentMode ? context.environments[0] : undefined,
  inputs: {
    authType: TailscaleKeyAuthType.AuthKeys,
    auth: { method: TailscaleAuthMethod.ApiKey, apiKey: "" },
    tailnet: "-",
    reusable: false,
    preauthorized: false
  }
});

const splitCsv = (value?: string) =>
  value
    ? value
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean)
    : [];
const hydrate = (raw: TTailscaleInputs): TTailscaleFormValues["inputs"] => {
  const base = {
    auth: raw.auth,
    tailnet: raw.tailnet,
    description: raw.description,
    tags: (raw.tags ?? []).join(", ")
  };
  if (raw.authType === TailscaleKeyAuthType.AuthKeys)
    return {
      ...base,
      authType: raw.authType,
      reusable: raw.reusable,
      preauthorized: raw.preauthorized
    };
  if (raw.authType === TailscaleKeyAuthType.OAuthKeys)
    return { ...base, authType: raw.authType, scopes: (raw.scopes ?? []).join(", ") };
  return {
    ...base,
    authType: raw.authType,
    scopes: (raw.scopes ?? []).join(", "),
    issuer: raw.issuer,
    subject: raw.subject,
    audience: raw.audience
  };
};
export const getTailscaleEditDefaultValues = (
  context: TEditDynamicSecretProviderFormContext
): TTailscaleFormValues => ({
  name: context.dynamicSecret.name,
  defaultTTL: context.dynamicSecret.defaultTTL,
  maxTTL: context.dynamicSecret.maxTTL,
  inputs: hydrate(context.dynamicSecret.inputs as TTailscaleInputs)
});

const buildInputs = (input: TTailscaleFormValues["inputs"]): TTailscaleInputs => {
  const auth =
    input.auth.method === TailscaleAuthMethod.ApiKey
      ? ({ method: TailscaleAuthMethod.ApiKey, apiKey: input.auth.apiKey } as const)
      : ({
          method: TailscaleAuthMethod.OAuth,
          clientId: input.auth.clientId,
          clientSecret: input.auth.clientSecret
        } as const);
  const base = {
    auth,
    tailnet: input.tailnet,
    description: input.description || undefined,
    tags: splitCsv(input.tags)
  };
  if (input.authType === TailscaleKeyAuthType.AuthKeys)
    return {
      ...base,
      authType: input.authType,
      reusable: input.reusable,
      preauthorized: input.preauthorized
    };
  if (input.authType === TailscaleKeyAuthType.OAuthKeys)
    return { ...base, authType: input.authType, scopes: splitCsv(input.scopes) };
  return {
    ...base,
    authType: input.authType,
    scopes: splitCsv(input.scopes),
    issuer: input.issuer,
    subject: input.subject,
    audience: input.audience || undefined
  };
};

export const getTailscaleCreatePayload = (
  values: TTailscaleFormValues,
  context: TCreateDynamicSecretProviderFormContext
): TCreateDynamicSecretProviderDTO<DynamicSecretProviders.Tailscale> => ({
  provider: { type: DynamicSecretProviders.Tailscale, inputs: buildInputs(values.inputs) },
  maxTTL: values.maxTTL ?? undefined,
  name: values.name,
  path: context.secretPath,
  defaultTTL: values.defaultTTL,
  projectSlug: context.projectSlug,
  environmentSlug: values.environment?.slug ?? ""
});
export const getTailscaleEditPayload = (
  values: TTailscaleFormValues,
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
    newName: values.name === context.dynamicSecret.name ? undefined : values.name
  }
});
