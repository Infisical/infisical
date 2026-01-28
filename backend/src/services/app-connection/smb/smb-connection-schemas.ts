import { z } from "zod";

import { AppConnections } from "@app/lib/api-docs";
import { CharacterType, characterValidator } from "@app/lib/validator/validate-string";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  BaseAppConnectionSchema,
  GenericCreateAppConnectionFieldsSchema,
  GenericUpdateAppConnectionFieldsSchema
} from "@app/services/app-connection/app-connection-schemas";

import { APP_CONNECTION_NAME_MAP } from "../app-connection-maps";
import { SmbConnectionMethod } from "./smb-connection-enums";

// Hostname validation: alphanumeric, dots, hyphens (cannot start with hyphen)
// Supports: hostnames (server.domain.com), IPv4 (192.168.1.1)
const validateHostname = characterValidator([CharacterType.AlphaNumeric, CharacterType.Period, CharacterType.Hyphen]);

// Domain validation: alphanumeric, dots, hyphens, underscores (cannot start with hyphen)
const validateDomain = characterValidator([
  CharacterType.AlphaNumeric,
  CharacterType.Period,
  CharacterType.Hyphen,
  CharacterType.Underscore
]);

// Username validation for SMB admin user
// Windows usernames: alphanumeric, underscores, hyphens, periods (cannot start with period or hyphen)
const validateSmbUsername = characterValidator([
  CharacterType.AlphaNumeric,
  CharacterType.Hyphen,
  CharacterType.Underscore,
  CharacterType.Period
]);

// Dangerous characters that could enable command/RPC injection
// These are blocked to prevent:
// - Command separators: ; | & 
// - Command substitution: ` $ ( )
// - Newlines: \n \r (auth file directive injection)
// - Null bytes: \0 (string termination attacks)
const DANGEROUS_PASSWORD_CHARS = [";", "|", "&", "`", "$", "(", ")", "\n", "\r", "\0"];

const validateSmbPassword = (password: string): boolean => {
  return !DANGEROUS_PASSWORD_CHARS.some((char) => password.includes(char));
};

export const SmbConnectionCredentialsSchema = z.object({
  host: z
    .string()
    .trim()
    .min(1, "Host required")
    .max(253, "Host too long")
    .refine((val) => validateHostname(val), {
      message: "Host can only contain alphanumeric characters, dots, and hyphens"
    })
    .refine((val) => !val.startsWith("-"), {
      message: "Host cannot start with a hyphen"
    })
    .refine((val) => !val.startsWith("."), {
      message: "Host cannot start with a period"
    })
    .describe(AppConnections.CREDENTIALS.SMB.host),
  port: z.coerce.number().int().min(1).max(65535).describe(AppConnections.CREDENTIALS.SMB.port),
  domain: z
    .string()
    .trim()
    .max(255, "Domain too long")
    .refine((val) => val === "" || validateDomain(val), {
      message: "Domain can only contain alphanumeric characters, dots, hyphens, and underscores"
    })
    .refine((val) => val === "" || !val.startsWith("-"), {
      message: "Domain cannot start with a hyphen"
    })
    .optional()
    .describe(AppConnections.CREDENTIALS.SMB.domain),
  username: z
    .string()
    .trim()
    .min(1, "Username required")
    .max(104, "Username too long")
    .refine((val) => validateSmbUsername(val), {
      message: "Username can only contain alphanumeric characters, underscores, hyphens, and periods"
    })
    .refine((val) => !val.startsWith("-"), {
      message: "Username cannot start with a hyphen"
    })
    .refine((val) => !val.startsWith("."), {
      message: "Username cannot start with a period"
    })
    .describe(AppConnections.CREDENTIALS.SMB.username),
  password: z
    .string()
    .trim()
    .min(1, "Password required")
    .refine((val) => validateSmbPassword(val), {
      message: "Password cannot contain the following characters: ; | & ` $ ( ) or newlines"
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
