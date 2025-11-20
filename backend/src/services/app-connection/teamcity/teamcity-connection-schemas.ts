import z from "zod";

import { AppConnections } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  BaseAppConnectionSchema,
  GenericCreateAppConnectionFieldsSchema,
  GenericUpdateAppConnectionFieldsSchema
} from "@app/services/app-connection/app-connection-schemas";

import { APP_CONNECTION_NAME_MAP } from "../app-connection-maps";
import { TeamCityConnectionMethod } from "./teamcity-connection-enums";

export const TeamCityConnectionAccessTokenCredentialsSchema = z.object({
  accessToken: z
    .string()
    .trim()
    .min(1, "Access Token required")
    .describe(AppConnections.CREDENTIALS.TEAMCITY.accessToken),
  instanceUrl: z
    .string()
    .trim()
    .url("Invalid Instance URL")
    .min(1, "Instance URL required")
    .describe(AppConnections.CREDENTIALS.TEAMCITY.instanceUrl)
});

const BaseTeamCityConnectionSchema = BaseAppConnectionSchema.extend({ app: z.literal(AppConnection.TeamCity) });

export const TeamCityConnectionSchema = BaseTeamCityConnectionSchema.extend({
  method: z.literal(TeamCityConnectionMethod.AccessToken),
  credentials: TeamCityConnectionAccessTokenCredentialsSchema
});

export const SanitizedTeamCityConnectionSchema = z.discriminatedUnion("method", [
  BaseTeamCityConnectionSchema.extend({
    method: z.literal(TeamCityConnectionMethod.AccessToken),
    credentials: TeamCityConnectionAccessTokenCredentialsSchema.pick({
      instanceUrl: true
    })
  }).describe(JSON.stringify({ title: `${APP_CONNECTION_NAME_MAP[AppConnection.TeamCity]} (Access Token)` }))
]);

export const ValidateTeamCityConnectionCredentialsSchema = z.discriminatedUnion("method", [
  z.object({
    method: z
      .literal(TeamCityConnectionMethod.AccessToken)
      .describe(AppConnections.CREATE(AppConnection.TeamCity).method),
    credentials: TeamCityConnectionAccessTokenCredentialsSchema.describe(
      AppConnections.CREATE(AppConnection.TeamCity).credentials
    )
  })
]);

export const CreateTeamCityConnectionSchema = ValidateTeamCityConnectionCredentialsSchema.and(
  GenericCreateAppConnectionFieldsSchema(AppConnection.TeamCity)
);

export const UpdateTeamCityConnectionSchema = z
  .object({
    credentials: TeamCityConnectionAccessTokenCredentialsSchema.optional().describe(
      AppConnections.UPDATE(AppConnection.TeamCity).credentials
    )
  })
  .and(GenericUpdateAppConnectionFieldsSchema(AppConnection.TeamCity));

export const TeamCityConnectionListItemSchema = z
  .object({
    name: z.literal("TeamCity"),
    app: z.literal(AppConnection.TeamCity),
    methods: z.nativeEnum(TeamCityConnectionMethod).array()
  })
  .describe(JSON.stringify({ title: APP_CONNECTION_NAME_MAP[AppConnection.TeamCity] }));
