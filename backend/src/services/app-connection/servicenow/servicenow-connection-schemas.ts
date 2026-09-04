import z from "zod";

import { AppConnections } from "@app/lib/api-docs";
import { removeTrailingSlash } from "@app/lib/fn";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  BaseAppConnectionSchema,
  GenericCreateAppConnectionFieldsSchema,
  GenericUpdateAppConnectionFieldsSchema
} from "@app/services/app-connection/app-connection-schemas";

import { APP_CONNECTION_NAME_MAP } from "../app-connection-maps";
import { ServiceNowConnectionMethod } from "./servicenow-connection-enums";

export const ServiceNowConnectionBasicAuthCredentialsSchema = z.object({
  instanceUrl: z
    .string()
    .trim()
    .url("Invalid Instance URL")
    .max(512, "Instance URL cannot exceed 512 characters")
    .refine((value) => {
      const { pathname, search, hash } = new URL(value);
      return (pathname === "" || pathname === "/") && !search && !hash;
    }, "Instance URL must be the base URL of your ServiceNow instance, without a path or query string")
    .transform(removeTrailingSlash)
    .describe(AppConnections.CREDENTIALS.SERVICENOW.instanceUrl),
  username: z
    .string()
    .trim()
    .min(1, "Username is required")
    .max(256, "Username cannot exceed 256 characters")
    .describe(AppConnections.CREDENTIALS.SERVICENOW.username),
  password: z
    .string()
    .trim()
    .min(1, "Password is required")
    .max(512, "Password cannot exceed 512 characters")
    .describe(AppConnections.CREDENTIALS.SERVICENOW.password)
});

const BaseServiceNowConnectionSchema = BaseAppConnectionSchema.extend({ app: z.literal(AppConnection.ServiceNow) });

export const ServiceNowConnectionSchema = BaseServiceNowConnectionSchema.extend({
  method: z.literal(ServiceNowConnectionMethod.BasicAuth),
  credentials: ServiceNowConnectionBasicAuthCredentialsSchema
});

export const SanitizedServiceNowConnectionSchema = z.discriminatedUnion("method", [
  BaseServiceNowConnectionSchema.extend({
    method: z.literal(ServiceNowConnectionMethod.BasicAuth),
    credentials: ServiceNowConnectionBasicAuthCredentialsSchema.pick({ instanceUrl: true, username: true })
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
