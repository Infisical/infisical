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
import {
  BaseSqlAccountCredentialsSchema,
  BaseSqlResourceConnectionDetailsSchema
} from "../shared/sql/sql-resource-schemas";

export const PostgresResourceConnectionDetailsSchema = BaseSqlResourceConnectionDetailsSchema;
export const PostgresAccountCredentialsSchema = BaseSqlAccountCredentialsSchema;

// Resources
const BasePostgresResourceSchema = BasePamResourceSchema.extend({ resourceType: z.literal(PamResource.Postgres) });

export const PostgresResourceSchema = BasePostgresResourceSchema.extend({
  connectionDetails: PostgresResourceConnectionDetailsSchema,
  rotationAccountCredentials: PostgresAccountCredentialsSchema.nullable().optional()
});

export const SanitizedPostgresResourceSchema = BasePostgresResourceSchema.extend({
  connectionDetails: PostgresResourceConnectionDetailsSchema,
  rotationAccountCredentials: PostgresAccountCredentialsSchema.pick({
    username: true
  })
    .nullable()
    .optional()
});

export const PostgresResourceListItemSchema = z.object({
  name: z.literal("PostgreSQL"),
  resource: z.literal(PamResource.Postgres)
});

export const CreatePostgresResourceSchema = BaseCreateGatewayPamResourceSchema.extend({
  connectionDetails: PostgresResourceConnectionDetailsSchema,
  rotationAccountCredentials: PostgresAccountCredentialsSchema.nullable().optional()
});

export const UpdatePostgresResourceSchema = BaseUpdateGatewayPamResourceSchema.extend({
  connectionDetails: PostgresResourceConnectionDetailsSchema.optional(),
  rotationAccountCredentials: PostgresAccountCredentialsSchema.nullable().optional()
});

// Accounts
export const PostgresAccountSchema = BasePamAccountSchema.extend({
  credentials: PostgresAccountCredentialsSchema
});

export const CreatePostgresAccountSchema = BaseCreatePamAccountSchema.extend({
  credentials: PostgresAccountCredentialsSchema
});

export const UpdatePostgresAccountSchema = BaseUpdatePamAccountSchema.extend({
  credentials: PostgresAccountCredentialsSchema.optional()
});

export const SanitizedPostgresAccountWithResourceSchema = BasePamAccountSchemaWithResource.extend({
  credentials: PostgresAccountCredentialsSchema.pick({
    username: true
  })
});

// Sessions
export const PostgresSessionCredentialsSchema = PostgresResourceConnectionDetailsSchema.and(
  PostgresAccountCredentialsSchema
);
