import z from "zod";

import { AppConnections } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  BaseAppConnectionSchema,
  GenericCreateAppConnectionFieldsSchema,
  GenericUpdateAppConnectionFieldsSchema
} from "@app/services/app-connection/app-connection-schemas";

import { APP_CONNECTION_NAME_MAP } from "../app-connection-maps";
import { DaytonaConnectionMethod } from "./daytona-connection-enums";

export const DaytonaConnectionApiKeyCredentialsSchema = z.object({
  apiKey: z.string().trim().min(1, "API Key required").max(500).describe(AppConnections.CREDENTIALS.DAYTONA.apiKey)
});

// A Daytona API key is bound to one organization, so the organization is resolved during validation
// rather than supplied by the caller. It is stored on the connection and read back to tell whether
// two syncs write to the same organization.
export const DaytonaConnectionApiKeyStoredCredentialsSchema = DaytonaConnectionApiKeyCredentialsSchema.extend({
  organizationId: z.string().trim().min(1).max(255).describe(AppConnections.CREDENTIALS.DAYTONA.organizationId)
});

const BaseDaytonaConnectionSchema = BaseAppConnectionSchema.extend({
  app: z.literal(AppConnection.Daytona)
});

export const DaytonaConnectionSchema = BaseDaytonaConnectionSchema.extend({
  method: z.literal(DaytonaConnectionMethod.ApiKey),
  credentials: DaytonaConnectionApiKeyStoredCredentialsSchema
});

export const SanitizedDaytonaConnectionSchema = z.discriminatedUnion("method", [
  BaseDaytonaConnectionSchema.extend({
    method: z.literal(DaytonaConnectionMethod.ApiKey),
    credentials: DaytonaConnectionApiKeyStoredCredentialsSchema.pick({ organizationId: true })
  }).describe(JSON.stringify({ title: `${APP_CONNECTION_NAME_MAP[AppConnection.Daytona]} (API Key)` }))
]);

export const ValidateDaytonaConnectionCredentialsSchema = z.discriminatedUnion("method", [
  z.object({
    method: z.literal(DaytonaConnectionMethod.ApiKey).describe(AppConnections.CREATE(AppConnection.Daytona).method),
    credentials: DaytonaConnectionApiKeyCredentialsSchema.describe(
      AppConnections.CREATE(AppConnection.Daytona).credentials
    )
  })
]);

export const CreateDaytonaConnectionSchema = ValidateDaytonaConnectionCredentialsSchema.and(
  GenericCreateAppConnectionFieldsSchema(AppConnection.Daytona)
);

export const UpdateDaytonaConnectionSchema = z
  .object({
    credentials: DaytonaConnectionApiKeyCredentialsSchema.optional().describe(
      AppConnections.UPDATE(AppConnection.Daytona).credentials
    )
  })
  .and(GenericUpdateAppConnectionFieldsSchema(AppConnection.Daytona));

export const DaytonaConnectionListItemSchema = z
  .object({
    name: z.literal("Daytona"),
    app: z.literal(AppConnection.Daytona),
    methods: z.nativeEnum(DaytonaConnectionMethod).array()
  })
  .describe(JSON.stringify({ title: APP_CONNECTION_NAME_MAP[AppConnection.Daytona] }));
