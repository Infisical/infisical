import { z } from "zod";

import { AppConnections } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  BaseAppConnectionSchema,
  GenericCreateAppConnectionFieldsSchema,
  GenericUpdateAppConnectionFieldsSchema
} from "@app/services/app-connection/app-connection-schemas";

import { APP_CONNECTION_NAME_MAP } from "../app-connection-maps";
import { MicrosoftIntuneConnectionMethod } from "./microsoft-intune-connection-enums";

export const MicrosoftIntuneConnectionClientSecretInputCredentialsSchema = z.object({
  tenantId: z.string().uuid().trim().min(1, "Tenant ID required"),
  clientId: z.string().uuid().trim().min(1, "Client ID required"),
  clientSecret: z.string().trim().min(1, "Client Secret required")
});

export const MicrosoftIntuneConnectionClientSecretOutputCredentialsSchema = z.object({
  tenantId: z.string(),
  clientId: z.string(),
  clientSecret: z.string()
});

export const ValidateMicrosoftIntuneConnectionCredentialsSchema = z.discriminatedUnion("method", [
  z.object({
    method: z
      .literal(MicrosoftIntuneConnectionMethod.ClientSecret)
      .describe(AppConnections.CREATE(AppConnection.MicrosoftIntune).method),
    credentials: MicrosoftIntuneConnectionClientSecretInputCredentialsSchema.describe(
      AppConnections.CREATE(AppConnection.MicrosoftIntune).credentials
    )
  })
]);

export const CreateMicrosoftIntuneConnectionSchema = ValidateMicrosoftIntuneConnectionCredentialsSchema.and(
  GenericCreateAppConnectionFieldsSchema(AppConnection.MicrosoftIntune)
);

export const UpdateMicrosoftIntuneConnectionSchema = z
  .object({
    credentials: MicrosoftIntuneConnectionClientSecretInputCredentialsSchema.optional().describe(
      AppConnections.UPDATE(AppConnection.MicrosoftIntune).credentials
    )
  })
  .and(GenericUpdateAppConnectionFieldsSchema(AppConnection.MicrosoftIntune));

const BaseMicrosoftIntuneConnectionSchema = BaseAppConnectionSchema.extend({
  app: z.literal(AppConnection.MicrosoftIntune)
});

export const MicrosoftIntuneConnectionSchema = z.intersection(
  BaseMicrosoftIntuneConnectionSchema,
  z.discriminatedUnion("method", [
    z.object({
      method: z.literal(MicrosoftIntuneConnectionMethod.ClientSecret),
      credentials: MicrosoftIntuneConnectionClientSecretOutputCredentialsSchema
    })
  ])
);

export const SanitizedMicrosoftIntuneConnectionSchema = z.discriminatedUnion("method", [
  BaseMicrosoftIntuneConnectionSchema.extend({
    method: z.literal(MicrosoftIntuneConnectionMethod.ClientSecret),
    credentials: MicrosoftIntuneConnectionClientSecretOutputCredentialsSchema.pick({
      tenantId: true,
      clientId: true
    })
  }).describe(JSON.stringify({ title: `${APP_CONNECTION_NAME_MAP[AppConnection.MicrosoftIntune]} (Client Secret)` }))
]);

export const MicrosoftIntuneConnectionListItemSchema = z
  .object({
    name: z.literal("Microsoft Intune"),
    app: z.literal(AppConnection.MicrosoftIntune),
    methods: z.nativeEnum(MicrosoftIntuneConnectionMethod).array()
  })
  .describe(JSON.stringify({ title: APP_CONNECTION_NAME_MAP[AppConnection.MicrosoftIntune] }));
