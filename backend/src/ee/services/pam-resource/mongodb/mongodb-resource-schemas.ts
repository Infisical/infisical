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
// MongoDB uses its own connection schema. The host field accepts a MongoDB URI
// (mongodb+srv://... or mongodb://...), a bare SRV hostname, host:port, or
// comma-separated replica set hosts. Port is embedded in the host field.
export const MongoDBResourceConnectionDetailsSchema = z.object({
  host: z.string().trim().min(1).max(1024),
  database: z.string().trim().min(1).max(255),
  sslEnabled: z.boolean(),
  sslRejectUnauthorized: z.boolean(),
  sslCertificate: z
    .string()
    .trim()
    .transform((value) => value || undefined)
    .optional()
});

export const MongoDBAccountCredentialsSchema = z.object({
  username: z.string().trim().min(1).max(256, "Username must be 256 characters or less"),
  password: z.string().max(256, "Password must be 256 characters or less")
});

const BaseMongoDBResourceSchema = BasePamResourceSchema.extend({ resourceType: z.literal(PamResource.MongoDB) });

export const MongoDBResourceSchema = BaseMongoDBResourceSchema.extend({
  connectionDetails: MongoDBResourceConnectionDetailsSchema,
  rotationAccountCredentials: MongoDBAccountCredentialsSchema.nullable().optional()
});

export const SanitizedMongoDBResourceSchema = BaseMongoDBResourceSchema.extend({
  connectionDetails: MongoDBResourceConnectionDetailsSchema,
  rotationAccountCredentials: MongoDBAccountCredentialsSchema.pick({
    username: true
  })
    .nullable()
    .optional()
});

export const MongoDBResourceListItemSchema = z.object({
  name: z.literal("MongoDB"),
  resource: z.literal(PamResource.MongoDB)
});

export const CreateMongoDBResourceSchema = BaseCreateGatewayPamResourceSchema.extend({
  connectionDetails: MongoDBResourceConnectionDetailsSchema,
  rotationAccountCredentials: MongoDBAccountCredentialsSchema.nullable().optional()
});

export const UpdateMongoDBResourceSchema = BaseUpdateGatewayPamResourceSchema.extend({
  connectionDetails: MongoDBResourceConnectionDetailsSchema.optional(),
  rotationAccountCredentials: MongoDBAccountCredentialsSchema.nullable().optional()
});

// Accounts
export const MongoDBAccountSchema = BasePamAccountSchema.extend({
  credentials: MongoDBAccountCredentialsSchema
});

export const CreateMongoDBAccountSchema = BaseCreatePamAccountSchema.extend({
  credentials: MongoDBAccountCredentialsSchema
});

export const UpdateMongoDBAccountSchema = BaseUpdatePamAccountSchema.extend({
  credentials: MongoDBAccountCredentialsSchema.optional()
});

export const SanitizedMongoDBAccountWithResourceSchema = BasePamAccountSchemaWithResource.extend({
  resourceType: z.literal(PamResource.MongoDB),
  credentials: MongoDBAccountCredentialsSchema.pick({
    username: true
  })
});

// Sessions
export const MongoDBSessionCredentialsSchema = MongoDBResourceConnectionDetailsSchema.and(
  MongoDBAccountCredentialsSchema
);
