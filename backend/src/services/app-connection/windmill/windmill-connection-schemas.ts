import z from "zod";

import { AppConnections } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  BaseAppConnectionSchema,
  GenericCreateAppConnectionFieldsSchema,
  GenericUpdateAppConnectionFieldsSchema
} from "@app/services/app-connection/app-connection-schemas";

import { APP_CONNECTION_NAME_MAP } from "../app-connection-maps";
import { WindmillConnectionMethod } from "./windmill-connection-enums";

export const WindmillConnectionAccessTokenCredentialsSchema = z.object({
  accessToken: z
    .string()
    .trim()
    .min(1, "Access Token required")
    .describe(AppConnections.CREDENTIALS.WINDMILL.accessToken),
  instanceUrl: z
    .string()
    .trim()
    .url("Invalid Instance URL")
    .optional()
    .describe(AppConnections.CREDENTIALS.WINDMILL.instanceUrl)
});

const BaseWindmillConnectionSchema = BaseAppConnectionSchema.extend({ app: z.literal(AppConnection.Windmill) });

export const WindmillConnectionSchema = BaseWindmillConnectionSchema.extend({
  method: z.literal(WindmillConnectionMethod.AccessToken),
  credentials: WindmillConnectionAccessTokenCredentialsSchema
});

export const SanitizedWindmillConnectionSchema = z.discriminatedUnion("method", [
  BaseWindmillConnectionSchema.extend({
    method: z.literal(WindmillConnectionMethod.AccessToken),
    credentials: WindmillConnectionAccessTokenCredentialsSchema.pick({
      instanceUrl: true
    })
  }).describe(JSON.stringify({ title: `${APP_CONNECTION_NAME_MAP[AppConnection.Windmill]} (Access Token)` }))
]);

export const ValidateWindmillConnectionCredentialsSchema = z.discriminatedUnion("method", [
  z.object({
    method: z
      .literal(WindmillConnectionMethod.AccessToken)
      .describe(AppConnections.CREATE(AppConnection.Windmill).method),
    credentials: WindmillConnectionAccessTokenCredentialsSchema.describe(
      AppConnections.CREATE(AppConnection.Windmill).credentials
    )
  })
]);

export const CreateWindmillConnectionSchema = ValidateWindmillConnectionCredentialsSchema.and(
  GenericCreateAppConnectionFieldsSchema(AppConnection.Windmill)
);

export const UpdateWindmillConnectionSchema = z
  .object({
    credentials: WindmillConnectionAccessTokenCredentialsSchema.optional().describe(
      AppConnections.UPDATE(AppConnection.Windmill).credentials
    )
  })
  .and(GenericUpdateAppConnectionFieldsSchema(AppConnection.Windmill));

export const WindmillConnectionListItemSchema = z
  .object({
    name: z.literal("Windmill"),
    app: z.literal(AppConnection.Windmill),
    methods: z.nativeEnum(WindmillConnectionMethod).array()
  })
  .describe(JSON.stringify({ title: APP_CONNECTION_NAME_MAP[AppConnection.Windmill] }));
