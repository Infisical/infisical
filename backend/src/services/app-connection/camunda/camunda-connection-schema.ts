import { z } from "zod";

import { AppConnections } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  BaseAppConnectionSchema,
  GenericCreateAppConnectionFieldsSchema,
  GenericUpdateAppConnectionFieldsSchema
} from "@app/services/app-connection/app-connection-schemas";

import { APP_CONNECTION_NAME_MAP } from "../app-connection-maps";
import { CamundaConnectionMethod } from "./camunda-connection-enums";

const BaseCamundaConnectionSchema = BaseAppConnectionSchema.extend({ app: z.literal(AppConnection.Camunda) });

export const CamundaConnectionClientCredentialsInputCredentialsSchema = z.object({
  clientId: z.string().trim().min(1, "Client ID required").describe(AppConnections.CREDENTIALS.CAMUNDA.clientId),
  clientSecret: z
    .string()
    .trim()
    .min(1, "Client Secret required")
    .describe(AppConnections.CREDENTIALS.CAMUNDA.clientSecret)
});

export const CamundaConnectionClientCredentialsOutputCredentialsSchema = z
  .object({
    accessToken: z.string(),
    expiresAt: z.number()
  })
  .merge(CamundaConnectionClientCredentialsInputCredentialsSchema);

export const CamundaConnectionSchema = z.intersection(
  BaseCamundaConnectionSchema,
  z.discriminatedUnion("method", [
    z.object({
      method: z.literal(CamundaConnectionMethod.ClientCredentials),
      credentials: CamundaConnectionClientCredentialsOutputCredentialsSchema
    })
  ])
);

export const SanitizedCamundaConnectionSchema = z.discriminatedUnion("method", [
  BaseCamundaConnectionSchema.extend({
    method: z.literal(CamundaConnectionMethod.ClientCredentials),
    credentials: CamundaConnectionClientCredentialsOutputCredentialsSchema.pick({
      clientId: true
    })
  }).describe(JSON.stringify({ title: `${APP_CONNECTION_NAME_MAP[AppConnection.Camunda]} (Client Credentials)` }))
]);

export const ValidateCamundaConnectionCredentialsSchema = z.discriminatedUnion("method", [
  z.object({
    method: z
      .literal(CamundaConnectionMethod.ClientCredentials)
      .describe(AppConnections.CREATE(AppConnection.Camunda).method),
    credentials: CamundaConnectionClientCredentialsInputCredentialsSchema.describe(
      AppConnections.CREATE(AppConnection.Camunda).credentials
    )
  })
]);

export const CreateCamundaConnectionSchema = ValidateCamundaConnectionCredentialsSchema.and(
  GenericCreateAppConnectionFieldsSchema(AppConnection.Camunda)
);

export const UpdateCamundaConnectionSchema = z
  .object({
    credentials: CamundaConnectionClientCredentialsInputCredentialsSchema.optional().describe(
      AppConnections.UPDATE(AppConnection.Camunda).credentials
    )
  })
  .and(GenericUpdateAppConnectionFieldsSchema(AppConnection.Camunda));

export const CamundaConnectionListItemSchema = z
  .object({
    name: z.literal("Camunda"),
    app: z.literal(AppConnection.Camunda),
    methods: z.nativeEnum(CamundaConnectionMethod).array()
  })
  .describe(JSON.stringify({ title: APP_CONNECTION_NAME_MAP[AppConnection.Camunda] }));
