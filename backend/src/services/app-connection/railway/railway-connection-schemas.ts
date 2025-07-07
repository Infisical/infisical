import z from "zod";

import { AppConnections } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  BaseAppConnectionSchema,
  GenericCreateAppConnectionFieldsSchema,
  GenericUpdateAppConnectionFieldsSchema
} from "@app/services/app-connection/app-connection-schemas";

import { RailwayConnectionMethod } from "./railway-connection-constants";

export const RailwayConnectionAccessTokenCredentialsSchema = z.object({
  apiToken: z.string().trim().min(1, "API Token required").describe(AppConnections.CREDENTIALS.RAILWAY.apiToken)
});

const BaseRailwayConnectionSchema = BaseAppConnectionSchema.extend({
  app: z.literal(AppConnection.Railway)
});

export const RailwayConnectionSchema = BaseRailwayConnectionSchema.extend({
  method: z.literal(RailwayConnectionMethod.ApiToken),
  credentials: RailwayConnectionAccessTokenCredentialsSchema
});

export const SanitizedRailwayConnectionSchema = z.discriminatedUnion("method", [
  BaseRailwayConnectionSchema.extend({
    method: z.literal(RailwayConnectionMethod.ApiToken),
    credentials: RailwayConnectionAccessTokenCredentialsSchema.pick({})
  })
]);

export const ValidateRailwayConnectionCredentialsSchema = z.discriminatedUnion("method", [
  z.object({
    method: z.literal(RailwayConnectionMethod.ApiToken).describe(AppConnections.CREATE(AppConnection.Railway).method),
    credentials: RailwayConnectionAccessTokenCredentialsSchema.describe(
      AppConnections.CREATE(AppConnection.Railway).credentials
    )
  })
]);

export const CreateRailwayConnectionSchema = ValidateRailwayConnectionCredentialsSchema.and(
  GenericCreateAppConnectionFieldsSchema(AppConnection.Railway)
);

export const UpdateRailwayConnectionSchema = z
  .object({
    credentials: RailwayConnectionAccessTokenCredentialsSchema.optional().describe(
      AppConnections.UPDATE(AppConnection.Railway).credentials
    )
  })
  .and(GenericUpdateAppConnectionFieldsSchema(AppConnection.Railway));

export const RailwayConnectionListItemSchema = z.object({
  name: z.literal("Railway"),
  app: z.literal(AppConnection.Railway),
  methods: z.nativeEnum(RailwayConnectionMethod).array()
});
