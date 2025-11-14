import z from "zod";

import { AppConnections } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  BaseAppConnectionSchema,
  GenericCreateAppConnectionFieldsSchema,
  GenericUpdateAppConnectionFieldsSchema
} from "@app/services/app-connection/app-connection-schemas";

import { APP_CONNECTION_NAME_MAP } from "../app-connection-maps";
import { NetlifyConnectionMethod } from "./netlify-connection-constants";

export const NetlifyConnectionMethodSchema = z
  .nativeEnum(NetlifyConnectionMethod)
  .describe(AppConnections.CREATE(AppConnection.Netlify).method);

export const NetlifyConnectionAccessTokenCredentialsSchema = z.object({
  accessToken: z
    .string()
    .trim()
    .min(1, "Access Token required")
    .max(255)
    .describe(AppConnections.CREDENTIALS.NETLIFY.accessToken)
});

const BaseNetlifyConnectionSchema = BaseAppConnectionSchema.extend({
  app: z.literal(AppConnection.Netlify)
});

export const NetlifyConnectionSchema = BaseNetlifyConnectionSchema.extend({
  method: NetlifyConnectionMethodSchema,
  credentials: NetlifyConnectionAccessTokenCredentialsSchema
});

export const SanitizedNetlifyConnectionSchema = z.discriminatedUnion("method", [
  BaseNetlifyConnectionSchema.extend({
    method: NetlifyConnectionMethodSchema,
    credentials: NetlifyConnectionAccessTokenCredentialsSchema.pick({})
  }).describe(JSON.stringify({ title: `${APP_CONNECTION_NAME_MAP[AppConnection.Netlify]} (Access Token)` }))
]);

export const ValidateNetlifyConnectionCredentialsSchema = z.discriminatedUnion("method", [
  z.object({
    method: NetlifyConnectionMethodSchema,
    credentials: NetlifyConnectionAccessTokenCredentialsSchema.describe(
      AppConnections.CREATE(AppConnection.Netlify).credentials
    )
  })
]);

export const CreateNetlifyConnectionSchema = ValidateNetlifyConnectionCredentialsSchema.and(
  GenericCreateAppConnectionFieldsSchema(AppConnection.Netlify)
);

export const UpdateNetlifyConnectionSchema = z
  .object({
    credentials: NetlifyConnectionAccessTokenCredentialsSchema.optional().describe(
      AppConnections.UPDATE(AppConnection.Netlify).credentials
    )
  })
  .and(GenericUpdateAppConnectionFieldsSchema(AppConnection.Netlify));

export const NetlifyConnectionListItemSchema = z
  .object({
    name: z.literal("Netlify"),
    app: z.literal(AppConnection.Netlify),
    methods: z.nativeEnum(NetlifyConnectionMethod).array()
  })
  .describe(JSON.stringify({ title: APP_CONNECTION_NAME_MAP[AppConnection.Netlify] }));
