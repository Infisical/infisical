import { z } from "zod";

import { AppConnections } from "@app/lib/api-docs";
import {
  SMB_VALIDATION_LIMITS,
  validateDomain,
  validateHostname,
  validateSmbPassword,
  validateWindowsUsername
} from "@app/lib/validator/validate-smb";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  BaseAppConnectionSchema,
  GenericCreateAppConnectionFieldsSchema,
  GenericUpdateAppConnectionFieldsSchema
} from "@app/services/app-connection/app-connection-schemas";

import { APP_CONNECTION_NAME_MAP } from "../app-connection-maps";
import { SmbConnectionMethod } from "./smb-connection-enums";

export const SmbConnectionCredentialsSchema = z.object({
  host: z
    .string()
    .trim()
    .min(1, "Host required")
    .max(SMB_VALIDATION_LIMITS.MAX_HOST_LENGTH, "Host too long")
    .refine((val) => validateHostname(val), {
      message: "Host can only contain alphanumeric characters, dots, and hyphens"
    })
    .refine((val) => !val.startsWith("-") && !val.startsWith("."), {
      message: "Host cannot start with a hyphen or period"
    })
    .describe(AppConnections.CREDENTIALS.SMB.host),
  port: z.coerce.number().int().min(1).max(65535).describe(AppConnections.CREDENTIALS.SMB.port),
  domain: z
    .string()
    .trim()
    .max(SMB_VALIDATION_LIMITS.MAX_DOMAIN_LENGTH, "Domain too long")
    .refine((val) => val === "" || validateDomain(val), {
      message: "Domain can only contain alphanumeric characters, dots, hyphens, and underscores"
    })
    .refine((val) => val === "" || (!val.startsWith("-") && !val.startsWith(".")), {
      message: "Domain cannot start with a hyphen or period"
    })
    .optional()
    .describe(AppConnections.CREDENTIALS.SMB.domain),
  username: z
    .string()
    .trim()
    .min(1, "Username required")
    .max(SMB_VALIDATION_LIMITS.MAX_ADMIN_USERNAME_LENGTH, "Username too long")
    .refine((val) => validateWindowsUsername(val), {
      message: "Username can only contain alphanumeric characters, underscores, hyphens, and periods"
    })
    .refine((val) => !val.startsWith("-") && !val.startsWith(".") && !val.endsWith("."), {
      message: "Username cannot start with a hyphen or period, and cannot end with a period"
    })
    .describe(AppConnections.CREDENTIALS.SMB.username),
  password: z
    .string()
    .min(1, "Password required")
    .refine((val) => validateSmbPassword(val), {
      message: "Password cannot contain: semicolons, spaces, quotes, or pipes"
    })
    .describe(AppConnections.CREDENTIALS.SMB.password)
});

// Validation schema for credentials
export const ValidateSmbConnectionCredentialsSchema = z.object({
  method: z.literal(SmbConnectionMethod.Credentials).describe(AppConnections.CREATE(AppConnection.SMB).method),
  credentials: SmbConnectionCredentialsSchema.describe(AppConnections.CREATE(AppConnection.SMB).credentials)
});

// Create connection schema
export const CreateSmbConnectionSchema = ValidateSmbConnectionCredentialsSchema.and(
  GenericCreateAppConnectionFieldsSchema(AppConnection.SMB, {
    supportsGateways: true
  })
);

// Update connection schema
export const UpdateSmbConnectionSchema = z
  .object({
    credentials: SmbConnectionCredentialsSchema.optional().describe(
      AppConnections.UPDATE(AppConnection.SMB).credentials
    )
  })
  .and(
    GenericUpdateAppConnectionFieldsSchema(AppConnection.SMB, {
      supportsGateways: true
    })
  );

// Base connection schema
const BaseSmbConnectionSchema = BaseAppConnectionSchema.extend({
  app: z.literal(AppConnection.SMB)
});

// Full connection schema
export const SmbConnectionSchema = BaseSmbConnectionSchema.extend({
  method: z.literal(SmbConnectionMethod.Credentials),
  credentials: SmbConnectionCredentialsSchema
});

// Sanitized credentials schema (excludes sensitive fields)
const SanitizedSmbConnectionCredentialsSchema = z.object({
  host: z.string(),
  port: z.number(),
  domain: z.string().optional(),
  username: z.string()
});

// Sanitized schema (excludes sensitive fields)
export const SanitizedSmbConnectionSchema = z.discriminatedUnion("method", [
  BaseSmbConnectionSchema.extend({
    method: z.literal(SmbConnectionMethod.Credentials),
    credentials: SanitizedSmbConnectionCredentialsSchema
  }).describe(JSON.stringify({ title: APP_CONNECTION_NAME_MAP[AppConnection.SMB] }))
]);

// List item schema
export const SmbConnectionListItemSchema = z
  .object({
    name: z.literal("Windows"),
    app: z.literal(AppConnection.SMB),
    methods: z.nativeEnum(SmbConnectionMethod).array()
  })
  .describe(JSON.stringify({ title: APP_CONNECTION_NAME_MAP[AppConnection.SMB] }));
