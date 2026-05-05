import z from "zod";

import { AppConnections } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  BaseAppConnectionSchema,
  GenericCreateAppConnectionFieldsSchema,
  GenericUpdateAppConnectionFieldsSchema
} from "@app/services/app-connection/app-connection-schemas";

import { APP_CONNECTION_NAME_MAP } from "../app-connection-maps";
import { GiteaConnectionMethod } from "./gitea-connection-enums";

export const GiteaConnectionAccessTokenCredentialsSchema = z.object({
  instanceUrl: z.string().trim().url("Invalid Instance URL").describe(AppConnections.CREDENTIALS.GITEA.instanceUrl),
  accessToken: z.string().trim().min(1, "Access Token required").describe(AppConnections.CREDENTIALS.GITEA.accessToken)
});

const BaseGiteaConnectionSchema = BaseAppConnectionSchema.extend({ app: z.literal(AppConnection.Gitea) });

export const GiteaConnectionSchema = BaseGiteaConnectionSchema.extend({
  method: z.literal(GiteaConnectionMethod.ApiToken),
  credentials: GiteaConnectionAccessTokenCredentialsSchema
});

export const SanitizedGiteaConnectionSchema = z.discriminatedUnion("method", [
  BaseGiteaConnectionSchema.extend({
    method: z.literal(GiteaConnectionMethod.ApiToken),
    credentials: GiteaConnectionAccessTokenCredentialsSchema.pick({
      instanceUrl: true
    })
  }).describe(JSON.stringify({ title: `${APP_CONNECTION_NAME_MAP[AppConnection.Gitea]} (Access Token)` }))
]);

export const ValidateGiteaConnectionCredentialsSchema = z.discriminatedUnion("method", [
  z.object({
    method: z.literal(GiteaConnectionMethod.ApiToken).describe(AppConnections.CREATE(AppConnection.Gitea).method),
    credentials: GiteaConnectionAccessTokenCredentialsSchema.describe(
      AppConnections.CREATE(AppConnection.Gitea).credentials
    )
  })
]);

export const CreateGiteaConnectionSchema = ValidateGiteaConnectionCredentialsSchema.and(
  GenericCreateAppConnectionFieldsSchema(AppConnection.Gitea)
);

export const UpdateGiteaConnectionSchema = z
  .object({
    credentials: GiteaConnectionAccessTokenCredentialsSchema.optional().describe(
      AppConnections.UPDATE(AppConnection.Gitea).credentials
    )
  })
  .and(GenericUpdateAppConnectionFieldsSchema(AppConnection.Gitea));

export const GiteaConnectionListItemSchema = z
  .object({
    name: z.literal("Gitea"),
    app: z.literal(AppConnection.Gitea),
    methods: z.nativeEnum(GiteaConnectionMethod).array()
  })
  .describe(JSON.stringify({ title: APP_CONNECTION_NAME_MAP[AppConnection.Gitea] }));
