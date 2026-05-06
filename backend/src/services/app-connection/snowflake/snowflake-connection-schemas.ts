import z from "zod";

import { AppConnections } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  BaseAppConnectionSchema,
  GenericCreateAppConnectionFieldsSchema,
  GenericUpdateAppConnectionFieldsSchema
} from "@app/services/app-connection/app-connection-schemas";

import { APP_CONNECTION_NAME_MAP } from "../app-connection-maps";
import { SnowflakeConnectionMethod } from "./snowflake-connection-enums";

export const SnowflakeConnectionAccessTokenCredentialsSchema = z.object({
  account: z.string().trim().min(1, "Account required").describe(AppConnections.CREDENTIALS.SNOWFLAKE.account),
  username: z.string().trim().min(1, "Username required").describe(AppConnections.CREDENTIALS.SNOWFLAKE.username),
  password: z
    .string()
    .trim()
    .min(1, "Programmatic Access Token required")
    .describe(AppConnections.CREDENTIALS.SNOWFLAKE.password)
});

const BaseSnowflakeConnectionSchema = BaseAppConnectionSchema.extend({ app: z.literal(AppConnection.Snowflake) });

export const SnowflakeConnectionSchema = BaseSnowflakeConnectionSchema.extend({
  method: z.literal(SnowflakeConnectionMethod.UsernameAndToken),
  credentials: SnowflakeConnectionAccessTokenCredentialsSchema
});

export const SanitizedSnowflakeConnectionSchema = z.discriminatedUnion("method", [
  BaseSnowflakeConnectionSchema.extend({
    method: z.literal(SnowflakeConnectionMethod.UsernameAndToken),
    credentials: SnowflakeConnectionAccessTokenCredentialsSchema.pick({
      account: true,
      username: true
    })
  }).describe(JSON.stringify({ title: `${APP_CONNECTION_NAME_MAP[AppConnection.Snowflake]} (Username and Token)` }))
]);

export const ValidateSnowflakeConnectionCredentialsSchema = z.discriminatedUnion("method", [
  z.object({
    method: z
      .literal(SnowflakeConnectionMethod.UsernameAndToken)
      .describe(AppConnections.CREATE(AppConnection.Snowflake).method),
    credentials: SnowflakeConnectionAccessTokenCredentialsSchema.describe(
      AppConnections.CREATE(AppConnection.Snowflake).credentials
    )
  })
]);

export const CreateSnowflakeConnectionSchema = ValidateSnowflakeConnectionCredentialsSchema.and(
  GenericCreateAppConnectionFieldsSchema(AppConnection.Snowflake)
);

export const UpdateSnowflakeConnectionSchema = z
  .object({
    credentials: SnowflakeConnectionAccessTokenCredentialsSchema.optional().describe(
      AppConnections.UPDATE(AppConnection.Snowflake).credentials
    )
  })
  .and(GenericUpdateAppConnectionFieldsSchema(AppConnection.Snowflake));

export const SnowflakeConnectionListItemSchema = z
  .object({
    name: z.literal("Snowflake"),
    app: z.literal(AppConnection.Snowflake),
    methods: z.nativeEnum(SnowflakeConnectionMethod).array()
  })
  .describe(JSON.stringify({ title: APP_CONNECTION_NAME_MAP[AppConnection.Snowflake] }));
