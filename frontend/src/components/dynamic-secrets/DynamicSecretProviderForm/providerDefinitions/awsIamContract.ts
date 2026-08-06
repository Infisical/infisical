import { z } from "zod";

import {
  DynamicSecretAwsIamAuth,
  DynamicSecretAwsIamCredentialType,
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

export const AWS_IAM_CUSTOM_RENDERER_REASONS = [
  "conditional-fields",
  "repeatable-fields",
  "context-aware-fields"
] as const;

const createTagsSchema = z
  .array(
    z.object({ key: z.string().trim().min(1).max(128), value: z.string().trim().min(1).max(256) })
  )
  .optional();
const editTagsSchema = z
  .array(z.object({ key: z.string().trim().min(1), value: z.string().trim().min(1) }))
  .optional();

const getCommonSchema = (tags: typeof createTagsSchema | typeof editTagsSchema) => ({
  credentialType: z
    .nativeEnum(DynamicSecretAwsIamCredentialType)
    .default(DynamicSecretAwsIamCredentialType.IamUser),
  region: z.string().trim().min(1),
  awsPath: z.string().trim().optional(),
  permissionBoundaryPolicyArn: z.string().trim().optional(),
  policyDocument: z.string().trim().optional(),
  userGroups: z.string().trim().optional(),
  policyArns: z.string().trim().optional(),
  tags
});

const getInputsSchema = (tags: typeof createTagsSchema | typeof editTagsSchema) =>
  z.discriminatedUnion("method", [
    z.object({
      method: z.literal(DynamicSecretAwsIamAuth.AccessKey),
      ...getCommonSchema(tags),
      accessKey: z.string().trim().min(1),
      secretAccessKey: z.string().trim().min(1)
    }),
    z.object({
      method: z.literal(DynamicSecretAwsIamAuth.AssumeRole),
      ...getCommonSchema(tags),
      roleArn: z.string().trim().min(1),
      sessionPolicyArns: z.string().trim().optional(),
      sessionPolicyDocument: z.string().trim().optional()
    }),
    z.object({ method: z.literal(DynamicSecretAwsIamAuth.IRSA), ...getCommonSchema(tags) })
  ]);

const createInputsSchema = getInputsSchema(createTagsSchema);
const editInputsSchema = getInputsSchema(editTagsSchema);
export type TAwsIamFormValues = TDynamicSecretProviderFormValues<
  z.infer<typeof createInputsSchema>
>;
export const awsIamCreateFormSchema = createDynamicSecretProviderFormSchema(
  createInputsSchema
) as z.ZodType<TAwsIamFormValues>;
export const awsIamEditFormSchema = editDynamicSecretProviderFormSchema(editInputsSchema, {
  usernameTemplateSchema: z.string().trim().nullable().optional()
}) as z.ZodType<TAwsIamFormValues>;

export const getAwsIamCreateDefaultValues = (
  context: TCreateDynamicSecretProviderFormContext
): TAwsIamFormValues => ({
  name: "",
  defaultTTL: "1h",
  maxTTL: "24h",
  environment: context.isSingleEnvironmentMode ? context.environments[0] : undefined,
  usernameTemplate: DEFAULT_DYNAMIC_SECRET_USERNAME_TEMPLATE,
  inputs: {
    method: DynamicSecretAwsIamAuth.AssumeRole,
    credentialType: DynamicSecretAwsIamCredentialType.IamUser,
    roleArn: "",
    region: "us-east-1",
    awsPath: "/",
    tags: []
  }
});
export const getAwsIamEditDefaultValues = (
  context: TEditDynamicSecretProviderFormContext
): TAwsIamFormValues => ({
  name: context.dynamicSecret.name,
  defaultTTL: context.dynamicSecret.defaultTTL,
  maxTTL: context.dynamicSecret.maxTTL,
  usernameTemplate:
    context.dynamicSecret.usernameTemplate || DEFAULT_DYNAMIC_SECRET_USERNAME_TEMPLATE,
  inputs: context.dynamicSecret.inputs as TAwsIamFormValues["inputs"]
});
type TAwsInputs = Extract<
  TDynamicSecretProvider,
  { type: DynamicSecretProviders.AwsIam }
>["inputs"];
const sanitize = (inputs: TAwsIamFormValues["inputs"]): TAwsInputs => {
  const isIamUser =
    inputs.credentialType !== DynamicSecretAwsIamCredentialType.TemporaryCredentials;
  const sessionSupported = !isIamUser && inputs.method === DynamicSecretAwsIamAuth.AssumeRole;
  return {
    ...inputs,
    ...(!isIamUser && { policyArns: "", policyDocument: "" }),
    ...(!sessionSupported && { sessionPolicyArns: "", sessionPolicyDocument: "" })
  } as TAwsInputs;
};
export const getAwsIamCreatePayload = (
  values: TAwsIamFormValues,
  context: TCreateDynamicSecretProviderFormContext
): TCreateDynamicSecretProviderDTO<DynamicSecretProviders.AwsIam> => ({
  provider: { type: DynamicSecretProviders.AwsIam, inputs: sanitize(values.inputs) },
  maxTTL: values.maxTTL ?? undefined,
  name: values.name,
  path: context.secretPath,
  defaultTTL: values.defaultTTL,
  projectSlug: context.projectSlug,
  environmentSlug: values.environment?.slug ?? "",
  usernameTemplate: normalizeDynamicSecretUsernameTemplateForCreate(values.usernameTemplate)
});
export const getAwsIamEditPayload = (
  values: TAwsIamFormValues,
  context: TEditDynamicSecretProviderFormContext
): TUpdateDynamicSecretDTO => ({
  name: context.dynamicSecret.name,
  path: context.secretPath,
  projectSlug: context.projectSlug,
  environmentSlug: context.environment,
  data: {
    maxTTL: values.maxTTL || undefined,
    defaultTTL: values.defaultTTL,
    inputs: sanitize(values.inputs),
    newName: values.name === context.dynamicSecret.name ? undefined : values.name,
    usernameTemplate: normalizeDynamicSecretUsernameTemplateForEdit(values.usernameTemplate)
  }
});
