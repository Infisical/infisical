import z from "zod";

import { AppConnections } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  BaseAppConnectionSchema,
  GenericCreateAppConnectionFieldsSchema,
  GenericUpdateAppConnectionFieldsSchema
} from "@app/services/app-connection/app-connection-schemas";

import { APP_CONNECTION_NAME_MAP } from "../app-connection-maps";
import { ConvexConnectionMethod } from "./convex-connection-constants";

export const ConvexConnectionMethodSchema = z
  .nativeEnum(ConvexConnectionMethod)
  .describe(AppConnections.CREATE(AppConnection.Convex).method);

export const ConvexConnectionAdminKeyCredentialsSchema = z.object({
  adminKey: z
    .string()
    .trim()
    .min(1, "Admin Key required")
    .max(255)
    .describe(AppConnections.CREDENTIALS.CONVEX.adminKey)
});

const BaseConvexConnectionSchema = BaseAppConnectionSchema.extend({
  app: z.literal(AppConnection.Convex)
});

export const ConvexConnectionSchema = BaseConvexConnectionSchema.extend({
  method: ConvexConnectionMethodSchema,
  credentials: ConvexConnectionAdminKeyCredentialsSchema
});

export const SanitizedConvexConnectionSchema = z.discriminatedUnion("method", [
  BaseConvexConnectionSchema.extend({
    method: ConvexConnectionMethodSchema,
    credentials: ConvexConnectionAdminKeyCredentialsSchema.pick({})
  }).describe(JSON.stringify({ title: `${APP_CONNECTION_NAME_MAP[AppConnection.Convex]} (Admin Key)` }))
]);

export const ValidateConvexConnectionCredentialsSchema = z.discriminatedUnion("method", [
  z.object({
    method: ConvexConnectionMethodSchema,
    credentials: ConvexConnectionAdminKeyCredentialsSchema.describe(
      AppConnections.CREATE(AppConnection.Convex).credentials
    )
  })
]);

export const CreateConvexConnectionSchema = ValidateConvexConnectionCredentialsSchema.and(
  GenericCreateAppConnectionFieldsSchema(AppConnection.Convex)
);

export const UpdateConvexConnectionSchema = z
  .object({
    credentials: ConvexConnectionAdminKeyCredentialsSchema.optional().describe(
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
