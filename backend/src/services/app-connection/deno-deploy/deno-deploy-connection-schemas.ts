import z from "zod";

import { AppConnections } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  BaseAppConnectionSchema,
  GenericCreateAppConnectionFieldsSchema,
  GenericUpdateAppConnectionFieldsSchema
} from "@app/services/app-connection/app-connection-schemas";

import { APP_CONNECTION_NAME_MAP } from "../app-connection-maps";
import { DenoDeployConnectionMethod } from "./deno-deploy-connection-enums";

export const DenoDeployConnectionAccessTokenCredentialsSchema = z.object({
  accessToken: z
    .string()
    .trim()
    .min(1, "Access Token required")
    .max(500)
    .startsWith("ddo_", "Token must start with 'ddo_'")
    .describe(AppConnections.CREDENTIALS.DENO_DEPLOY.accessToken),
  organizationId: z
    .string()
    .trim()
    .max(255)
    .optional()
    .transform((value) => (value === "" ? undefined : value))
    .describe(AppConnections.CREDENTIALS.DENO_DEPLOY.organizationId)
});

const BaseDenoDeployConnectionSchema = BaseAppConnectionSchema.extend({
  app: z.literal(AppConnection.DenoDeploy)
});

export const DenoDeployConnectionSchema = BaseDenoDeployConnectionSchema.extend({
  method: z.literal(DenoDeployConnectionMethod.AccessToken),
  credentials: DenoDeployConnectionAccessTokenCredentialsSchema
});

export const SanitizedDenoDeployConnectionSchema = z.discriminatedUnion("method", [
  BaseDenoDeployConnectionSchema.extend({
    method: z.literal(DenoDeployConnectionMethod.AccessToken),
    credentials: DenoDeployConnectionAccessTokenCredentialsSchema.pick({ organizationId: true })
  }).describe(JSON.stringify({ title: `${APP_CONNECTION_NAME_MAP[AppConnection.DenoDeploy]} (Access Token)` }))
]);

export const ValidateDenoDeployConnectionCredentialsSchema = z.discriminatedUnion("method", [
  z.object({
    method: z
      .literal(DenoDeployConnectionMethod.AccessToken)
      .describe(AppConnections.CREATE(AppConnection.DenoDeploy).method),
    credentials: DenoDeployConnectionAccessTokenCredentialsSchema.describe(
      AppConnections.CREATE(AppConnection.DenoDeploy).credentials
    )
  })
]);

export const CreateDenoDeployConnectionSchema = ValidateDenoDeployConnectionCredentialsSchema.and(
  GenericCreateAppConnectionFieldsSchema(AppConnection.DenoDeploy)
);

export const UpdateDenoDeployConnectionSchema = z
  .object({
    credentials: DenoDeployConnectionAccessTokenCredentialsSchema.optional().describe(
      AppConnections.UPDATE(AppConnection.DenoDeploy).credentials
    )
  })
  .and(GenericUpdateAppConnectionFieldsSchema(AppConnection.DenoDeploy));

export const DenoDeployConnectionListItemSchema = z
  .object({
    name: z.literal("Deno Deploy"),
    app: z.literal(AppConnection.DenoDeploy),
    methods: z.nativeEnum(DenoDeployConnectionMethod).array()
  })
  .describe(JSON.stringify({ title: APP_CONNECTION_NAME_MAP[AppConnection.DenoDeploy] }));
