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
  authMethod: z.literal(MsSqlAuthMethod.SqlLogin).default(MsSqlAuthMethod.SqlLogin),
  username: z.string().trim().min(1).max(63),
  password: z.string().trim().min(1).max(256)
});

const MsSQLNtlmCredentialsSchema = z.object({
  authMethod: z.literal(MsSqlAuthMethod.Ntlm),
  username: z.string().trim().min(1).max(63),
  password: z.string().trim().min(1).max(256),
  domain: z.string().trim().min(1, "Domain is required for NTLM authentication").max(255)
});

const MsSQLKerberosCredentialsSchema = z.object({
  authMethod: z.literal(MsSqlAuthMethod.Kerberos),
  username: z.string().trim().min(1).max(63),
  password: z.string().trim().min(1).max(256),
  realm: z
    .string()
    .trim()
    .min(1, "Realm is required for Kerberos")
    .max(255)
    .regex(/^[A-Za-z0-9._-]+$/, "Realm must contain only letters, numbers, dots, hyphens")
    .transform((v) => v.toUpperCase()),
  kdcAddress: z
    .string()
    .trim()
    .max(255)
    .regex(/^[A-Za-z0-9._:-]*$/, "KDC address must be a hostname or IP with optional port")
    .transform((v) => v || undefined)
    .optional(),
  spn: z
    .string()
    .trim()
    .min(1, "SPN is required for Kerberos")
    .max(500)
    .regex(/^[A-Za-z0-9._:/-]+$/, "SPN must contain only letters, numbers, dots, colons, slashes, hyphens")
});

// z.union so old accounts without authMethod fall through to the sql-login .default()
export const MsSQLAccountCredentialsSchema = z.union([
  MsSQLKerberosCredentialsSchema,
  MsSQLNtlmCredentialsSchema,
  MsSQLSqlLoginCredentialsSchema
]);

const BaseMsSQLResourceSchema = BasePamResourceSchema.extend({ resourceType: z.literal(PamResource.MsSQL) });

export const MsSQLResourceSchema = BaseMsSQLResourceSchema.extend({
  connectionDetails: MsSQLResourceConnectionDetailsSchema,
  rotationAccountCredentials: MsSQLAccountCredentialsSchema.nullable().optional()
});

const SanitizedMsSQLCredentialsSchema = z.union([
  z.object({
    authMethod: z.literal(MsSqlAuthMethod.Kerberos),
    username: z.string(),
    realm: z.string(),
    kdcAddress: z.string().optional(),
    spn: z.string()
  }),
  z.object({ authMethod: z.literal(MsSqlAuthMethod.Ntlm), username: z.string(), domain: z.string() }),
  z.object({ authMethod: z.literal(MsSqlAuthMethod.SqlLogin).default(MsSqlAuthMethod.SqlLogin), username: z.string() })
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

// Strict variants (no .default()/.transform()) — prevents cross-resource false matches in SessionCredentialsSchema
const MsSQLStrictSqlLoginCredentialsSchema = z.object({
  authMethod: z.literal(MsSqlAuthMethod.SqlLogin),
  username: z.string().trim().min(1).max(63),
  password: z.string().trim().min(1).max(256)
});

const MsSQLStrictKerberosCredentialsSchema = z.object({
  authMethod: z.literal(MsSqlAuthMethod.Kerberos),
  username: z.string().trim().min(1).max(63),
  password: z.string().trim().min(1).max(256),
  realm: z.string().trim().min(1).max(255),
  kdcAddress: z.string().trim().max(255).optional(),
  spn: z.string().trim().min(1).max(500)
});

export const MsSQLSessionCredentialsSchema = z.union([
  MsSQLResourceConnectionDetailsSchema.and(MsSQLStrictKerberosCredentialsSchema),
  MsSQLResourceConnectionDetailsSchema.and(MsSQLNtlmCredentialsSchema),
  MsSQLResourceConnectionDetailsSchema.and(MsSQLStrictSqlLoginCredentialsSchema)
]);
