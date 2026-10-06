import ms from "ms";
import { z } from "zod";

import {
  DynamicSecretProviders,
  OAuth2ClientAuthMethod,
  OAuth2GrantType,
  TDynamicSecretProvider,
  TUpdateDynamicSecretDTO
} from "@app/hooks/api/dynamicSecret/types";

import {
  createDynamicSecretProviderFormSchema,
  editDynamicSecretProviderFormSchema
} from "../schemas";
import {
  TCreateDynamicSecretProviderDTO,
  TCreateDynamicSecretProviderFormContext,
  TDynamicSecretProviderFormValues,
  TEditDynamicSecretProviderFormContext
} from "../types";

export const OAUTH2_CUSTOM_RENDERER_REASONS = ["repeatable-fields"] as const;
export const OAUTH2_MAX_EXTRA_PARAMS = 20;

// keep in sync with OAUTH2_RESERVED_PARAMS in backend/src/ee/services/dynamic-secret/providers/models.ts
const OAUTH2_RESERVED_PARAMS = new Set([
  "grant_type",
  "scope",
  "client_id",
  "client_secret",
  "client_assertion",
  "client_assertion_type"
]);
const SCOPE_TOKEN_REGEX = /^[\x21\x23-\x5B\x5D-\x7E]+$/;
const PARAM_KEY_REGEX = /^[A-Za-z0-9._~:[\]-]+$/;

type TOAuth2Inputs = Extract<
  TDynamicSecretProvider,
  { type: DynamicSecretProviders.OAuth2 }
>["inputs"];

export const normalizeOAuth2Scope = (scope?: string) =>
  [...new Set((scope ?? "").split(/\s+/).filter(Boolean))].join(" ");

const urlSchema = (label: string) =>
  z.string().trim().min(1, `${label} is required`).max(2048).url(`${label} must be a valid URL`);

const scopeSchema = z
  .string()
  .trim()
  .max(2048)
  .optional()
  .superRefine((scope, context) => {
    const invalidTokens = (scope ?? "")
      .split(/\s+/)
      .filter((token) => token && !SCOPE_TOKEN_REGEX.test(token));
    if (invalidTokens.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Scope contains invalid characters: ${invalidTokens.join(", ")}`
      });
    }
  });

const extraParamsSchema = z
  .array(
    z.object({
      key: z
        .string()
        .trim()
        .min(1, "Parameter name is required")
        .max(128)
        .regex(PARAM_KEY_REGEX, "Parameter name contains invalid characters")
        .refine(
          (key) => !OAUTH2_RESERVED_PARAMS.has(key.toLowerCase()),
          "Infisical sets this parameter"
        ),
      value: z.string().trim().min(1, "Parameter value is required").max(2048)
    })
  )
  .max(OAUTH2_MAX_EXTRA_PARAMS, `At most ${OAUTH2_MAX_EXTRA_PARAMS} extra parameters are allowed`)
  .superRefine((params, context) => {
    const seen = new Set<string>();
    params.forEach(({ key }, index) => {
      if (seen.has(key.trim())) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index, "key"],
          message: "Parameter is set more than once"
        });
      }
      seen.add(key.trim());
    });
  });

const oauth2BaseInputs = {
  grantType: z.literal(OAuth2GrantType.ClientCredentials),
  tokenUrl: urlSchema("Token URL"),
  revocationUrl: urlSchema("Revocation URL"),
  clientId: z.string().trim().min(1, "Client ID is required").max(1024),
  scope: scopeSchema,
  extraParams: extraParamsSchema
};

const makeClientAuthSchema = <T extends z.ZodTypeAny>(clientSecret: T) =>
  z.discriminatedUnion("method", [
    z.object({ method: z.literal(OAuth2ClientAuthMethod.ClientSecretBasic), clientSecret }),
    z.object({ method: z.literal(OAuth2ClientAuthMethod.ClientSecretPost), clientSecret })
  ]);

const oauth2CreateInputsSchema = z.object({
  ...oauth2BaseInputs,
  clientAuth: makeClientAuthSchema(z.string().trim().min(1, "Client secret is required").max(4096))
});

// the stored secret is never returned, so an empty value on edit keeps it
const oauth2EditInputsSchema = z.object({
  ...oauth2BaseInputs,
  clientAuth: makeClientAuthSchema(z.string().trim().max(4096).optional())
});

export type TOAuth2CreateFormValues = TDynamicSecretProviderFormValues<
  z.infer<typeof oauth2CreateInputsSchema>
>;
export type TOAuth2EditFormValues = TDynamicSecretProviderFormValues<
  z.infer<typeof oauth2EditInputsSchema>
>;

const withTtlOrder = <T extends z.ZodTypeAny>(schema: T) =>
  schema.refine(
    (data: { defaultTTL?: string; maxTTL?: string | null }) => {
      if (!data.maxTTL || !data.defaultTTL) return true;
      const maxTtlMs = ms(data.maxTTL);
      const defaultTtlMs = ms(data.defaultTTL);
      if (maxTtlMs === undefined || defaultTtlMs === undefined) return true;
      return maxTtlMs >= defaultTtlMs;
    },
    { path: ["maxTTL"], message: "Max TTL must be greater than or equal to Default TTL" }
  );

export const oauth2CreateFormSchema = withTtlOrder(
  createDynamicSecretProviderFormSchema(oauth2CreateInputsSchema)
) as z.ZodType<TOAuth2CreateFormValues>;

export const oauth2EditFormSchema = withTtlOrder(
  editDynamicSecretProviderFormSchema(oauth2EditInputsSchema)
) as z.ZodType<TOAuth2EditFormValues>;

export const getOAuth2CreateDefaultValues = (
  context: TCreateDynamicSecretProviderFormContext
): TOAuth2CreateFormValues => ({
  name: "",
  defaultTTL: "30m",
  maxTTL: "1h",
  environment: context.isSingleEnvironmentMode ? context.environments[0] : undefined,
  inputs: {
    grantType: OAuth2GrantType.ClientCredentials,
    tokenUrl: "",
    revocationUrl: "",
    clientId: "",
    clientAuth: { method: OAuth2ClientAuthMethod.ClientSecretBasic, clientSecret: "" },
    scope: "",
    extraParams: []
  }
});

export const getOAuth2EditDefaultValues = (
  context: TEditDynamicSecretProviderFormContext
): TOAuth2EditFormValues => {
  const inputs = context.dynamicSecret.inputs as Partial<TOAuth2Inputs>;
  return {
    name: context.dynamicSecret.name,
    defaultTTL: context.dynamicSecret.defaultTTL,
    maxTTL: context.dynamicSecret.maxTTL,
    inputs: {
      grantType: OAuth2GrantType.ClientCredentials,
      tokenUrl: inputs.tokenUrl ?? "",
      revocationUrl: inputs.revocationUrl ?? "",
      clientId: inputs.clientId ?? "",
      clientAuth: {
        method: inputs.clientAuth?.method ?? OAuth2ClientAuthMethod.ClientSecretBasic,
        clientSecret: ""
      },
      scope: inputs.scope ?? "",
      extraParams: inputs.extraParams ?? []
    }
  };
};

const buildInputs = (inputs: TOAuth2EditFormValues["inputs"]) => {
  const clientSecret = inputs.clientAuth.clientSecret?.trim();
  return {
    grantType: OAuth2GrantType.ClientCredentials,
    tokenUrl: inputs.tokenUrl.trim(),
    revocationUrl: inputs.revocationUrl.trim(),
    clientId: inputs.clientId.trim(),
    clientAuth: { method: inputs.clientAuth.method, ...(clientSecret ? { clientSecret } : {}) },
    extraParams: inputs.extraParams.map(({ key, value }) => ({
      key: key.trim(),
      value: value.trim()
    }))
  } as const;
};

export const getOAuth2CreatePayload = (
  values: TOAuth2CreateFormValues,
  context: TCreateDynamicSecretProviderFormContext
): TCreateDynamicSecretProviderDTO<DynamicSecretProviders.OAuth2> => ({
  provider: {
    type: DynamicSecretProviders.OAuth2,
    inputs: {
      ...buildInputs(values.inputs),
      scope: normalizeOAuth2Scope(values.inputs.scope) || undefined
    }
  },
  defaultTTL: values.defaultTTL,
  maxTTL: values.maxTTL ?? undefined,
  name: values.name,
  path: context.secretPath,
  projectSlug: context.projectSlug,
  environmentSlug: values.environment?.slug ?? ""
});

export const getOAuth2EditPayload = (
  values: TOAuth2EditFormValues,
  context: TEditDynamicSecretProviderFormContext
): TUpdateDynamicSecretDTO => ({
  name: context.dynamicSecret.name,
  path: context.secretPath,
  projectSlug: context.projectSlug,
  environmentSlug: context.environment,
  data: {
    // an omitted scope would keep the stored one, so a cleared scope is sent as ""
    inputs: { ...buildInputs(values.inputs), scope: normalizeOAuth2Scope(values.inputs.scope) },
    newName: values.name === context.dynamicSecret.name ? undefined : values.name,
    defaultTTL: values.defaultTTL,
    maxTTL: values.maxTTL
  }
});
