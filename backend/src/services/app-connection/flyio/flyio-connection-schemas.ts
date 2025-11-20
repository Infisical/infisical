import z from "zod";

import { AppConnections } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  BaseAppConnectionSchema,
  GenericCreateAppConnectionFieldsSchema,
  GenericUpdateAppConnectionFieldsSchema
} from "@app/services/app-connection/app-connection-schemas";

import { APP_CONNECTION_NAME_MAP } from "../app-connection-maps";
import { FlyioConnectionMethod } from "./flyio-connection-enums";

export const FlyioConnectionAccessTokenCredentialsSchema = z.object({
  accessToken: z
    .string()
    .trim()
    .min(1, "Access Token required")
    .max(1000)
    .startsWith("FlyV1", "Token must start with 'FlyV1'")
    .describe(AppConnections.CREDENTIALS.FLYIO.accessToken)
});

const BaseFlyioConnectionSchema = BaseAppConnectionSchema.extend({ app: z.literal(AppConnection.Flyio) });

export const FlyioConnectionSchema = BaseFlyioConnectionSchema.extend({
  method: z.literal(FlyioConnectionMethod.AccessToken),
  credentials: FlyioConnectionAccessTokenCredentialsSchema
});

export const SanitizedFlyioConnectionSchema = z.discriminatedUnion("method", [
  BaseFlyioConnectionSchema.extend({
    method: z.literal(FlyioConnectionMethod.AccessToken),
    credentials: FlyioConnectionAccessTokenCredentialsSchema.pick({})
  }).describe(JSON.stringify({ title: `${APP_CONNECTION_NAME_MAP[AppConnection.Flyio]} (Access Token)` }))
]);

export const ValidateFlyioConnectionCredentialsSchema = z.discriminatedUnion("method", [
  z.object({
    method: z.literal(FlyioConnectionMethod.AccessToken).describe(AppConnections.CREATE(AppConnection.Flyio).method),
    credentials: FlyioConnectionAccessTokenCredentialsSchema.describe(
      AppConnections.CREATE(AppConnection.Flyio).credentials
    )
  })
]);

export const CreateFlyioConnectionSchema = ValidateFlyioConnectionCredentialsSchema.and(
  GenericCreateAppConnectionFieldsSchema(AppConnection.Flyio)
);

export const UpdateFlyioConnectionSchema = z
  .object({
    credentials: FlyioConnectionAccessTokenCredentialsSchema.optional().describe(
      AppConnections.UPDATE(AppConnection.Flyio).credentials
    )
  })
  .and(GenericUpdateAppConnectionFieldsSchema(AppConnection.Flyio));

export const FlyioConnectionListItemSchema = z
  .object({
    name: z.literal("Fly.io"),
    app: z.literal(AppConnection.Flyio),
    methods: z.nativeEnum(FlyioConnectionMethod).array()
  })
  .describe(JSON.stringify({ title: APP_CONNECTION_NAME_MAP[AppConnection.Flyio] }));
