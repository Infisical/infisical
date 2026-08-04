import { z } from "zod";

import {
  DynamicSecretProviders,
  TUpdateDynamicSecretDTO
} from "@app/hooks/api/dynamicSecret/types";

import {
  TCreateDynamicSecretProviderDTO,
  TCreateDynamicSecretProviderFormContext,
  TDynamicSecretProviderFormValues,
  TEditDynamicSecretProviderFormContext
} from "../types";

const githubInputsSchema = z.object({
  appId: z.coerce.number().min(1, "Required"),
  installationId: z.coerce.number().min(1, "Required"),
  privateKey: z
    .string()
    .trim()
    .min(1, "Required")
    .refine(
      (value) =>
        /^-----BEGIN(?:(?: RSA| PGP| ENCRYPTED)? PRIVATE KEY)-----\s*[\s\S]*?-----END(?:(?: RSA| PGP| ENCRYPTED)? PRIVATE KEY)-----$/.test(
          value
        ),
      "Invalid PEM format for private key"
    )
});

export type TGithubFormValues = TDynamicSecretProviderFormValues<
  z.infer<typeof githubInputsSchema>
>;

const githubBaseSchema = z.object({
  name: z.string().refine((value) => value.toLowerCase() === value, "Must be lowercase"),
  defaultTTL: z.literal("1h"),
  maxTTL: z.string().nullable().optional(),
  environment: z.object({ name: z.string(), slug: z.string() }).optional(),
  usernameTemplate: z.string().nullable().optional(),
  inputs: githubInputsSchema
});

export const githubCreateFormSchema = githubBaseSchema.extend({
  environment: z.object({ name: z.string(), slug: z.string() })
}) as z.ZodType<TGithubFormValues>;

export const githubEditFormSchema = githubBaseSchema as z.ZodType<TGithubFormValues>;

export const getGithubCreateDefaultValues = (
  context: TCreateDynamicSecretProviderFormContext
): TGithubFormValues => ({
  name: "",
  defaultTTL: "1h",
  maxTTL: undefined,
  environment: context.isSingleEnvironmentMode ? context.environments[0] : undefined,
  inputs: { appId: 0, installationId: 0, privateKey: "" }
});

export const getGithubEditDefaultValues = (
  context: TEditDynamicSecretProviderFormContext
): TGithubFormValues => ({
  name: context.dynamicSecret.name,
  defaultTTL: "1h",
  maxTTL: undefined,
  inputs: context.dynamicSecret.inputs as TGithubFormValues["inputs"]
});

export const getGithubCreatePayload = (
  values: TGithubFormValues,
  context: TCreateDynamicSecretProviderFormContext
): TCreateDynamicSecretProviderDTO<DynamicSecretProviders.Github> => ({
  provider: {
    type: DynamicSecretProviders.Github,
    inputs: githubInputsSchema.parse(values.inputs)
  },
  defaultTTL: "1h",
  name: values.name,
  path: context.secretPath,
  projectSlug: context.projectSlug,
  environmentSlug: values.environment?.slug ?? ""
});

export const getGithubEditPayload = (
  values: TGithubFormValues,
  context: TEditDynamicSecretProviderFormContext
): TUpdateDynamicSecretDTO => ({
  name: context.dynamicSecret.name,
  path: context.secretPath,
  projectSlug: context.projectSlug,
  environmentSlug: context.environment,
  data: {
    inputs: githubInputsSchema.parse(values.inputs),
    newName: values.name === context.dynamicSecret.name ? undefined : values.name
  }
});
