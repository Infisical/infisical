import z from "zod";

import { AppConnections } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  BaseAppConnectionSchema,
  GenericCreateAppConnectionFieldsSchema,
  GenericUpdateAppConnectionFieldsSchema
} from "@app/services/app-connection/app-connection-schemas";

import { APP_CONNECTION_NAME_MAP } from "../app-connection-maps";
import { Cloud66ConnectionMethod } from "./cloud-66-connection-enums";

export const Cloud66ConnectionAccessTokenCredentialsSchema = z.object({
  accessToken: z
    .string()
    .trim()
    .min(1, "Personal Access Token required")
    .describe(AppConnections.CREDENTIALS.CLOUD66.accessToken)
});

const BaseCloud66ConnectionSchema = BaseAppConnectionSchema.extend({ app: z.literal(AppConnection.Cloud66) });

export const Cloud66ConnectionSchema = BaseCloud66ConnectionSchema.extend({
  method: z.literal(Cloud66ConnectionMethod.AccessToken),
  credentials: Cloud66ConnectionAccessTokenCredentialsSchema
});

export const SanitizedCloud66ConnectionSchema = z.discriminatedUnion("method", [
  BaseCloud66ConnectionSchema.extend({
    method: z.literal(Cloud66ConnectionMethod.AccessToken),
    credentials: z.object({})
  }).describe(JSON.stringify({ title: `${APP_CONNECTION_NAME_MAP[AppConnection.Cloud66]} (Personal Access Token)` }))
]);

export const ValidateCloud66ConnectionCredentialsSchema = z.discriminatedUnion("method", [
  z.object({
    method: z
      .literal(Cloud66ConnectionMethod.AccessToken)
      .describe(AppConnections.CREATE(AppConnection.Cloud66).method),
    credentials: Cloud66ConnectionAccessTokenCredentialsSchema.describe(
      AppConnections.CREATE(AppConnection.Cloud66).credentials
    )
  })
]);

export const CreateCloud66ConnectionSchema = ValidateCloud66ConnectionCredentialsSchema.and(
  GenericCreateAppConnectionFieldsSchema(AppConnection.Cloud66)
);

export const UpdateCloud66ConnectionSchema = z
  .object({
    credentials: Cloud66ConnectionAccessTokenCredentialsSchema.optional().describe(
      AppConnections.UPDATE(AppConnection.Cloud66).credentials
    )
  })
  .and(GenericUpdateAppConnectionFieldsSchema(AppConnection.Cloud66));

export const Cloud66ConnectionListItemSchema = z
  .object({
    name: z.literal("Cloud 66"),
    app: z.literal(AppConnection.Cloud66),
    methods: z.nativeEnum(Cloud66ConnectionMethod).array()
  })
  .describe(JSON.stringify({ title: APP_CONNECTION_NAME_MAP[AppConnection.Cloud66] }));
