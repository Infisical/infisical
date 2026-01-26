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

// Password method credentials schema
export const SshConnectionPasswordCredentialsSchema = z.object({
  host: z.string().trim().min(1, "Host required").describe(AppConnections.CREDENTIALS.SSH.host),
  port: z.coerce.number().int().min(1).max(65535).describe(AppConnections.CREDENTIALS.SSH.port),
  username: z.string().trim().min(1, "Username required").describe(AppConnections.CREDENTIALS.SSH.username),
  password: z.string().trim().min(1, "Password required").describe(AppConnections.CREDENTIALS.SSH.password)
});

// SSH Key method credentials schema
export const SshConnectionSshKeyCredentialsSchema = z.object({
  host: z.string().trim().min(1, "Host required").describe(AppConnections.CREDENTIALS.SSH.host),
  port: z.coerce.number().int().min(1).max(65535).describe(AppConnections.CREDENTIALS.SSH.port),
  username: z.string().trim().min(1, "Username required").describe(AppConnections.CREDENTIALS.SSH.username),
  privateKey: z.string().trim().min(1, "Private key required").describe(AppConnections.CREDENTIALS.SSH.privateKey),
  passphrase: z.string().trim().optional().describe(AppConnections.CREDENTIALS.SSH.passphrase)
});

// Validation schema for credentials - top-level method discrimination
export const ValidateSshConnectionCredentialsSchema = z.discriminatedUnion("method", [
  z.object({
    method: z.literal(SshConnectionMethod.Password).describe(AppConnections.CREATE(AppConnection.SSH).method),
    credentials: SshConnectionPasswordCredentialsSchema.describe(AppConnections.CREATE(AppConnection.SSH).credentials)
  }),
  z.object({
    method: z.literal(SshConnectionMethod.SshKey).describe(AppConnections.CREATE(AppConnection.SSH).method),
    credentials: SshConnectionSshKeyCredentialsSchema.describe(AppConnections.CREATE(AppConnection.SSH).credentials)
  })
]);

// Create connection schema
export const CreateSshConnectionSchema = ValidateSshConnectionCredentialsSchema.and(
  GenericCreateAppConnectionFieldsSchema(AppConnection.SSH, {
    supportsGateways: true
  })
);

// Update connection schema
export const UpdateSshConnectionSchema = z
  .object({
    credentials: z
      .union([SshConnectionPasswordCredentialsSchema, SshConnectionSshKeyCredentialsSchema])
      .optional()
      .describe(AppConnections.UPDATE(AppConnection.SSH).credentials)
  })
  .and(
    GenericUpdateAppConnectionFieldsSchema(AppConnection.SSH, {
      supportsGateways: true
    })
  );

// Base connection schema
const BaseSshConnectionSchema = BaseAppConnectionSchema.extend({
  app: z.literal(AppConnection.SSH)
});

// Full connection schema
export const SshConnectionSchema = z.intersection(
  BaseSshConnectionSchema,
  z.discriminatedUnion("method", [
    z.object({
      method: z.literal(SshConnectionMethod.Password),
      credentials: SshConnectionPasswordCredentialsSchema
    }),
    z.object({
      method: z.literal(SshConnectionMethod.SshKey),
      credentials: SshConnectionSshKeyCredentialsSchema
    })
  ])
);

// Sanitized credentials schema (excludes sensitive fields)
const SanitizedSshConnectionCredentialsSchema = z.object({
  host: z.string(),
  port: z.number(),
  username: z.string()
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

// List item schema
export const SshConnectionListItemSchema = z
  .object({
    name: z.literal("SSH"),
    app: z.literal(AppConnection.SSH),
    methods: z.nativeEnum(SshConnectionMethod).array()
  })
  .describe(JSON.stringify({ title: APP_CONNECTION_NAME_MAP[AppConnection.SSH] }));
