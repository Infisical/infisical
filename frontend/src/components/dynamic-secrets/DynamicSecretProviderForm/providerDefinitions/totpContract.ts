import { z } from "zod";

import {
  DynamicSecretProviders,
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

export const TOTP_CUSTOM_RENDERER_REASONS = ["conditional-fields"] as const;

export enum TotpConfigType {
  URL = "url",
  MANUAL = "manual"
}

export enum TotpAlgorithm {
  SHA1 = "sha1",
  SHA256 = "sha256",
  SHA512 = "sha512"
}

const totpUrlInputsSchema = z.object({
  configType: z.literal(TotpConfigType.URL),
  url: z
    .string()
    .url()
    .trim()
    .min(1)
    .refine((value) => Boolean(new URL(value).searchParams.get("secret")), {
      message: "OTP URL must contain secret field"
    })
});

const totpManualInputsSchema = z.object({
  configType: z.literal(TotpConfigType.MANUAL),
  secret: z
    .string()
    .trim()
    .min(1)
    .transform((value) => value.replace(/\s+/g, "")),
  period: z.number().optional(),
  algorithm: z.nativeEnum(TotpAlgorithm).optional(),
  digits: z.number().optional()
});

export const totpInputsSchema = z.discriminatedUnion("configType", [
  totpUrlInputsSchema,
  totpManualInputsSchema
]);

export type TTotpFormInputs = z.input<typeof totpInputsSchema>;
export type TTotpFormValues = TDynamicSecretProviderFormValues<TTotpFormInputs>;

export const totpCreateFormSchema = createDynamicSecretProviderFormSchema(
  totpInputsSchema
) as z.ZodType<TTotpFormValues>;

export const totpEditFormSchema = editDynamicSecretProviderFormSchema(
  totpInputsSchema.optional()
) as z.ZodType<TTotpFormValues>;

export const getTotpCreateDefaultValues = (
  context: TCreateDynamicSecretProviderFormContext
): TTotpFormValues => ({
  name: "",
  defaultTTL: "1m",
  maxTTL: "24h",
  environment: context.isSingleEnvironmentMode ? context.environments[0] : undefined,
  inputs: { configType: TotpConfigType.URL, url: "" }
});

export const getTotpEditDefaultValues = (
  context: TEditDynamicSecretProviderFormContext
): TTotpFormValues => ({
  name: context.dynamicSecret.name,
  defaultTTL: context.dynamicSecret.defaultTTL,
  maxTTL: context.dynamicSecret.maxTTL,
  inputs: { ...(context.dynamicSecret.inputs as TTotpFormInputs) }
});

export const getTotpCreatePayload = (
  values: TTotpFormValues,
  context: TCreateDynamicSecretProviderFormContext
): TCreateDynamicSecretProviderDTO<DynamicSecretProviders.Totp> => ({
  provider: {
    type: DynamicSecretProviders.Totp,
    inputs: totpInputsSchema.parse(values.inputs)
  },
  maxTTL: values.maxTTL ?? undefined,
  name: values.name,
  path: context.secretPath,
  defaultTTL: values.defaultTTL,
  projectSlug: context.projectSlug,
  environmentSlug: values.environment?.slug ?? ""
});

export const getTotpEditPayload = (
  values: TTotpFormValues,
  context: TEditDynamicSecretProviderFormContext
): TUpdateDynamicSecretDTO => ({
  name: context.dynamicSecret.name,
  path: context.secretPath,
  projectSlug: context.projectSlug,
  environmentSlug: context.environment,
  data: {
    inputs: values.inputs ? totpInputsSchema.parse(values.inputs) : undefined,
    newName: values.name === context.dynamicSecret.name ? undefined : values.name
  }
});
