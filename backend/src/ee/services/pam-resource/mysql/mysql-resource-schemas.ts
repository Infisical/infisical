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

// Resources
export const MySQLResourceConnectionDetailsSchema = BaseSqlResourceConnectionDetailsSchema.extend({
  // MySQL db in many cases the db will not be provided when making connection
  database: z.string().trim()
});
export const MySQLAccountCredentialsSchema = BaseSqlAccountCredentialsSchema;

const BaseMySQLResourceSchema = BasePamResourceSchema.extend({ resourceType: z.literal(PamResource.MySQL) });

export const MySQLResourceSchema = BaseMySQLResourceSchema.extend({
  connectionDetails: MySQLResourceConnectionDetailsSchema,
  rotationAccountCredentials: MySQLAccountCredentialsSchema.nullable().optional()
});

export const SanitizedMySQLResourceSchema = BaseMySQLResourceSchema.extend({
  connectionDetails: MySQLResourceConnectionDetailsSchema,
  rotationAccountCredentials: MySQLAccountCredentialsSchema.pick({
    username: true
  })
    .nullable()
    .optional()
});

export const MySQLResourceListItemSchema = z.object({
  name: z.literal("MySQL"),
  resource: z.literal(PamResource.MySQL)
});

export const CreateMySQLResourceSchema = BaseCreateGatewayPamResourceSchema.extend({
  connectionDetails: MySQLResourceConnectionDetailsSchema,
  rotationAccountCredentials: MySQLAccountCredentialsSchema.nullable().optional()
});

export const UpdateMySQLResourceSchema = BaseUpdateGatewayPamResourceSchema.extend({
  connectionDetails: MySQLResourceConnectionDetailsSchema.optional(),
  rotationAccountCredentials: MySQLAccountCredentialsSchema.nullable().optional()
});

// Accounts
export const MySQLAccountSchema = BasePamAccountSchema.extend({
  credentials: MySQLAccountCredentialsSchema
});

export const CreateMySQLAccountSchema = BaseCreatePamAccountSchema.extend({
  credentials: MySQLAccountCredentialsSchema
});

export const UpdateMySQLAccountSchema = BaseUpdatePamAccountSchema.extend({
  credentials: MySQLAccountCredentialsSchema.optional()
});

export const SanitizedMySQLAccountWithResourceSchema = BasePamAccountSchemaWithResource.extend({
  credentials: MySQLAccountCredentialsSchema.pick({
    username: true
  })
});

// Sessions
export const MySQLSessionCredentialsSchema = MySQLResourceConnectionDetailsSchema.and(MySQLAccountCredentialsSchema);
