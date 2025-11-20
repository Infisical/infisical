import z from "zod";

import { AppConnections } from "@app/lib/api-docs";
import {
  BaseAppConnectionSchema,
  GenericCreateAppConnectionFieldsSchema,
  GenericUpdateAppConnectionFieldsSchema
} from "@app/services/app-connection/app-connection-schemas";

import { AppConnection } from "../app-connection-enums";
import { APP_CONNECTION_NAME_MAP } from "../app-connection-maps";
import { RedisConnectionMethod } from "./redis-connection-enums";

export const BaseRedisUsernameAndPasswordConnectionSchema = z.object({
  host: z.string().toLowerCase().min(1),
  port: z.coerce.number(),
  username: z.string().min(1),
  password: z.string().min(1).optional(),

  sslRejectUnauthorized: z.boolean(),
  sslEnabled: z.boolean(),
  sslCertificate: z
    .string()
    .trim()
    .transform((value) => value || undefined)
    .optional()
});

export const RedisConnectionAccessTokenCredentialsSchema = BaseRedisUsernameAndPasswordConnectionSchema;

const BaseRedisConnectionSchema = BaseAppConnectionSchema.extend({ app: z.literal(AppConnection.Redis) });

export const RedisConnectionSchema = BaseRedisConnectionSchema.extend({
  method: z.literal(RedisConnectionMethod.UsernameAndPassword),
  credentials: RedisConnectionAccessTokenCredentialsSchema
});

export const SanitizedRedisConnectionSchema = z.discriminatedUnion("method", [
  BaseRedisConnectionSchema.extend({
    method: z.literal(RedisConnectionMethod.UsernameAndPassword),
    credentials: RedisConnectionAccessTokenCredentialsSchema.pick({
      host: true,
      port: true,
      username: true,
      sslEnabled: true,
      sslRejectUnauthorized: true,
      sslCertificate: true
    })
  }).describe(JSON.stringify({ title: `${APP_CONNECTION_NAME_MAP[AppConnection.Redis]} (Username and Password)` }))
]);

export const ValidateRedisConnectionCredentialsSchema = z.discriminatedUnion("method", [
  z.object({
    method: z
      .literal(RedisConnectionMethod.UsernameAndPassword)
      .describe(AppConnections.CREATE(AppConnection.Redis).method),
    credentials: RedisConnectionAccessTokenCredentialsSchema.describe(
      AppConnections.CREATE(AppConnection.Redis).credentials
    )
  })
]);

export const CreateRedisConnectionSchema = ValidateRedisConnectionCredentialsSchema.and(
  GenericCreateAppConnectionFieldsSchema(AppConnection.Redis, {
    supportsPlatformManagedCredentials: false,
    supportsGateways: false
  })
);

export const UpdateRedisConnectionSchema = z
  .object({
    credentials: RedisConnectionAccessTokenCredentialsSchema.optional().describe(
      AppConnections.UPDATE(AppConnection.Redis).credentials
    )
  })
  .and(
    GenericUpdateAppConnectionFieldsSchema(AppConnection.Redis, {
      supportsPlatformManagedCredentials: false,
      supportsGateways: false
    })
  );

export const RedisConnectionListItemSchema = z
  .object({
    name: z.literal("Redis"),
    app: z.literal(AppConnection.Redis),
    methods: z.nativeEnum(RedisConnectionMethod).array(),
    supportsPlatformManagement: z.literal(false)
  })
  .describe(JSON.stringify({ title: APP_CONNECTION_NAME_MAP[AppConnection.Redis] }));
