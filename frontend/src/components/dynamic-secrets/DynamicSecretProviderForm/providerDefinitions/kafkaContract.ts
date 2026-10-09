import { z } from "zod";

import {
  DynamicSecretProviders,
  KafkaAclOperation,
  KafkaAclPatternType,
  KafkaAclPermissionType,
  KafkaAclResourceType,
  KafkaSaslMechanism,
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

export const KAFKA_CUSTOM_RENDERER_REASONS = ["repeatable-fields", "non-scalar-value"] as const;

const aclSchema = z.object({
  resourceType: z.nativeEnum(KafkaAclResourceType),
  patternType: z.nativeEnum(KafkaAclPatternType),
  resourceName: z.string().trim().min(1, "Resource name is required"),
  operation: z.nativeEnum(KafkaAclOperation),
  permissionType: z.nativeEnum(KafkaAclPermissionType)
});

const PORT_RANGE_MESSAGE = "Port must be a whole number from 1 to 65535";

const bootstrapServerSchema = z.object({
  host: z.string().trim().min(1, "Host is required"),
  port: z.coerce
    .number()
    .int(PORT_RANGE_MESSAGE)
    .min(1, PORT_RANGE_MESSAGE)
    .max(65535, PORT_RANGE_MESSAGE)
});

export const kafkaCreateInputsSchema = z.object({
  bootstrapServers: z
    .array(bootstrapServerSchema)
    .min(1, "At least one bootstrap server is required"),
  saslMechanism: z.nativeEnum(KafkaSaslMechanism),
  username: z.string().trim().min(1),
  password: z.string().min(1),
  acls: z.array(aclSchema).min(1, "At least one ACL is required"),
  sslEnabled: z.boolean().default(false),
  ca: z.string().max(10240).optional(),
  sslRejectUnauthorized: z.boolean().default(true)
});

export const kafkaEditInputsSchema = kafkaCreateInputsSchema.extend({
  sslEnabled: z.boolean().optional(),
  sslRejectUnauthorized: z.boolean().optional()
});

export type TKafkaFormInputs = z.input<typeof kafkaCreateInputsSchema>;
export type TKafkaFormValues = TDynamicSecretProviderFormValues<TKafkaFormInputs>;

export const kafkaCreateFormSchema = createDynamicSecretProviderFormSchema(
  kafkaCreateInputsSchema
) as z.ZodType<TKafkaFormValues>;
export const kafkaEditFormSchema = editDynamicSecretProviderFormSchema(kafkaEditInputsSchema, {
  usernameTemplateSchema: z.string().trim().nullable().optional()
}) as z.ZodType<TKafkaFormValues>;

export const getDefaultKafkaBootstrapServer = (): TKafkaFormInputs["bootstrapServers"][number] => ({
  host: "",
  port: 9092
});

export const getDefaultKafkaAcl = (): TKafkaFormInputs["acls"][number] => ({
  resourceType: KafkaAclResourceType.Topic,
  patternType: KafkaAclPatternType.Literal,
  resourceName: "",
  operation: KafkaAclOperation.Read,
  permissionType: KafkaAclPermissionType.Allow
});

export const getKafkaCreateDefaultValues = (
  context: TCreateDynamicSecretProviderFormContext
): TKafkaFormValues => ({
  name: "",
  defaultTTL: "1h",
  maxTTL: "24h",
  environment: context.isSingleEnvironmentMode ? context.environments[0] : undefined,
  usernameTemplate: DEFAULT_DYNAMIC_SECRET_USERNAME_TEMPLATE,
  inputs: {
    bootstrapServers: [getDefaultKafkaBootstrapServer()],
    saslMechanism: KafkaSaslMechanism.ScramSha512,
    username: "",
    password: "",
    acls: [getDefaultKafkaAcl()],
    sslEnabled: false,
    ca: "",
    sslRejectUnauthorized: true
  }
});

export const getKafkaEditDefaultValues = (
  context: TEditDynamicSecretProviderFormContext
): TKafkaFormValues => ({
  name: context.dynamicSecret.name,
  defaultTTL: context.dynamicSecret.defaultTTL,
  maxTTL: context.dynamicSecret.maxTTL,
  usernameTemplate:
    context.dynamicSecret.usernameTemplate || DEFAULT_DYNAMIC_SECRET_USERNAME_TEMPLATE,
  inputs: { ...(context.dynamicSecret.inputs as TKafkaFormInputs) }
});

export const getKafkaCreatePayload = (
  values: TKafkaFormValues,
  context: TCreateDynamicSecretProviderFormContext
): TCreateDynamicSecretProviderDTO<DynamicSecretProviders.Kafka> => ({
  provider: {
    type: DynamicSecretProviders.Kafka,
    inputs: kafkaCreateInputsSchema.parse(values.inputs)
  },
  maxTTL: values.maxTTL ?? undefined,
  name: values.name,
  path: context.secretPath,
  defaultTTL: values.defaultTTL,
  projectSlug: context.projectSlug,
  environmentSlug: values.environment?.slug ?? "",
  usernameTemplate: normalizeDynamicSecretUsernameTemplateForCreate(values.usernameTemplate)
});

export const getKafkaEditPayload = (
  values: TKafkaFormValues,
  context: TEditDynamicSecretProviderFormContext
): TUpdateDynamicSecretDTO => ({
  name: context.dynamicSecret.name,
  path: context.secretPath,
  projectSlug: context.projectSlug,
  environmentSlug: context.environment,
  data: {
    maxTTL: values.maxTTL || undefined,
    defaultTTL: values.defaultTTL,
    inputs: kafkaEditInputsSchema.parse(values.inputs),
    newName: values.name === context.dynamicSecret.name ? undefined : values.name,
    usernameTemplate: normalizeDynamicSecretUsernameTemplateForEdit(values.usernameTemplate)
  }
});
