import { z } from "zod";

import {
  DynamicSecretProviders,
  TUpdateDynamicSecretDTO
} from "@app/hooks/api/dynamicSecret/types";
import { slugSchema } from "@app/lib/schemas";

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

const selectedUserSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  email: z.string().min(1)
});
const createInputsSchema = z.object({
  tenantId: z.string().min(1),
  applicationId: z.string().min(1),
  clientSecret: z.string().min(1)
});
const editInputsSchema = z.object({
  email: z.string(),
  userId: z.string(),
  tenantId: z.string(),
  applicationId: z.string(),
  clientSecret: z.string()
});

export type TAzureEntraIdCreateValues = TDynamicSecretProviderFormValues<
  z.infer<typeof createInputsSchema>
> & { selectedUsers: z.infer<typeof selectedUserSchema>[] };
export type TAzureEntraIdEditValues = TDynamicSecretProviderFormValues<
  z.infer<typeof editInputsSchema>
>;

export const azureEntraIdCreateFormSchema = createDynamicSecretProviderFormSchema(
  createInputsSchema
).extend({
  name: z
    .string()
    .min(1)
    .refine((value) => value.toLowerCase() === value, "Must be lowercase"),
  selectedUsers: selectedUserSchema.array()
}) as z.ZodType<TAzureEntraIdCreateValues>;

export const azureEntraIdEditFormSchema = editDynamicSecretProviderFormSchema(
  editInputsSchema
).extend({ name: slugSchema().optional().default("") }) as z.ZodType<TAzureEntraIdEditValues>;

export const getAzureEntraIdCreateDefaultValues = (
  context: TCreateDynamicSecretProviderFormContext
): TAzureEntraIdCreateValues => ({
  name: "",
  defaultTTL: "1h",
  maxTTL: "24h",
  environment: context.isSingleEnvironmentMode ? context.environments[0] : undefined,
  selectedUsers: [],
  inputs: { tenantId: "", applicationId: "", clientSecret: "" }
});

export const getAzureEntraIdEditDefaultValues = (
  context: TEditDynamicSecretProviderFormContext
): TAzureEntraIdEditValues => ({
  name: context.dynamicSecret.name,
  defaultTTL: context.dynamicSecret.defaultTTL,
  maxTTL: context.dynamicSecret.maxTTL,
  inputs: editInputsSchema.parse(context.dynamicSecret.inputs)
});

export const getAzureEntraIdCreatePayload = (
  values: TAzureEntraIdCreateValues,
  context: TCreateDynamicSecretProviderFormContext
): readonly TCreateDynamicSecretProviderDTO<DynamicSecretProviders.AzureEntraId>[] =>
  values.selectedUsers.map((user) => ({
    provider: {
      type: DynamicSecretProviders.AzureEntraId,
      inputs: { ...values.inputs, userId: user.id, email: user.email }
    },
    maxTTL: values.maxTTL ?? undefined,
    name: `${values.name}-${user.name}`,
    path: context.secretPath,
    defaultTTL: values.defaultTTL,
    projectSlug: context.projectSlug,
    environmentSlug: values.environment?.slug ?? ""
  }));

export const getAzureEntraIdEditPayload = (
  values: TAzureEntraIdEditValues,
  context: TEditDynamicSecretProviderFormContext
): TUpdateDynamicSecretDTO => ({
  name: context.dynamicSecret.name,
  path: context.secretPath,
  projectSlug: context.projectSlug,
  environmentSlug: context.environment,
  data: {
    maxTTL: values.maxTTL || undefined,
    defaultTTL: values.defaultTTL,
    newName: values.name === context.dynamicSecret.name ? undefined : values.name,
    inputs: values.inputs
  }
});
