import z from "zod";

import { AppConnections } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  BaseAppConnectionSchema,
  GenericCreateAppConnectionFieldsSchema,
  GenericUpdateAppConnectionFieldsSchema
} from "@app/services/app-connection/app-connection-schemas";

import { APP_CONNECTION_NAME_MAP } from "../app-connection-maps";
import { OctopusDeployConnectionMethod } from "./octopus-deploy-connection-enums";

export const OctopusDeployConnectionApiKeyCredentialsSchema = z.object({
  instanceUrl: z
    .string()
    .trim()
    .url("Invalid Instance URL")
    .min(1, "Instance URL required")
    .max(255)
    .describe(AppConnections.CREDENTIALS.OCTOPUS_DEPLOY.instanceUrl),
  apiKey: z.string().trim().min(1, "API key required").describe(AppConnections.CREDENTIALS.OCTOPUS_DEPLOY.apiKey)
});

const BaseOctopusDeployConnectionSchema = BaseAppConnectionSchema.extend({
  app: z.literal(AppConnection.OctopusDeploy)
});

export const OctopusDeployConnectionSchema = z.discriminatedUnion("method", [
  BaseOctopusDeployConnectionSchema.extend({
    method: z.literal(OctopusDeployConnectionMethod.ApiKey),
    credentials: OctopusDeployConnectionApiKeyCredentialsSchema
  })
]);

export const SanitizedOctopusDeployConnectionSchema = z.discriminatedUnion("method", [
  BaseOctopusDeployConnectionSchema.extend({
    method: z.literal(OctopusDeployConnectionMethod.ApiKey),
    credentials: OctopusDeployConnectionApiKeyCredentialsSchema.pick({ instanceUrl: true })
  }).describe(JSON.stringify({ title: `${APP_CONNECTION_NAME_MAP[AppConnection.OctopusDeploy]} (API Key)` }))
]);

export const ValidateOctopusDeployConnectionCredentialsSchema = z.discriminatedUnion("method", [
  z.object({
    method: z
      .literal(OctopusDeployConnectionMethod.ApiKey)
      .describe(AppConnections.CREATE(AppConnection.OctopusDeploy).method),
    credentials: OctopusDeployConnectionApiKeyCredentialsSchema.describe(
      AppConnections.CREATE(AppConnection.OctopusDeploy).credentials
    )
  })
]);

export const CreateOctopusDeployConnectionSchema = ValidateOctopusDeployConnectionCredentialsSchema.and(
  GenericCreateAppConnectionFieldsSchema(AppConnection.OctopusDeploy)
);

export const UpdateOctopusDeployConnectionSchema = z
  .object({
    credentials: OctopusDeployConnectionApiKeyCredentialsSchema.optional().describe(
      AppConnections.UPDATE(AppConnection.OctopusDeploy).credentials
    )
  })
  .and(GenericUpdateAppConnectionFieldsSchema(AppConnection.OctopusDeploy));

export const OctopusDeployConnectionListItemSchema = z
  .object({
    name: z.literal("Octopus Deploy"),
    app: z.literal(AppConnection.OctopusDeploy),
    methods: z.nativeEnum(OctopusDeployConnectionMethod).array()
  })
  .describe(JSON.stringify({ title: APP_CONNECTION_NAME_MAP[AppConnection.OctopusDeploy] }));
