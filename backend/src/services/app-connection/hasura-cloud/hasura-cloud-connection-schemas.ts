import z from "zod";

import { AppConnections } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  BaseAppConnectionSchema,
  GenericCreateAppConnectionFieldsSchema,
  GenericUpdateAppConnectionFieldsSchema
} from "@app/services/app-connection/app-connection-schemas";

import { APP_CONNECTION_NAME_MAP } from "../app-connection-maps";
import { HasuraCloudConnectionMethod } from "./hasura-cloud-connection-enums";

export const HasuraCloudConnectionAccessTokenCredentialsSchema = z.object({
  accessToken: z
    .string()
    .trim()
    .min(1, "Access Token required")
    .describe(AppConnections.CREDENTIALS.HASURA_CLOUD.accessToken)
});

const BaseHasuraCloudConnectionSchema = BaseAppConnectionSchema.extend({ app: z.literal(AppConnection.HasuraCloud) });

export const HasuraCloudConnectionSchema = BaseHasuraCloudConnectionSchema.extend({
  method: z.literal(HasuraCloudConnectionMethod.AccessToken),
  credentials: HasuraCloudConnectionAccessTokenCredentialsSchema
});

export const SanitizedHasuraCloudConnectionSchema = z.discriminatedUnion("method", [
  BaseHasuraCloudConnectionSchema.extend({
    method: z.literal(HasuraCloudConnectionMethod.AccessToken),
    credentials: z.object({})
  }).describe(JSON.stringify({ title: `${APP_CONNECTION_NAME_MAP[AppConnection.HasuraCloud]} (Access Token)` }))
]);

export const ValidateHasuraCloudConnectionCredentialsSchema = z.discriminatedUnion("method", [
  z.object({
    method: z
      .literal(HasuraCloudConnectionMethod.AccessToken)
      .describe(AppConnections.CREATE(AppConnection.HasuraCloud).method),
    credentials: HasuraCloudConnectionAccessTokenCredentialsSchema.describe(
      AppConnections.CREATE(AppConnection.HasuraCloud).credentials
    )
  })
]);

export const CreateHasuraCloudConnectionSchema = ValidateHasuraCloudConnectionCredentialsSchema.and(
  GenericCreateAppConnectionFieldsSchema(AppConnection.HasuraCloud)
);

export const UpdateHasuraCloudConnectionSchema = z
  .object({
    credentials: HasuraCloudConnectionAccessTokenCredentialsSchema.optional().describe(
      AppConnections.UPDATE(AppConnection.HasuraCloud).credentials
    )
  })
  .and(GenericUpdateAppConnectionFieldsSchema(AppConnection.HasuraCloud));

export const HasuraCloudConnectionListItemSchema = z
  .object({
    name: z.literal("Hasura Cloud"),
    app: z.literal(AppConnection.HasuraCloud),
    methods: z.nativeEnum(HasuraCloudConnectionMethod).array()
  })
  .describe(JSON.stringify({ title: APP_CONNECTION_NAME_MAP[AppConnection.HasuraCloud] }));
