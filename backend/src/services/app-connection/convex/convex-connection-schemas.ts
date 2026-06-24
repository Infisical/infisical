import z from "zod";

import { AppConnections } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  BaseAppConnectionSchema,
  GenericCreateAppConnectionFieldsSchema,
  GenericUpdateAppConnectionFieldsSchema
} from "@app/services/app-connection/app-connection-schemas";

import { APP_CONNECTION_NAME_MAP } from "../app-connection-maps";
import { ConvexConnectionMethod } from "./convex-connection-enums";

export const ConvexConnectionAccessTokenCredentialsSchema = z.object({
  accessToken: z
    .string()
    .trim()
    .min(1, "Access Token required")
    .describe(AppConnections.CREDENTIALS.CONVEX.accessToken),
  instanceUrl: z
    .string()
    .trim()
    .url("Invalid Instance URL")
    .refine((url) => url.startsWith("https://"), "Instance URL must use HTTPS")
    .optional()
    .describe(AppConnections.CREDENTIALS.CONVEX.instanceUrl)
});

const BaseConvexConnectionSchema = BaseAppConnectionSchema.extend({ app: z.literal(AppConnection.Convex) });

export const ConvexConnectionSchema = BaseConvexConnectionSchema.extend({
  method: z.literal(ConvexConnectionMethod.PersonalAccessToken),
  credentials: ConvexConnectionAccessTokenCredentialsSchema
});

export const SanitizedConvexConnectionSchema = z.discriminatedUnion("method", [
  BaseConvexConnectionSchema.extend({
    method: z.literal(ConvexConnectionMethod.PersonalAccessToken),
    credentials: ConvexConnectionAccessTokenCredentialsSchema.pick({
      instanceUrl: true
    })
  }).describe(JSON.stringify({ title: `${APP_CONNECTION_NAME_MAP[AppConnection.Convex]} (Personal Access Token)` }))
]);

export const ValidateConvexConnectionCredentialsSchema = z.discriminatedUnion("method", [
  z.object({
    method: z
      .literal(ConvexConnectionMethod.PersonalAccessToken)
      .describe(AppConnections.CREATE(AppConnection.Convex).method),
    credentials: ConvexConnectionAccessTokenCredentialsSchema.describe(
      AppConnections.CREATE(AppConnection.Convex).credentials
    )
  })
]);

export const CreateConvexConnectionSchema = ValidateConvexConnectionCredentialsSchema.and(
  GenericCreateAppConnectionFieldsSchema(AppConnection.Convex)
);

export const UpdateConvexConnectionSchema = z
  .object({
    credentials: ConvexConnectionAccessTokenCredentialsSchema.optional().describe(
      AppConnections.UPDATE(AppConnection.Convex).credentials
    )
  })
  .and(GenericUpdateAppConnectionFieldsSchema(AppConnection.Convex));

export const ConvexConnectionListItemSchema = z
  .object({
    name: z.literal("Convex"),
    app: z.literal(AppConnection.Convex),
    methods: z.nativeEnum(ConvexConnectionMethod).array()
  })
  .describe(JSON.stringify({ title: APP_CONNECTION_NAME_MAP[AppConnection.Convex] }));
