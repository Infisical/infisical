import z from "zod";

import { AppConnections } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  BaseAppConnectionSchema,
  GenericCreateAppConnectionFieldsSchema,
  GenericUpdateAppConnectionFieldsSchema
} from "@app/services/app-connection/app-connection-schemas";

import { APP_CONNECTION_NAME_MAP } from "../app-connection-maps";
import { RenderConnectionMethod } from "./render-connection-enums";

export const RenderConnectionApiKeyCredentialsSchema = z.object({
  apiKey: z.string().trim().min(1, "API key required").max(256, "API key cannot exceed 256 characters")
});

const BaseRenderConnectionSchema = BaseAppConnectionSchema.extend({ app: z.literal(AppConnection.Render) });

export const RenderConnectionSchema = BaseRenderConnectionSchema.extend({
  method: z.literal(RenderConnectionMethod.ApiKey),
  credentials: RenderConnectionApiKeyCredentialsSchema
});

export const SanitizedRenderConnectionSchema = z.discriminatedUnion("method", [
  BaseRenderConnectionSchema.extend({
    method: z.literal(RenderConnectionMethod.ApiKey),
    credentials: RenderConnectionApiKeyCredentialsSchema.pick({})
  }).describe(JSON.stringify({ title: `${APP_CONNECTION_NAME_MAP[AppConnection.Render]} (API Key)` }))
]);

export const ValidateRenderConnectionCredentialsSchema = z.discriminatedUnion("method", [
  z.object({
    method: z.literal(RenderConnectionMethod.ApiKey).describe(AppConnections.CREATE(AppConnection.Render).method),
    credentials: RenderConnectionApiKeyCredentialsSchema.describe(
      AppConnections.CREATE(AppConnection.Render).credentials
    )
  })
]);

export const CreateRenderConnectionSchema = ValidateRenderConnectionCredentialsSchema.and(
  GenericCreateAppConnectionFieldsSchema(AppConnection.Render)
);

export const UpdateRenderConnectionSchema = z
  .object({
    credentials: RenderConnectionApiKeyCredentialsSchema.optional().describe(
      AppConnections.UPDATE(AppConnection.Render).credentials
    )
  })
  .and(GenericUpdateAppConnectionFieldsSchema(AppConnection.Render));

export const RenderConnectionListItemSchema = z
  .object({
    name: z.literal("Render"),
    app: z.literal(AppConnection.Render),
    methods: z.nativeEnum(RenderConnectionMethod).array()
  })
  .describe(JSON.stringify({ title: APP_CONNECTION_NAME_MAP[AppConnection.Render] }));
