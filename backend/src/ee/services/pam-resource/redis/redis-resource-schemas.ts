import { z } from "zod";

import { PamResource } from "../pam-resource-enums";
import {
  BaseCreateGatewayPamResourceSchema,
  BaseCreatePamAccountSchema,
  BasePamAccountSchema,
  BasePamAccountSchemaWithResource,
  BasePamResourceSchema,
  BaseUpdateGatewayPamResourceSchema,
  BaseUpdatePamAccountSchema
} from "../pam-resource-schemas";

// Resources
export const RedisResourceConnectionDetailsSchema = z.object({
  host: z.string().trim().min(1).max(255),
  port: z.coerce.number(),
  sslEnabled: z.boolean(),
  sslRejectUnauthorized: z.boolean(),
  sslCertificate: z
    .string()
    .trim()
    .transform((value) => value || undefined)
    .optional()
});

export const RedisAccountCredentialsSchema = z.object({
  username: z
    .string()
    .trim()
    .max(256, "Username must be 256 characters or less")
    .transform((value) => (value === "" ? undefined : value))
    .optional(),
  password: z
    .string()
    .max(256, "Password must be 256 characters or less")
    .transform((value) => (value === "" ? undefined : value))
    .optional()
});

const BaseRedisResourceSchema = BasePamResourceSchema.extend({ resourceType: z.literal(PamResource.Redis) });

export const RedisResourceSchema = BaseRedisResourceSchema.extend({
  connectionDetails: RedisResourceConnectionDetailsSchema,
  rotationAccountCredentials: RedisAccountCredentialsSchema.nullable().optional()
});

export const SanitizedRedisResourceSchema = BaseRedisResourceSchema.extend({
  connectionDetails: RedisResourceConnectionDetailsSchema,
  rotationAccountCredentials: RedisAccountCredentialsSchema.pick({
    username: true
  })
    .nullable()
    .optional()
});

export const RedisResourceListItemSchema = z.object({
  name: z.literal("Redis"),
  resource: z.literal(PamResource.Redis)
});

export const CreateRedisResourceSchema = BaseCreateGatewayPamResourceSchema.extend({
  connectionDetails: RedisResourceConnectionDetailsSchema,
  rotationAccountCredentials: RedisAccountCredentialsSchema.nullable().optional()
});

export const UpdateRedisResourceSchema = BaseUpdateGatewayPamResourceSchema.extend({
  connectionDetails: RedisResourceConnectionDetailsSchema.optional(),
  rotationAccountCredentials: RedisAccountCredentialsSchema.nullable().optional()
});

// Accounts
export const RedisAccountSchema = BasePamAccountSchema.extend({
  credentials: RedisAccountCredentialsSchema
});

export const CreateRedisAccountSchema = BaseCreatePamAccountSchema.extend({
  credentials: RedisAccountCredentialsSchema
});

export const UpdateRedisAccountSchema = BaseUpdatePamAccountSchema.extend({
  credentials: RedisAccountCredentialsSchema.optional()
});

export const SanitizedRedisAccountWithResourceSchema = BasePamAccountSchemaWithResource.extend({
  resourceType: z.literal(PamResource.Redis),
  credentials: RedisAccountCredentialsSchema.pick({
    username: true
  })
});

// Sessions
export const RedisSessionCredentialsSchema = RedisResourceConnectionDetailsSchema.and(RedisAccountCredentialsSchema);
