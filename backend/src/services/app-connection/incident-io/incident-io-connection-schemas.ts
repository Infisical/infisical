import z from "zod";

import { AppConnections } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  BaseAppConnectionSchema,
  GenericCreateAppConnectionFieldsSchema,
  GenericUpdateAppConnectionFieldsSchema
} from "@app/services/app-connection/app-connection-schemas";

import { APP_CONNECTION_NAME_MAP } from "../app-connection-maps";
import { IncidentIoConnectionMethod } from "./incident-io-connection-enums";

export const IncidentIoConnectionApiKeyCredentialsSchema = z.object({
  apiKey: z
    .string()
    .trim()
    .min(1, "API key required")
    .max(1024, "API key cannot exceed 1024 characters")
    .describe(AppConnections.CREDENTIALS.INCIDENT_IO.apiKey)
});

const BaseIncidentIoConnectionSchema = BaseAppConnectionSchema.extend({ app: z.literal(AppConnection.IncidentIo) });

export const IncidentIoConnectionSchema = BaseIncidentIoConnectionSchema.extend({
  method: z.literal(IncidentIoConnectionMethod.ApiKey),
  credentials: IncidentIoConnectionApiKeyCredentialsSchema
});

export const SanitizedIncidentIoConnectionSchema = z.discriminatedUnion("method", [
  BaseIncidentIoConnectionSchema.extend({
    method: z.literal(IncidentIoConnectionMethod.ApiKey),
    credentials: IncidentIoConnectionApiKeyCredentialsSchema.pick({})
  }).describe(JSON.stringify({ title: `${APP_CONNECTION_NAME_MAP[AppConnection.IncidentIo]} (API Key)` }))
]);

export const ValidateIncidentIoConnectionCredentialsSchema = z.discriminatedUnion("method", [
  z.object({
    method: z
      .literal(IncidentIoConnectionMethod.ApiKey)
      .describe(AppConnections.CREATE(AppConnection.IncidentIo).method),
    credentials: IncidentIoConnectionApiKeyCredentialsSchema.describe(
      AppConnections.CREATE(AppConnection.IncidentIo).credentials
    )
  })
]);

export const CreateIncidentIoConnectionSchema = ValidateIncidentIoConnectionCredentialsSchema.and(
  GenericCreateAppConnectionFieldsSchema(AppConnection.IncidentIo)
);

export const UpdateIncidentIoConnectionSchema = z
  .object({
    credentials: IncidentIoConnectionApiKeyCredentialsSchema.optional().describe(
      AppConnections.UPDATE(AppConnection.IncidentIo).credentials
    )
  })
  .and(GenericUpdateAppConnectionFieldsSchema(AppConnection.IncidentIo));

export const IncidentIoConnectionListItemSchema = z
  .object({
    name: z.literal("incident.io"),
    app: z.literal(AppConnection.IncidentIo),
    methods: z.nativeEnum(IncidentIoConnectionMethod).array()
  })
  .describe(JSON.stringify({ title: APP_CONNECTION_NAME_MAP[AppConnection.IncidentIo] }));
