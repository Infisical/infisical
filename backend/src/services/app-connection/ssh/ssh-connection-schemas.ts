import { z } from "zod";

import { AppConnections } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  BaseAppConnectionSchema,
  GenericCreateAppConnectionFieldsSchema,
  GenericUpdateAppConnectionFieldsSchema
} from "@app/services/app-connection/app-connection-schemas";

import { APP_CONNECTION_NAME_MAP } from "../app-connection-maps";
import { SshConnectionMethod } from "./ssh-connection-enums";

// Base credentials schema with common fields
const SshConnectionBaseCredentialsSchema = z.object({
  host: z.string().trim().min(1, "Host required").describe(AppConnections.CREDENTIALS.SSH.host),
  port: z.coerce.number().int().min(1).max(65535).describe(AppConnections.CREDENTIALS.SSH.port),
  username: z.string().trim().min(1, "Username required").describe(AppConnections.CREDENTIALS.SSH.username)
});

// Auth method specific schemas
const SshPasswordAuthSchema = z.object({
  authMethod: z.literal(SshConnectionMethod.Password).describe(AppConnections.CREDENTIALS.SSH.authMethod),
  password: z.string().trim().min(1, "Password required").describe(AppConnections.CREDENTIALS.SSH.password)
});

const SshKeyAuthSchema = z.object({
  authMethod: z.literal(SshConnectionMethod.SshKey).describe(AppConnections.CREDENTIALS.SSH.authMethod),
  privateKey: z.string().trim().min(1, "Private key required").describe(AppConnections.CREDENTIALS.SSH.privateKey),
  passphrase: z.string().trim().optional().describe(AppConnections.CREDENTIALS.SSH.passphrase)
});

// Full credentials schema combining base + auth method discriminated union
export const SshConnectionCredentialsSchema = SshConnectionBaseCredentialsSchema.and(
  z.discriminatedUnion("authMethod", [SshPasswordAuthSchema, SshKeyAuthSchema])
);

// Base connection schema
const BaseSshConnectionSchema = BaseAppConnectionSchema.extend({
  app: z.literal(AppConnection.SSH)
});

// Full connection schema
export const SshConnectionSchema = BaseSshConnectionSchema.extend({
  method: z.literal(SshConnectionMethod.Password).or(z.literal(SshConnectionMethod.SshKey)),
  credentials: SshConnectionCredentialsSchema
});

// Sanitized credentials schema (excludes password/privateKey/passphrase)
const SanitizedSshConnectionCredentialsSchema = SshConnectionBaseCredentialsSchema.extend({
  authMethod: z.nativeEnum(SshConnectionMethod).describe(AppConnections.CREDENTIALS.SSH.authMethod)
});

// Sanitized schema (excludes sensitive fields) - must be discriminated union for router compatibility
export const SanitizedSshConnectionSchema = z.discriminatedUnion("method", [
  BaseSshConnectionSchema.extend({
    method: z.literal(SshConnectionMethod.Password),
    credentials: SanitizedSshConnectionCredentialsSchema
  }).describe(JSON.stringify({ title: `${APP_CONNECTION_NAME_MAP[AppConnection.SSH]} (Password)` })),
  BaseSshConnectionSchema.extend({
    method: z.literal(SshConnectionMethod.SshKey),
    credentials: SanitizedSshConnectionCredentialsSchema
  }).describe(JSON.stringify({ title: `${APP_CONNECTION_NAME_MAP[AppConnection.SSH]} (SSH Key)` }))
]);

// Validation schema for credentials
export const ValidateSshConnectionCredentialsSchema = z.object({
  method: z
    .literal(SshConnectionMethod.Password)
    .or(z.literal(SshConnectionMethod.SshKey))
    .describe(AppConnections.CREATE(AppConnection.SSH).method),
  credentials: SshConnectionCredentialsSchema.describe(AppConnections.CREATE(AppConnection.SSH).credentials)
});

// Create connection schema
export const CreateSshConnectionSchema = ValidateSshConnectionCredentialsSchema.and(
  GenericCreateAppConnectionFieldsSchema(AppConnection.SSH, {
    supportsGateways: true
  })
);

// Update connection schema
export const UpdateSshConnectionSchema = z
  .object({
    credentials: SshConnectionCredentialsSchema.optional().describe(
      AppConnections.UPDATE(AppConnection.SSH).credentials
    )
  })
  .and(
    GenericUpdateAppConnectionFieldsSchema(AppConnection.SSH, {
      supportsGateways: true
    })
  );

// List item schema
export const SshConnectionListItemSchema = z
  .object({
    name: z.literal("SSH"),
    app: z.literal(AppConnection.SSH),
    methods: z.nativeEnum(SshConnectionMethod).array()
  })
  .describe(JSON.stringify({ title: APP_CONNECTION_NAME_MAP[AppConnection.SSH] }));
