import { z } from "zod";

import {
  BaseCreatePamAccountSchema,
  BasePamAccountSchema,
  BasePamAccountSchemaWithResource,
  BaseUpdatePamAccountSchema
} from "../../pam-resource/pam-resource-schemas";
import { PamDomainType } from "../pam-domain-enums";
import { ActiveDirectoryAccountType } from "./active-directory-domain-enums";

export const ActiveDirectoryConnectionDetailsSchema = z.object({
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

export const ActiveDirectoryAccountCredentialsSchema = z.object({
  username: z.string().trim().min(1).max(255),
  password: z.string().trim().min(1).max(255)
});

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

export const ActiveDirectoryAccountSchema = BasePamAccountSchema.extend({
  credentials: ActiveDirectoryAccountCredentialsSchema,
  internalMetadata: ActiveDirectoryAccountMetadataSchema
});

export const CreateActiveDirectoryAccountSchema = BaseCreatePamAccountSchema.omit({ resourceId: true }).extend({
  domainId: z.string().uuid(),
  credentials: ActiveDirectoryAccountCredentialsSchema,
  internalMetadata: ActiveDirectoryAccountMetadataSchema
});

export const UpdateActiveDirectoryAccountSchema = BaseUpdatePamAccountSchema.extend({
  credentials: ActiveDirectoryAccountCredentialsSchema.optional(),
  internalMetadata: ActiveDirectoryAccountMetadataSchema.optional()
});

export const SanitizedActiveDirectoryAccountWithDomainSchema = BasePamAccountSchemaWithResource.extend({
  parentType: z.literal(PamDomainType.ActiveDirectory),
  credentials: z.object({
    username: z.string()
  }),
  internalMetadata: ActiveDirectoryAccountMetadataSchema
});

export const ActiveDirectorySessionCredentialsSchema = ActiveDirectoryConnectionDetailsSchema.and(
  ActiveDirectoryAccountCredentialsSchema
);
