import { z } from "zod";

import {
  DynamicSecretProviders,
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

type TCloudflareAccessInputs = Extract<
  TDynamicSecretProvider,
  { type: DynamicSecretProviders.CloudflareAccess }
>["inputs"];

const parseTags = (value: string) =>
  value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [key, ...rest] = entry.split("=");
      return { key: key.trim(), value: rest.join("=").trim() };
    });

const cloudflareAccessInputFields = {
  accountId: z
    .string()
    .trim()
    .regex(/^[a-f0-9]{32}$/, "Account ID must be a 32-character Cloudflare account ID"),
  tags: z
    .string()
    .trim()
    .refine((value) => parseTags(value).length >= 1, "At least one tag is required")
    .refine(
      (value) => parseTags(value).every((tag) => tag.key && tag.value),
      "Separate key=value tags with commas, such as pool=agents, region=west; tag values can't contain commas"
    )
    .refine(
      (value) => parseTags(value).every((tag) => /^[\p{L}\p{N}_.-]{1,256}$/u.test(tag.key)),
      "Tag keys may only contain letters, digits, underscores, periods, and hyphens"
    )
    .refine(
      (value) => parseTags(value).every((tag) => tag.value.length <= 256),
      "Tag values may be at most 256 characters"
    )
    .refine(
      (value) => parseTags(value).length <= 5,
      "Cloudflare allows at most 5 tags per service token"
    )
    .refine((value) => {
      const keys = parseTags(value).map((tag) => tag.key);
      return new Set(keys).size === keys.length;
    }, "Tag keys must be unique")
};

const cloudflareAccessCreateInputsSchema = z.object({
  ...cloudflareAccessInputFields,
  apiToken: z.string().trim().min(1, "API token is required")
});
const cloudflareAccessEditInputsSchema = z.object({
  ...cloudflareAccessInputFields,
  apiToken: z.string().trim().optional()
});

export type TCloudflareAccessFormValues = TDynamicSecretProviderFormValues<
  z.infer<typeof cloudflareAccessEditInputsSchema>
>;

export const cloudflareAccessCreateFormSchema = createDynamicSecretProviderFormSchema(
  cloudflareAccessCreateInputsSchema
) as z.ZodType<TCloudflareAccessFormValues>;

export const cloudflareAccessEditFormSchema = editDynamicSecretProviderFormSchema(
  cloudflareAccessEditInputsSchema
) as z.ZodType<TCloudflareAccessFormValues>;

const buildInputs = (inputs: TCloudflareAccessFormValues["inputs"]): TCloudflareAccessInputs => ({
  ...(inputs.apiToken ? { apiToken: inputs.apiToken } : {}),
  accountId: inputs.accountId,
  tags: parseTags(inputs.tags)
});

export const getCloudflareAccessCreateDefaultValues = (
  context: TCreateDynamicSecretProviderFormContext
): TCloudflareAccessFormValues => ({
  name: "",
  defaultTTL: "1h",
  maxTTL: "24h",
  environment: context.isSingleEnvironmentMode ? context.environments[0] : undefined,
  usernameTemplate: DEFAULT_DYNAMIC_SECRET_USERNAME_TEMPLATE,
  inputs: {
    apiToken: "",
    accountId: "",
    tags: ""
  }
});

export const getCloudflareAccessEditDefaultValues = (
  context: TEditDynamicSecretProviderFormContext
): TCloudflareAccessFormValues => {
  const inputs = context.dynamicSecret.inputs as TCloudflareAccessInputs;
  return {
    name: context.dynamicSecret.name,
    defaultTTL: context.dynamicSecret.defaultTTL,
    maxTTL: context.dynamicSecret.maxTTL,
    usernameTemplate:
      context.dynamicSecret.usernameTemplate || DEFAULT_DYNAMIC_SECRET_USERNAME_TEMPLATE,
    inputs: {
      apiToken: "",
      accountId: inputs.accountId,
      tags: inputs.tags.map(({ key, value }) => `${key}=${value}`).join(", ")
    }
  };
};

export const getCloudflareAccessCreatePayload = (
  values: TCloudflareAccessFormValues,
  context: TCreateDynamicSecretProviderFormContext
): TCreateDynamicSecretProviderDTO<DynamicSecretProviders.CloudflareAccess> => ({
  provider: { type: DynamicSecretProviders.CloudflareAccess, inputs: buildInputs(values.inputs) },
  maxTTL: values.maxTTL ?? undefined,
  name: values.name,
  path: context.secretPath,
  defaultTTL: values.defaultTTL,
  projectSlug: context.projectSlug,
  environmentSlug: values.environment?.slug ?? "",
  usernameTemplate: normalizeDynamicSecretUsernameTemplateForCreate(values.usernameTemplate)
});

export const getCloudflareAccessEditPayload = (
  values: TCloudflareAccessFormValues,
  context: TEditDynamicSecretProviderFormContext
): TUpdateDynamicSecretDTO => ({
  name: context.dynamicSecret.name,
  path: context.secretPath,
  projectSlug: context.projectSlug,
  environmentSlug: context.environment,
  data: {
    maxTTL: values.maxTTL || null,
    defaultTTL: values.defaultTTL,
    inputs: buildInputs(values.inputs),
    newName: values.name === context.dynamicSecret.name ? undefined : values.name,
    usernameTemplate: normalizeDynamicSecretUsernameTemplateForEdit(values.usernameTemplate)
  }
});
