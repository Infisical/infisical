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
import { MsSqlAuthMethod } from "./mssql-resource-enums";

export { MsSqlAuthMethod };

// Resources
export const MsSQLResourceConnectionDetailsSchema = BaseSqlResourceConnectionDetailsSchema;

const MsSQLSqlLoginCredentialsSchema = z.object({
  authMethod: z.literal(MsSqlAuthMethod.SqlLogin),
  username: z.string().trim().min(1).max(63),
  password: z.string().trim().min(1).max(256)
});

const MsSQLNtlmCredentialsSchema = z.object({
  authMethod: z.literal(MsSqlAuthMethod.Ntlm),
  username: z.string().trim().min(1).max(63),
  password: z.string().trim().min(1).max(256),
  domain: z.string().trim().min(1, "Domain is required for NTLM authentication").max(255)
});

export const MsSQLAccountCredentialsSchema = z.discriminatedUnion("authMethod", [
  MsSQLSqlLoginCredentialsSchema,
  MsSQLNtlmCredentialsSchema
]);

const BaseMsSQLResourceSchema = BasePamResourceSchema.extend({ resourceType: z.literal(PamResource.MsSQL) });

export const MsSQLResourceSchema = BaseMsSQLResourceSchema.extend({
  connectionDetails: MsSQLResourceConnectionDetailsSchema,
  rotationAccountCredentials: MsSQLAccountCredentialsSchema.nullable().optional()
});

const SanitizedMsSQLCredentialsSchema = z.discriminatedUnion("authMethod", [
  z.object({ authMethod: z.literal(MsSqlAuthMethod.SqlLogin), username: z.string() }),
  z.object({ authMethod: z.literal(MsSqlAuthMethod.Ntlm), username: z.string(), domain: z.string() })
]);

export const SanitizedMsSQLResourceSchema = BaseMsSQLResourceSchema.extend({
  connectionDetails: MsSQLResourceConnectionDetailsSchema,
  rotationAccountCredentials: SanitizedMsSQLCredentialsSchema.nullable().optional()
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
  credentials: SanitizedMsSQLCredentialsSchema
});

// Sessions
export const MsSQLSessionCredentialsSchema = z.union([
  MsSQLResourceConnectionDetailsSchema.and(MsSQLSqlLoginCredentialsSchema),
  MsSQLResourceConnectionDetailsSchema.and(MsSQLNtlmCredentialsSchema)
]);
