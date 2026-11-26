import { z } from "zod";

import {
  DynamicSecretProviders,
  PlanetScalePasswordRole,
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

type TPlanetScaleInputs = Extract<
  TDynamicSecretProvider,
  { type: DynamicSecretProviders.PlanetScale }
>["inputs"];

const planetScaleInputFields = {
  serviceTokenId: z.string().trim().min(1, "Service token ID is required").max(255),
  organization: z.string().trim().min(1, "Organization is required").max(255),
  database: z.string().trim().min(1, "Database is required").max(255),
  branch: z.string().trim().min(1, "Branch is required").max(255),
  role: z.nativeEnum(PlanetScalePasswordRole)
};

const planetScaleCreateInputsSchema = z.object({
  ...planetScaleInputFields,
  serviceToken: z.string().trim().min(1, "Service token is required").max(1024)
});
// the stored service token is never sent back to the browser, so a blank token on edit keeps it
const planetScaleEditInputsSchema = z.object({
  ...planetScaleInputFields,
  serviceToken: z.string().trim().max(1024).optional()
});

export type TPlanetScaleFormValues = TDynamicSecretProviderFormValues<
  z.infer<typeof planetScaleEditInputsSchema>
>;

export const planetScaleCreateFormSchema = createDynamicSecretProviderFormSchema(
  planetScaleCreateInputsSchema
) as z.ZodType<TPlanetScaleFormValues>;

export const planetScaleEditFormSchema = editDynamicSecretProviderFormSchema(
  planetScaleEditInputsSchema
) as z.ZodType<TPlanetScaleFormValues>;

const buildInputs = ({
  serviceToken,
  ...inputs
}: TPlanetScaleFormValues["inputs"]): TPlanetScaleInputs => ({
  ...inputs,
  ...(serviceToken ? { serviceToken } : {})
});

export const getPlanetScaleCreateDefaultValues = (
  context: TCreateDynamicSecretProviderFormContext
): TPlanetScaleFormValues => ({
  name: "",
  defaultTTL: "1h",
  maxTTL: "24h",
  environment: context.isSingleEnvironmentMode ? context.environments[0] : undefined,
  usernameTemplate: DEFAULT_DYNAMIC_SECRET_USERNAME_TEMPLATE,
  inputs: {
    serviceTokenId: "",
    serviceToken: "",
    organization: "",
    database: "",
    branch: "main",
    role: PlanetScalePasswordRole.Reader
  }
});

export const getPlanetScaleEditDefaultValues = (
  context: TEditDynamicSecretProviderFormContext
): TPlanetScaleFormValues => ({
  name: context.dynamicSecret.name,
  defaultTTL: context.dynamicSecret.defaultTTL,
  maxTTL: context.dynamicSecret.maxTTL,
  usernameTemplate:
    context.dynamicSecret.usernameTemplate || DEFAULT_DYNAMIC_SECRET_USERNAME_TEMPLATE,
  inputs: { ...(context.dynamicSecret.inputs as TPlanetScaleInputs), serviceToken: "" }
});

export const getPlanetScaleCreatePayload = (
  values: TPlanetScaleFormValues,
  context: TCreateDynamicSecretProviderFormContext
): TCreateDynamicSecretProviderDTO<DynamicSecretProviders.PlanetScale> => ({
  provider: { type: DynamicSecretProviders.PlanetScale, inputs: buildInputs(values.inputs) },
  maxTTL: values.maxTTL ?? undefined,
  name: values.name,
  path: context.secretPath,
  defaultTTL: values.defaultTTL,
  projectSlug: context.projectSlug,
  environmentSlug: values.environment?.slug ?? "",
  usernameTemplate: normalizeDynamicSecretUsernameTemplateForCreate(values.usernameTemplate)
});

export const getPlanetScaleEditPayload = (
  values: TPlanetScaleFormValues,
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
