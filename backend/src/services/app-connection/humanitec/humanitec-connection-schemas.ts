import z from "zod";

import { AppConnections } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  BaseAppConnectionSchema,
  GenericCreateAppConnectionFieldsSchema,
  GenericUpdateAppConnectionFieldsSchema
} from "@app/services/app-connection/app-connection-schemas";

import { HumanitecConnectionMethod } from "./humanitec-connection-enums";

export const HumanitecConnectionAccessTokenCredentialsSchema = z.object({
  apiToken: z.string().trim().min(1, "API Token required")
});

const BaseHumanitecConnectionSchema = BaseAppConnectionSchema.extend({ app: z.literal(AppConnection.Humanitec) });

export const HumanitecConnectionSchema = BaseHumanitecConnectionSchema.extend({
  method: z.literal(HumanitecConnectionMethod.API_TOKEN),
  credentials: HumanitecConnectionAccessTokenCredentialsSchema
});

export const SanitizedHumanitecConnectionSchema = z.discriminatedUnion("method", [
  BaseHumanitecConnectionSchema.extend({
    method: z.literal(HumanitecConnectionMethod.API_TOKEN),
    credentials: HumanitecConnectionAccessTokenCredentialsSchema.pick({})
  })
]);

export const ValidateHumanitecConnectionCredentialsSchema = z.discriminatedUnion("method", [
  z.object({
    method: z
      .literal(HumanitecConnectionMethod.API_TOKEN)
      .describe(AppConnections?.CREATE(AppConnection.Humanitec).method),
    credentials: HumanitecConnectionAccessTokenCredentialsSchema.describe(
      AppConnections.CREATE(AppConnection.Humanitec).credentials
    )
  })
]);

export const CreateHumanitecConnectionSchema = ValidateHumanitecConnectionCredentialsSchema.and(
  GenericCreateAppConnectionFieldsSchema(AppConnection.Humanitec)
);

export const UpdateHumanitecConnectionSchema = z
  .object({
    credentials: HumanitecConnectionAccessTokenCredentialsSchema.optional().describe(
      AppConnections.UPDATE(AppConnection.Humanitec).credentials
    )
  })
  .and(GenericUpdateAppConnectionFieldsSchema(AppConnection.Humanitec));

export const HumanitecConnectionListItemSchema = z.object({
  name: z.literal("Humanitec"),
  app: z.literal(AppConnection.Humanitec),
  methods: z.nativeEnum(HumanitecConnectionMethod).array()
});
