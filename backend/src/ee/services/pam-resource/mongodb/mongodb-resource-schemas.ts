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
import { BaseSqlResourceConnectionDetailsSchema } from "../shared/sql/sql-resource-schemas";

// Resources
export const MongoDBResourceConnectionDetailsSchema = BaseSqlResourceConnectionDetailsSchema;

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
