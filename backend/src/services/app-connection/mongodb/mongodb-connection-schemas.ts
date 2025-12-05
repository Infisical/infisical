import z from "zod";

import { AppConnections } from "@app/lib/api-docs";
import {
  BaseAppConnectionSchema,
  GenericCreateAppConnectionFieldsSchema,
  GenericUpdateAppConnectionFieldsSchema
} from "@app/services/app-connection/app-connection-schemas";

import { AppConnection } from "../app-connection-enums";
import { MongoDBConnectionMethod } from "./mongodb-connection-enums";

export const BaseMongoDBUsernameAndPasswordConnectionSchema = z.object({
  host: z.string().toLowerCase().min(1),
  port: z.coerce.number(),
  username: z.string().min(1),
  password: z.string().min(1),
  database: z.string().min(1).trim(),

  tlsRejectUnauthorized: z.boolean(),
  tlsEnabled: z.boolean(),
  tlsCertificate: z
    .string()
    .trim()
    .transform((value) => value || undefined)
    .optional()
});

export const MongoDBConnectionAccessTokenCredentialsSchema = BaseMongoDBUsernameAndPasswordConnectionSchema;

const BaseMongoDBConnectionSchema = BaseAppConnectionSchema.extend({ app: z.literal(AppConnection.MongoDB) });

export const MongoDBConnectionSchema = BaseMongoDBConnectionSchema.extend({
  method: z.literal(MongoDBConnectionMethod.UsernameAndPassword),
  credentials: MongoDBConnectionAccessTokenCredentialsSchema
});

export const SanitizedMongoDBConnectionSchema = z.discriminatedUnion("method", [
  BaseMongoDBConnectionSchema.extend({
    method: z.literal(MongoDBConnectionMethod.UsernameAndPassword),
    credentials: MongoDBConnectionAccessTokenCredentialsSchema.pick({
      host: true,
      port: true,
      username: true,
      database: true,
      tlsEnabled: true,
      tlsRejectUnauthorized: true,
      tlsCertificate: true
    })
  })
]);

export const ValidateMongoDBConnectionCredentialsSchema = z.discriminatedUnion("method", [
  z.object({
    method: z
      .literal(MongoDBConnectionMethod.UsernameAndPassword)
      .describe(AppConnections.CREATE(AppConnection.MongoDB).method),
    credentials: MongoDBConnectionAccessTokenCredentialsSchema.describe(
      AppConnections.CREATE(AppConnection.MongoDB).credentials
    )
  })
]);

export const CreateMongoDBConnectionSchema = ValidateMongoDBConnectionCredentialsSchema.and(
  GenericCreateAppConnectionFieldsSchema(AppConnection.MongoDB, {
    supportsPlatformManagedCredentials: false,
    supportsGateways: false
  })
);

export const UpdateMongoDBConnectionSchema = z
  .object({
    credentials: MongoDBConnectionAccessTokenCredentialsSchema.optional().describe(
      AppConnections.UPDATE(AppConnection.MongoDB).credentials
    )
  })
  .and(
    GenericUpdateAppConnectionFieldsSchema(AppConnection.MongoDB, {
      supportsPlatformManagedCredentials: false,
      supportsGateways: false
    })
  );

export const MongoDBConnectionListItemSchema = z.object({
  name: z.literal("MongoDB"),
  app: z.literal(AppConnection.MongoDB),
  methods: z.nativeEnum(MongoDBConnectionMethod).array(),
  supportsPlatformManagement: z.literal(false)
});
