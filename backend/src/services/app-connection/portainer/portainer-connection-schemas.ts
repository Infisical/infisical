import z from "zod";

import { AppConnections } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  BaseAppConnectionSchema,
  GenericCreateAppConnectionFieldsSchema,
  GenericUpdateAppConnectionFieldsSchema
} from "@app/services/app-connection/app-connection-schemas";

import { APP_CONNECTION_NAME_MAP } from "../app-connection-maps";
import { PortainerConnectionMethod } from "./portainer-connection-enums";

export const PortainerConnectionApiTokenCredentialsSchema = z.object({
  instanceUrl: z
    .string()
    .trim()
    .url("Invalid Instance URL")
    .min(1, "Instance URL required")
    .max(255)
    .describe(AppConnections.CREDENTIALS.PORTAINER.instanceUrl),
  apiToken: z
    .string()
    .trim()
    .min(1, "API token required")
    .max(255)
    .describe(AppConnections.CREDENTIALS.PORTAINER.apiToken)
});

const BasePortainerConnectionSchema = BaseAppConnectionSchema.extend({
  app: z.literal(AppConnection.Portainer)
});

export const PortainerConnectionSchema = z.discriminatedUnion("method", [
  BasePortainerConnectionSchema.extend({
    method: z.literal(PortainerConnectionMethod.ApiToken),
    credentials: PortainerConnectionApiTokenCredentialsSchema
  })
]);

export const SanitizedPortainerConnectionSchema = z.discriminatedUnion("method", [
  BasePortainerConnectionSchema.extend({
    method: z.literal(PortainerConnectionMethod.ApiToken),
    credentials: PortainerConnectionApiTokenCredentialsSchema.pick({ instanceUrl: true })
  }).describe(JSON.stringify({ title: `${APP_CONNECTION_NAME_MAP[AppConnection.Portainer]} (API Token)` }))
]);

export const ValidatePortainerConnectionCredentialsSchema = z.discriminatedUnion("method", [
  z.object({
    method: z
      .literal(PortainerConnectionMethod.ApiToken)
      .describe(AppConnections.CREATE(AppConnection.Portainer).method),
    credentials: PortainerConnectionApiTokenCredentialsSchema.describe(
      AppConnections.CREATE(AppConnection.Portainer).credentials
    )
  })
]);

export const CreatePortainerConnectionSchema = ValidatePortainerConnectionCredentialsSchema.and(
  GenericCreateAppConnectionFieldsSchema(AppConnection.Portainer)
);

export const UpdatePortainerConnectionSchema = z
  .object({
    credentials: PortainerConnectionApiTokenCredentialsSchema.optional().describe(
      AppConnections.UPDATE(AppConnection.Portainer).credentials
    )
  })
  .and(GenericUpdateAppConnectionFieldsSchema(AppConnection.Portainer));

export const PortainerConnectionListItemSchema = z
  .object({
    name: z.literal("Portainer"),
    app: z.literal(AppConnection.Portainer),
    methods: z.nativeEnum(PortainerConnectionMethod).array()
  })
  .describe(JSON.stringify({ title: APP_CONNECTION_NAME_MAP[AppConnection.Portainer] }));
