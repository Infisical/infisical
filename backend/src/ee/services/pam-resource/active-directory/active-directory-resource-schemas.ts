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
import { ActiveDirectoryAccountType } from "./active-directory-resource-enums";

// Resources
const BaseActiveDirectoryResourceSchema = BasePamResourceSchema.extend({
  resourceType: z.literal(PamResource.ActiveDirectory)
});

export const ActiveDirectoryResourceListItemSchema = z.object({
  name: z.literal("Active Directory"),
  resource: z.literal(PamResource.ActiveDirectory)
});

export const ActiveDirectoryResourceConnectionDetailsSchema = z.object({
  domain: z.string().trim().min(1).max(255),
  dcAddress: z.string().trim().min(1).max(255),
  port: z.coerce.number().int().min(1).max(65535),
  useLdaps: z.boolean(),
  ldapRejectUnauthorized: z.boolean(),
  ldapCaCert: z
    .string()
    .trim()
    .transform((val) => val || undefined)
    .optional(),
  ldapTlsServerName: z
    .string()
    .trim()
    .transform((val) => val || undefined)
    .optional()
});

// Credentials (username + password for AD)
export const ActiveDirectoryAccountCredentialsSchema = z.object({
  username: z.string().trim().min(1).max(255),
  password: z.string().trim().min(1).max(255)
});

// Account metadata
export const ActiveDirectoryAccountMetadataSchema = z.object({
  accountType: z.nativeEnum(ActiveDirectoryAccountType),
  adGuid: z.string().optional(),
  displayName: z.string().optional(),
  userPrincipalName: z.string().optional(),
  servicePrincipalName: z.string().array().optional(),
  userAccountControl: z.number().optional(),
  passwordLastSet: z.string().optional(),
  lastLogon: z.string().optional()
});

export const ActiveDirectoryResourceSchema = BaseActiveDirectoryResourceSchema.extend({
  connectionDetails: ActiveDirectoryResourceConnectionDetailsSchema,
  rotationAccountCredentials: ActiveDirectoryAccountCredentialsSchema.nullable().optional()
});

export const SanitizedActiveDirectoryResourceSchema = BaseActiveDirectoryResourceSchema.extend({
  connectionDetails: ActiveDirectoryResourceConnectionDetailsSchema,
  rotationAccountCredentials: z
    .object({
      username: z.string()
    })
    .nullable()
    .optional()
});

export const CreateActiveDirectoryResourceSchema = BaseCreateGatewayPamResourceSchema.extend({
  connectionDetails: ActiveDirectoryResourceConnectionDetailsSchema,
  rotationAccountCredentials: ActiveDirectoryAccountCredentialsSchema.nullable().optional()
});

export const UpdateActiveDirectoryResourceSchema = BaseUpdateGatewayPamResourceSchema.extend({
  connectionDetails: ActiveDirectoryResourceConnectionDetailsSchema.optional(),
  rotationAccountCredentials: ActiveDirectoryAccountCredentialsSchema.nullable().optional()
});

// Accounts
export const ActiveDirectoryAccountSchema = BasePamAccountSchema.extend({
  credentials: ActiveDirectoryAccountCredentialsSchema,
  internalMetadata: ActiveDirectoryAccountMetadataSchema
});

export const CreateActiveDirectoryAccountSchema = BaseCreatePamAccountSchema.extend({
  credentials: ActiveDirectoryAccountCredentialsSchema,
  internalMetadata: ActiveDirectoryAccountMetadataSchema
});

export const UpdateActiveDirectoryAccountSchema = BaseUpdatePamAccountSchema.extend({
  credentials: ActiveDirectoryAccountCredentialsSchema.optional(),
  internalMetadata: ActiveDirectoryAccountMetadataSchema.optional()
});

export const SanitizedActiveDirectoryAccountWithResourceSchema = BasePamAccountSchemaWithResource.extend({
  resourceType: z.literal(PamResource.ActiveDirectory),
  credentials: z.object({
    username: z.string()
  }),
  internalMetadata: ActiveDirectoryAccountMetadataSchema
});

// Sessions
export const ActiveDirectorySessionCredentialsSchema = ActiveDirectoryResourceConnectionDetailsSchema.and(
  ActiveDirectoryAccountCredentialsSchema
);
