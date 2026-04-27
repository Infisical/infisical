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
export const MsSQLResourceConnectionDetailsSchema = BaseSqlResourceConnectionDetailsSchema;
export const MsSQLAccountCredentialsSchema = BaseSqlAccountCredentialsSchema;

const BaseMsSQLResourceSchema = BasePamResourceSchema.extend({ resourceType: z.literal(PamResource.MsSQL) });

export const MsSQLResourceSchema = BaseMsSQLResourceSchema.extend({
  connectionDetails: MsSQLResourceConnectionDetailsSchema,
  rotationAccountCredentials: MsSQLAccountCredentialsSchema.nullable().optional()
});

export const SanitizedMsSQLResourceSchema = BaseMsSQLResourceSchema.extend({
  connectionDetails: MsSQLResourceConnectionDetailsSchema,
  rotationAccountCredentials: MsSQLAccountCredentialsSchema.pick({
    username: true
  })
    .nullable()
    .optional()
});

export const MsSQLResourceListItemSchema = z.object({
  name: z.literal("Microsoft SQL Server"),
  resource: z.literal(PamResource.MsSQL)
});

export const CreateMsSQLResourceSchema = BaseCreateGatewayPamResourceSchema.extend({
  connectionDetails: MsSQLResourceConnectionDetailsSchema,
  rotationAccountCredentials: MsSQLAccountCredentialsSchema.nullable().optional()
});

export const UpdateMsSQLResourceSchema = BaseUpdateGatewayPamResourceSchema.extend({
  connectionDetails: MsSQLResourceConnectionDetailsSchema.optional(),
  rotationAccountCredentials: MsSQLAccountCredentialsSchema.nullable().optional()
});

// Accounts
export const MsSQLAccountSchema = BasePamAccountSchema.extend({
  credentials: MsSQLAccountCredentialsSchema
});

export const CreateMsSQLAccountSchema = BaseCreatePamAccountSchema.extend({
  credentials: MsSQLAccountCredentialsSchema
});

export const UpdateMsSQLAccountSchema = BaseUpdatePamAccountSchema.extend({
  credentials: MsSQLAccountCredentialsSchema.optional()
});

export const SanitizedMsSQLAccountWithResourceSchema = BasePamAccountSchemaWithResource.extend({
  parentType: z.literal(PamResource.MsSQL),
  credentials: MsSQLAccountCredentialsSchema.pick({
    username: true
  })
});

// Sessions
export const MsSQLSessionCredentialsSchema = MsSQLResourceConnectionDetailsSchema.and(MsSQLAccountCredentialsSchema);
