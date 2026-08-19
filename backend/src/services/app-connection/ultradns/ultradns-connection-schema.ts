import z from "zod";

import { AppConnections } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  BaseAppConnectionSchema,
  GenericCreateAppConnectionFieldsSchema,
  GenericUpdateAppConnectionFieldsSchema
} from "@app/services/app-connection/app-connection-schemas";

import { APP_CONNECTION_NAME_MAP } from "../app-connection-maps";
import { UltraDNSConnectionMethod, UltraDNSEnvironment } from "./ultradns-connection-enum";

export const UltraDNSConnectionUsernamePasswordCredentialsSchema = z.object({
  username: z.string().trim().min(1, "Username required").max(256, "Username cannot exceed 256 characters"),
  password: z.string().trim().min(1, "Password required").max(256, "Password cannot exceed 256 characters"),
  environment: z.nativeEnum(UltraDNSEnvironment)
});

const BaseUltraDNSConnectionSchema = BaseAppConnectionSchema.extend({
  app: z.literal(AppConnection.UltraDNS)
});

export const UltraDNSConnectionSchema = BaseUltraDNSConnectionSchema.extend({
  method: z.literal(UltraDNSConnectionMethod.UsernamePassword),
  credentials: UltraDNSConnectionUsernamePasswordCredentialsSchema
});

export const SanitizedUltraDNSConnectionSchema = z.discriminatedUnion("method", [
  BaseUltraDNSConnectionSchema.extend({
    method: z.literal(UltraDNSConnectionMethod.UsernamePassword),
    credentials: UltraDNSConnectionUsernamePasswordCredentialsSchema.pick({ username: true, environment: true })
  }).describe(JSON.stringify({ title: `${APP_CONNECTION_NAME_MAP[AppConnection.UltraDNS]} (Username & Password)` }))
]);

export const ValidateUltraDNSConnectionCredentialsSchema = z.discriminatedUnion("method", [
  z.object({
    method: z
      .literal(UltraDNSConnectionMethod.UsernamePassword)
      .describe(AppConnections.CREATE(AppConnection.UltraDNS).method),
    credentials: UltraDNSConnectionUsernamePasswordCredentialsSchema.describe(
      AppConnections.CREATE(AppConnection.UltraDNS).credentials
    )
  })
]);

export const CreateUltraDNSConnectionSchema = ValidateUltraDNSConnectionCredentialsSchema.and(
  GenericCreateAppConnectionFieldsSchema(AppConnection.UltraDNS)
);

export const UpdateUltraDNSConnectionSchema = z
  .object({
    credentials: UltraDNSConnectionUsernamePasswordCredentialsSchema.optional().describe(
      AppConnections.UPDATE(AppConnection.UltraDNS).credentials
    )
  })
  .and(GenericUpdateAppConnectionFieldsSchema(AppConnection.UltraDNS));

export const UltraDNSConnectionListItemSchema = z
  .object({
    name: z.literal("UltraDNS"),
    app: z.literal(AppConnection.UltraDNS),
    methods: z.nativeEnum(UltraDNSConnectionMethod).array()
  })
  .describe(JSON.stringify({ title: APP_CONNECTION_NAME_MAP[AppConnection.UltraDNS] }));
