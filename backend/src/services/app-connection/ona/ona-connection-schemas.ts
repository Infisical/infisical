import z from "zod";

import { AppConnections } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  BaseAppConnectionSchema,
  GenericCreateAppConnectionFieldsSchema,
  GenericUpdateAppConnectionFieldsSchema
} from "@app/services/app-connection/app-connection-schemas";

import { APP_CONNECTION_NAME_MAP } from "../app-connection-maps";
import { OnaConnectionMethod } from "./ona-connection-enums";

export const OnaConnectionPersonalAccessTokenCredentialsSchema = z.object({
  personalAccessToken: z
    .string()
    .trim()
    .min(1, "Personal Access Token required")
    .describe(AppConnections.CREDENTIALS.ONA.personalAccessToken)
});

const BaseOnaConnectionSchema = BaseAppConnectionSchema.extend({
  app: z.literal(AppConnection.Ona)
});

export const OnaConnectionSchema = BaseOnaConnectionSchema.extend({
  method: z.literal(OnaConnectionMethod.PersonalAccessToken),
  credentials: OnaConnectionPersonalAccessTokenCredentialsSchema
});

export const SanitizedOnaConnectionSchema = z.discriminatedUnion("method", [
  BaseOnaConnectionSchema.extend({
    method: z.literal(OnaConnectionMethod.PersonalAccessToken),
    credentials: OnaConnectionPersonalAccessTokenCredentialsSchema.pick({})
  }).describe(JSON.stringify({ title: `${APP_CONNECTION_NAME_MAP[AppConnection.Ona]} (Personal Access Token)` }))
]);

export const ValidateOnaConnectionCredentialsSchema = z.discriminatedUnion("method", [
  z.object({
    method: z
      .literal(OnaConnectionMethod.PersonalAccessToken)
      .describe(AppConnections.CREATE(AppConnection.Ona).method),
    credentials: OnaConnectionPersonalAccessTokenCredentialsSchema.describe(
      AppConnections.CREATE(AppConnection.Ona).credentials
    )
  })
]);

export const CreateOnaConnectionSchema = ValidateOnaConnectionCredentialsSchema.and(
  GenericCreateAppConnectionFieldsSchema(AppConnection.Ona)
);

export const UpdateOnaConnectionSchema = z
  .object({
    credentials: OnaConnectionPersonalAccessTokenCredentialsSchema.optional().describe(
      AppConnections.UPDATE(AppConnection.Ona).credentials
    )
  })
  .and(GenericUpdateAppConnectionFieldsSchema(AppConnection.Ona));

export const OnaConnectionListItemSchema = z
  .object({
    name: z.literal("Ona"),
    app: z.literal(AppConnection.Ona),
    methods: z.nativeEnum(OnaConnectionMethod).array()
  })
  .describe(JSON.stringify({ title: APP_CONNECTION_NAME_MAP[AppConnection.Ona] }));
