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
export const OracleResourceConnectionDetailsSchema = BaseSqlResourceConnectionDetailsSchema.extend({
  database: z
    .string()
    .trim()
    .min(1)
    .max(128)
    .regex(
      /^[a-zA-Z][a-zA-Z0-9_.#$]*$/,
      "Invalid Oracle service name: must start with a letter and contain only letters, digits, underscores, dots, # or $"
    )
});
export const OracleAccountCredentialsSchema = BaseSqlAccountCredentialsSchema;

const BaseOracleResourceSchema = BasePamResourceSchema.extend({ resourceType: z.literal(PamResource.OracleDB) });

export const OracleResourceSchema = BaseOracleResourceSchema.extend({
  connectionDetails: OracleResourceConnectionDetailsSchema,
  rotationAccountCredentials: OracleAccountCredentialsSchema.nullable().optional()
});

export const SanitizedOracleResourceSchema = BaseOracleResourceSchema.extend({
  connectionDetails: OracleResourceConnectionDetailsSchema,
  rotationAccountCredentials: OracleAccountCredentialsSchema.pick({
    username: true
  })
    .nullable()
    .optional()
});

export const OracleResourceListItemSchema = z.object({
  name: z.literal("Oracle Database"),
  resource: z.literal(PamResource.OracleDB)
});

export const CreateOracleResourceSchema = BaseCreateGatewayPamResourceSchema.extend({
  connectionDetails: OracleResourceConnectionDetailsSchema,
  rotationAccountCredentials: OracleAccountCredentialsSchema.nullable().optional()
});

export const UpdateOracleResourceSchema = BaseUpdateGatewayPamResourceSchema.extend({
  connectionDetails: OracleResourceConnectionDetailsSchema.optional(),
  rotationAccountCredentials: OracleAccountCredentialsSchema.nullable().optional()
});

// Accounts
export const OracleAccountSchema = BasePamAccountSchema.extend({
  credentials: OracleAccountCredentialsSchema
});

export const CreateOracleAccountSchema = BaseCreatePamAccountSchema.extend({
  credentials: OracleAccountCredentialsSchema
});

export const UpdateOracleAccountSchema = BaseUpdatePamAccountSchema.extend({
  credentials: OracleAccountCredentialsSchema.optional()
});

export const SanitizedOracleAccountWithResourceSchema = BasePamAccountSchemaWithResource.extend({
  parentType: z.literal(PamResource.OracleDB),
  credentials: OracleAccountCredentialsSchema.pick({
    username: true
  })
});

// Sessions
export const OracleSessionCredentialsSchema = OracleResourceConnectionDetailsSchema.and(OracleAccountCredentialsSchema);
