import z from "zod";

import { AppConnections } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  BaseAppConnectionSchema,
  GenericCreateAppConnectionFieldsSchema,
  GenericUpdateAppConnectionFieldsSchema
} from "@app/services/app-connection/app-connection-schemas";

import { APP_CONNECTION_NAME_MAP } from "../app-connection-maps";
import { DopplerConnectionMethod } from "./doppler-connection-enums";

export const DopplerConnectionApiTokenCredentialsSchema = z.object({
  apiToken: z
    .string()
    .trim()
    .min(1, "API token required")
    .max(512, "API token cannot exceed 512 characters")
});

const BaseDopplerConnectionSchema = BaseAppConnectionSchema.extend({ app: z.literal(AppConnection.Doppler) });

export const DopplerConnectionSchema = BaseDopplerConnectionSchema.extend({
  method: z.literal(DopplerConnectionMethod.ApiToken),
  credentials: DopplerConnectionApiTokenCredentialsSchema
});

export const SanitizedDopplerConnectionSchema = z.discriminatedUnion("method", [
  BaseDopplerConnectionSchema.extend({
    method: z.literal(DopplerConnectionMethod.ApiToken),
    credentials: DopplerConnectionApiTokenCredentialsSchema.pick({})
  }).describe(JSON.stringify({ title: `${APP_CONNECTION_NAME_MAP[AppConnection.Doppler]} (API Token)` }))
]);

export const ValidateDopplerConnectionCredentialsSchema = z.discriminatedUnion("method", [
  z.object({
    method: z.literal(DopplerConnectionMethod.ApiToken).describe(AppConnections.CREATE(AppConnection.Doppler).method),
    credentials: DopplerConnectionApiTokenCredentialsSchema.describe(
      AppConnections.CREATE(AppConnection.Doppler).credentials
    )
  })
]);

export const CreateDopplerConnectionSchema = ValidateDopplerConnectionCredentialsSchema.and(
  GenericCreateAppConnectionFieldsSchema(AppConnection.Doppler)
);

export const UpdateDopplerConnectionSchema = z
  .object({
    credentials: DopplerConnectionApiTokenCredentialsSchema.optional().describe(
      AppConnections.UPDATE(AppConnection.Doppler).credentials
    )
  })
  .and(GenericUpdateAppConnectionFieldsSchema(AppConnection.Doppler));

export const DopplerConnectionListItemSchema = z
  .object({
    name: z.literal("Doppler"),
    app: z.literal(AppConnection.Doppler),
    methods: z.nativeEnum(DopplerConnectionMethod).array()
  })
  .describe(JSON.stringify({ title: APP_CONNECTION_NAME_MAP[AppConnection.Doppler] }));
