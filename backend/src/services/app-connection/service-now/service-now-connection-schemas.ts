import z from "zod";

import { AppConnections } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  BaseAppConnectionSchema,
  GenericCreateAppConnectionFieldsSchema,
  GenericUpdateAppConnectionFieldsSchema
} from "@app/services/app-connection/app-connection-schemas";

import { APP_CONNECTION_NAME_MAP } from "../app-connection-maps";
import { ServiceNowConnectionMethod } from "./service-now-connection-enums";

export const ServiceNowConnectionBasicAuthCredentialsSchema = z.object({
  instanceUrl: z
    .string()
    .trim()
    .url("Instance URL must be a valid URL")
    .min(1, "Instance URL is required")
    .describe(AppConnections.CREDENTIALS.SERVICE_NOW.instanceUrl),
  username: z.string().trim().min(1, "Username is required").describe(AppConnections.CREDENTIALS.SERVICE_NOW.username),
  password: z.string().trim().min(1, "Password is required").describe(AppConnections.CREDENTIALS.SERVICE_NOW.password)
});

const BaseServiceNowConnectionSchema = BaseAppConnectionSchema.extend({ app: z.literal(AppConnection.ServiceNow) });

export const ServiceNowConnectionSchema = z.discriminatedUnion("method", [
  BaseServiceNowConnectionSchema.extend({
    method: z.literal(ServiceNowConnectionMethod.BasicAuth),
    credentials: ServiceNowConnectionBasicAuthCredentialsSchema
  })
]);

export const SanitizedServiceNowConnectionSchema = z.discriminatedUnion("method", [
  BaseServiceNowConnectionSchema.extend({
    method: z.literal(ServiceNowConnectionMethod.BasicAuth),
    credentials: ServiceNowConnectionBasicAuthCredentialsSchema.pick({
      instanceUrl: true,
      username: true
    })
  }).describe(JSON.stringify({ title: `${APP_CONNECTION_NAME_MAP[AppConnection.ServiceNow]} (Basic Auth)` }))
]);

export const ValidateServiceNowConnectionCredentialsSchema = z.discriminatedUnion("method", [
  z.object({
    method: z
      .literal(ServiceNowConnectionMethod.BasicAuth)
      .describe(AppConnections.CREATE(AppConnection.ServiceNow).method),
    credentials: ServiceNowConnectionBasicAuthCredentialsSchema.describe(
      AppConnections.CREATE(AppConnection.ServiceNow).credentials
    )
  })
]);

export const CreateServiceNowConnectionSchema = ValidateServiceNowConnectionCredentialsSchema.and(
  GenericCreateAppConnectionFieldsSchema(AppConnection.ServiceNow)
);

export const UpdateServiceNowConnectionSchema = z
  .object({
    credentials: ServiceNowConnectionBasicAuthCredentialsSchema.optional().describe(
      AppConnections.UPDATE(AppConnection.ServiceNow).credentials
    )
  })
  .and(GenericUpdateAppConnectionFieldsSchema(AppConnection.ServiceNow));

export const ServiceNowConnectionListItemSchema = z
  .object({
    name: z.literal("ServiceNow"),
    app: z.literal(AppConnection.ServiceNow),
    methods: z.nativeEnum(ServiceNowConnectionMethod).array()
  })
  .describe(JSON.stringify({ title: APP_CONNECTION_NAME_MAP[AppConnection.ServiceNow] }));
