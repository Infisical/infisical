import { z } from "zod";

import { PamResource } from "../pam-resource-enums";
import {
  BaseCreatePamAccountSchema,
  BaseCreatePamResourceSchema,
  BasePamAccountSchema,
  BasePamAccountSchemaWithResource,
  BasePamResourceSchema,
  BaseUpdatePamAccountSchema,
  BaseUpdatePamResourceSchema
} from "../pam-resource-schemas";
import {
  BaseSqlAccountCredentialsSchema,
  BaseSqlResourceConnectionDetailsSchema
} from "../shared/sql/sql-resource-schemas";

// Resources
export const PostgresResourceConnectionDetailsSchema = BaseSqlResourceConnectionDetailsSchema;

const BasePostgresResourceSchema = BasePamResourceSchema.extend({ resourceType: z.literal(PamResource.Postgres) });

export const PostgresResourceSchema = BasePostgresResourceSchema.extend({
  connectionDetails: PostgresResourceConnectionDetailsSchema
});

export const PostgresResourceListItemSchema = z.object({
  name: z.literal("PostgreSQL"),
  resource: z.literal(PamResource.Postgres)
});

export const CreatePostgresResourceSchema = BaseCreatePamResourceSchema.extend({
  connectionDetails: PostgresResourceConnectionDetailsSchema
});

export const UpdatePostgresResourceSchema = BaseUpdatePamResourceSchema.extend({
  connectionDetails: PostgresResourceConnectionDetailsSchema.optional()
});

// Accounts
export const PostgresAccountCredentialsSchema = BaseSqlAccountCredentialsSchema;

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
