import z from "zod";

import { AppConnections } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  BaseAppConnectionSchema,
  GenericCreateAppConnectionFieldsSchema,
  GenericUpdateAppConnectionFieldsSchema
} from "@app/services/app-connection/app-connection-schemas";

import { APP_CONNECTION_NAME_MAP } from "../app-connection-maps";
import { TravisCIConnectionMethod } from "./travis-ci-connection-enums";

export const TravisCIConnectionAccessTokenCredentialsSchema = z.object({
  apiToken: z.string().trim().min(1, "API Token required").describe(AppConnections.CREDENTIALS.TRAVISCI.apiToken)
});

const BaseTravisCIConnectionSchema = BaseAppConnectionSchema.extend({
  app: z.literal(AppConnection.TravisCI)
});

export const TravisCIConnectionSchema = BaseTravisCIConnectionSchema.extend({
  method: z.literal(TravisCIConnectionMethod.ApiToken),
  credentials: TravisCIConnectionAccessTokenCredentialsSchema
});

export const SanitizedTravisCIConnectionSchema = z.discriminatedUnion("method", [
  BaseTravisCIConnectionSchema.extend({
    method: z.literal(TravisCIConnectionMethod.ApiToken),
    credentials: TravisCIConnectionAccessTokenCredentialsSchema.pick({})
  }).describe(JSON.stringify({ title: `${APP_CONNECTION_NAME_MAP[AppConnection.TravisCI]} (API Token)` }))
]);

export const ValidateTravisCIConnectionCredentialsSchema = z.discriminatedUnion("method", [
  z.object({
    method: z.literal(TravisCIConnectionMethod.ApiToken).describe(AppConnections.CREATE(AppConnection.TravisCI).method),
    credentials: TravisCIConnectionAccessTokenCredentialsSchema.describe(
      AppConnections.CREATE(AppConnection.TravisCI).credentials
    )
  })
]);

export const CreateTravisCIConnectionSchema = ValidateTravisCIConnectionCredentialsSchema.and(
  GenericCreateAppConnectionFieldsSchema(AppConnection.TravisCI)
);

export const UpdateTravisCIConnectionSchema = z
  .object({
    credentials: TravisCIConnectionAccessTokenCredentialsSchema.optional().describe(
      AppConnections.UPDATE(AppConnection.TravisCI).credentials
    )
  })
  .and(GenericUpdateAppConnectionFieldsSchema(AppConnection.TravisCI));

export const TravisCIConnectionListItemSchema = z
  .object({
    name: z.literal("Travis CI"),
    app: z.literal(AppConnection.TravisCI),
    methods: z.nativeEnum(TravisCIConnectionMethod).array()
  })
  .describe(JSON.stringify({ title: APP_CONNECTION_NAME_MAP[AppConnection.TravisCI] }));
