import z from "zod";

import { AppConnections } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  BaseAppConnectionSchema,
  GenericCreateAppConnectionFieldsSchema,
  GenericUpdateAppConnectionFieldsSchema
} from "@app/services/app-connection/app-connection-schemas";

import { APP_CONNECTION_NAME_MAP } from "../app-connection-maps";
import { LinearConnectionMethod } from "./linear-connection-enums";

export const LinearConnectionApiKeyCredentialsSchema = z.object({
  apiKey: z
    .string()
    .trim()
    .min(1, "API key required")
    .max(1024, "API key cannot exceed 1024 characters")
    .describe(AppConnections.CREDENTIALS.LINEAR.apiKey)
});

// Read from Linear when the key is validated, to reject links and replacement keys from other workspaces
const LinearConnectionStoredCredentialsSchema = LinearConnectionApiKeyCredentialsSchema.extend({
  workspaceId: z.string().optional(),
  workspaceUrlKey: z.string().optional()
});

const BaseLinearConnectionSchema = BaseAppConnectionSchema.extend({ app: z.literal(AppConnection.Linear) });

export const LinearConnectionSchema = BaseLinearConnectionSchema.extend({
  method: z.literal(LinearConnectionMethod.ApiKey),
  credentials: LinearConnectionStoredCredentialsSchema
});

export const SanitizedLinearConnectionSchema = z.discriminatedUnion("method", [
  BaseLinearConnectionSchema.extend({
    method: z.literal(LinearConnectionMethod.ApiKey),
    credentials: LinearConnectionApiKeyCredentialsSchema.pick({})
  }).describe(JSON.stringify({ title: `${APP_CONNECTION_NAME_MAP[AppConnection.Linear]} (API Key)` }))
]);

export const ValidateLinearConnectionCredentialsSchema = z.discriminatedUnion("method", [
  z.object({
    method: z.literal(LinearConnectionMethod.ApiKey).describe(AppConnections.CREATE(AppConnection.Linear).method),
    credentials: LinearConnectionApiKeyCredentialsSchema.describe(
      AppConnections.CREATE(AppConnection.Linear).credentials
    )
  })
]);

export const CreateLinearConnectionSchema = ValidateLinearConnectionCredentialsSchema.and(
  GenericCreateAppConnectionFieldsSchema(AppConnection.Linear)
);

export const UpdateLinearConnectionSchema = z
  .object({
    credentials: LinearConnectionApiKeyCredentialsSchema.optional().describe(
      AppConnections.UPDATE(AppConnection.Linear).credentials
    )
  })
  .and(GenericUpdateAppConnectionFieldsSchema(AppConnection.Linear));

export const LinearConnectionListItemSchema = z
  .object({
    name: z.literal("Linear"),
    app: z.literal(AppConnection.Linear),
    methods: z.nativeEnum(LinearConnectionMethod).array()
  })
  .describe(JSON.stringify({ title: APP_CONNECTION_NAME_MAP[AppConnection.Linear] }));
