import z from "zod";

import { AppConnections } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  BaseAppConnectionSchema,
  GenericCreateAppConnectionFieldsSchema,
  GenericUpdateAppConnectionFieldsSchema
} from "@app/services/app-connection/app-connection-schemas";

import { APP_CONNECTION_NAME_MAP } from "../app-connection-maps";
import { CoolifyConnectionMethod } from "./coolify-connection-enums";

// Credentials embedded in the URL would be returned with the sanitized connection, and request
// paths are appended to the URL, so a query or fragment would end up in the middle of every request
const isValidInstanceUrl = (value: string) => {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash;
  } catch {
    return false;
  }
};

export const CoolifyConnectionApiTokenCredentialsSchema = z.object({
  instanceUrl: z
    .string()
    .trim()
    .min(1, "Instance URL required")
    .max(255)
    .refine(isValidInstanceUrl, "Instance URL must be an http or https URL without credentials, a query, or a fragment")
    .describe(AppConnections.CREDENTIALS.COOLIFY.instanceUrl),
  apiToken: z
    .string()
    .trim()
    .min(1, "API token required")
    .max(255)
    .describe(AppConnections.CREDENTIALS.COOLIFY.apiToken)
});

const BaseCoolifyConnectionSchema = BaseAppConnectionSchema.extend({
  app: z.literal(AppConnection.Coolify)
});

export const CoolifyConnectionSchema = z.discriminatedUnion("method", [
  BaseCoolifyConnectionSchema.extend({
    method: z.literal(CoolifyConnectionMethod.ApiToken),
    credentials: CoolifyConnectionApiTokenCredentialsSchema
  })
]);

export const SanitizedCoolifyConnectionSchema = z.discriminatedUnion("method", [
  BaseCoolifyConnectionSchema.extend({
    method: z.literal(CoolifyConnectionMethod.ApiToken),
    credentials: CoolifyConnectionApiTokenCredentialsSchema.pick({ instanceUrl: true })
  }).describe(JSON.stringify({ title: `${APP_CONNECTION_NAME_MAP[AppConnection.Coolify]} (API Token)` }))
]);

export const ValidateCoolifyConnectionCredentialsSchema = z.discriminatedUnion("method", [
  z.object({
    method: z.literal(CoolifyConnectionMethod.ApiToken).describe(AppConnections.CREATE(AppConnection.Coolify).method),
    credentials: CoolifyConnectionApiTokenCredentialsSchema.describe(
      AppConnections.CREATE(AppConnection.Coolify).credentials
    )
  })
]);

export const CreateCoolifyConnectionSchema = ValidateCoolifyConnectionCredentialsSchema.and(
  GenericCreateAppConnectionFieldsSchema(AppConnection.Coolify, { supportsGateways: true })
);

export const UpdateCoolifyConnectionSchema = z
  .object({
    credentials: CoolifyConnectionApiTokenCredentialsSchema.optional().describe(
      AppConnections.UPDATE(AppConnection.Coolify).credentials
    )
  })
  .and(GenericUpdateAppConnectionFieldsSchema(AppConnection.Coolify, { supportsGateways: true }));

export const CoolifyConnectionListItemSchema = z
  .object({
    name: z.literal("Coolify"),
    app: z.literal(AppConnection.Coolify),
    methods: z.nativeEnum(CoolifyConnectionMethod).array()
  })
  .describe(JSON.stringify({ title: APP_CONNECTION_NAME_MAP[AppConnection.Coolify] }));
