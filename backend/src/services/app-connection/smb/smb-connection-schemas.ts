import { z } from "zod";

import { AppConnections } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  BaseAppConnectionSchema,
  GenericCreateAppConnectionFieldsSchema,
  GenericUpdateAppConnectionFieldsSchema
} from "@app/services/app-connection/app-connection-schemas";

import { APP_CONNECTION_NAME_MAP } from "../app-connection-maps";
import { SmbConnectionMethod } from "./smb-connection-enums";

export const SmbConnectionCredentialsSchema = z.object({
  host: z.string().trim().min(1, "Host required").describe(AppConnections.CREDENTIALS.SMB.host),
  port: z.coerce.number().int().min(1).max(65535).describe(AppConnections.CREDENTIALS.SMB.port),
  domain: z.string().trim().optional().describe(AppConnections.CREDENTIALS.SMB.domain),
  username: z.string().trim().min(1, "Username required").describe(AppConnections.CREDENTIALS.SMB.username),
  password: z.string().trim().min(1, "Password required").describe(AppConnections.CREDENTIALS.SMB.password)
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
