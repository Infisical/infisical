import z from "zod";

import { AppConnections } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  BaseAppConnectionSchema,
  GenericCreateAppConnectionFieldsSchema,
  GenericUpdateAppConnectionFieldsSchema
} from "@app/services/app-connection/app-connection-schemas";

import { APP_CONNECTION_NAME_MAP } from "../app-connection-maps";
import { QoveryConnectionMethod } from "./qovery-connection-enums";

export const QoveryConnectionAccessTokenCredentialsSchema = z.object({
  accessToken: z
    .string()
    .trim()
    .min(1, "Project Access Token required")
    .describe(AppConnections.CREDENTIALS.QOVERY.accessToken)
});

const BaseQoveryConnectionSchema = BaseAppConnectionSchema.extend({
  app: z.literal(AppConnection.Qovery)
});

export const QoveryConnectionSchema = z.discriminatedUnion("method", [
  BaseQoveryConnectionSchema.extend({
    method: z.literal(QoveryConnectionMethod.AccessToken),
    credentials: QoveryConnectionAccessTokenCredentialsSchema
  })
]);

export const SanitizedQoveryConnectionSchema = z.discriminatedUnion("method", [
  BaseQoveryConnectionSchema.extend({
    method: z.literal(QoveryConnectionMethod.AccessToken),
    credentials: QoveryConnectionAccessTokenCredentialsSchema.pick({})
  }).describe(JSON.stringify({ title: `${APP_CONNECTION_NAME_MAP[AppConnection.Qovery]} (Access Token)` }))
]);

export const ValidateQoveryConnectionCredentialsSchema = z.discriminatedUnion("method", [
  z.object({
    method: z.literal(QoveryConnectionMethod.AccessToken).describe(AppConnections.CREATE(AppConnection.Qovery).method),
    credentials: QoveryConnectionAccessTokenCredentialsSchema.describe(
      AppConnections.CREATE(AppConnection.Qovery).credentials
    )
  })
]);

export const CreateQoveryConnectionSchema = ValidateQoveryConnectionCredentialsSchema.and(
  GenericCreateAppConnectionFieldsSchema(AppConnection.Qovery)
);

export const UpdateQoveryConnectionSchema = z
  .object({
    credentials: QoveryConnectionAccessTokenCredentialsSchema.optional().describe(
      AppConnections.UPDATE(AppConnection.Qovery).credentials
    )
  })
  .and(GenericUpdateAppConnectionFieldsSchema(AppConnection.Qovery));

export const QoveryConnectionListItemSchema = z
  .object({
    name: z.literal("Qovery"),
    app: z.literal(AppConnection.Qovery),
    methods: z.nativeEnum(QoveryConnectionMethod).array()
  })
  .describe(JSON.stringify({ title: APP_CONNECTION_NAME_MAP[AppConnection.Qovery] }));
