import z from "zod";

import { AppConnections } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  BaseAppConnectionSchema,
  GenericCreateAppConnectionFieldsSchema,
  GenericUpdateAppConnectionFieldsSchema
} from "@app/services/app-connection/app-connection-schemas";

import { APP_CONNECTION_NAME_MAP } from "../app-connection-maps";
import { CircleCIConnectionMethod } from "./circleci-connection-enums";

export const CircleCIConnectionAccessTokenCredentialsSchema = z.object({
  apiToken: z.string().trim().min(1, "API Token required"),
  host: z.string().trim().optional()
});

const BaseCircleCIConnectionSchema = BaseAppConnectionSchema.extend({ app: z.literal(AppConnection.CircleCI) });

export const CircleCIConnectionSchema = BaseCircleCIConnectionSchema.extend({
  method: z.literal(CircleCIConnectionMethod.ApiToken),
  credentials: CircleCIConnectionAccessTokenCredentialsSchema
});

export const SanitizedCircleCIConnectionSchema = z.discriminatedUnion("method", [
  BaseCircleCIConnectionSchema.extend({
    method: z.literal(CircleCIConnectionMethod.ApiToken),
    credentials: CircleCIConnectionAccessTokenCredentialsSchema.pick({ host: true })
  }).describe(JSON.stringify({ title: `${APP_CONNECTION_NAME_MAP[AppConnection.CircleCI]} (Personal Access Token)` }))
]);

export const ValidateCircleCIConnectionCredentialsSchema = z.discriminatedUnion("method", [
  z.object({
    method: z.literal(CircleCIConnectionMethod.ApiToken).describe(AppConnections.CREATE(AppConnection.CircleCI).method),
    credentials: CircleCIConnectionAccessTokenCredentialsSchema.describe(
      AppConnections.CREATE(AppConnection.CircleCI).credentials
    )
  })
]);

export const CreateCircleCIConnectionSchema = ValidateCircleCIConnectionCredentialsSchema.and(
  GenericCreateAppConnectionFieldsSchema(AppConnection.CircleCI)
);

export const UpdateCircleCIConnectionSchema = z
  .object({
    credentials: CircleCIConnectionAccessTokenCredentialsSchema.optional().describe(
      AppConnections.UPDATE(AppConnection.CircleCI).credentials
    )
  })
  .and(GenericUpdateAppConnectionFieldsSchema(AppConnection.CircleCI));

export const CircleCIConnectionListItemSchema = z
  .object({
    name: z.literal("CircleCI"),
    app: z.literal(AppConnection.CircleCI),
    methods: z.nativeEnum(CircleCIConnectionMethod).array()
  })
  .describe(JSON.stringify({ title: APP_CONNECTION_NAME_MAP[AppConnection.CircleCI] }));
