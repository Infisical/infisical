import z from "zod";

import { AppConnections } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  BaseAppConnectionSchema,
  GenericCreateAppConnectionFieldsSchema,
  GenericUpdateAppConnectionFieldsSchema
} from "@app/services/app-connection/app-connection-schemas";

import { APP_CONNECTION_NAME_MAP } from "../app-connection-maps";
import { NutanixPrismCentralConnectionMethod } from "./nutanix-prism-central-connection-enums";

const BaseHostSchema = z.object({
  hostname: z
    .string()
    .trim()
    .min(1, "Hostname is required")
    .max(512, "Hostname cannot exceed 512 characters")
    .refine(
      (val) =>
        !val.includes("/") && !val.includes("@") && !val.includes("?") && !val.includes(":") && !val.includes("#"),
      {
        message: "Hostname must not contain /, @, ?, :, or # characters"
      }
    ),
  port: z.number().int().min(1).max(65535).optional(),
  sslRejectUnauthorized: z.boolean().optional(),
  sslCertificate: z
    .string()
    .trim()
    .transform((value) => value || undefined)
    .optional()
});

export const NutanixPrismCentralApiKeyCredentialsSchema = BaseHostSchema.extend({
  apiKey: z
    .string()
    .trim()
    .regex(/^[0-9a-f]{32}$/, "API key must be a 32-character lowercase hexadecimal string")
});

export const NutanixPrismCentralBasicAuthCredentialsSchema = BaseHostSchema.extend({
  username: z.string().trim().min(1, "Username is required").max(256, "Username cannot exceed 256 characters"),
  password: z.string().trim().min(1, "Password is required").max(512, "Password cannot exceed 512 characters")
});

const BaseNutanixPrismCentralConnectionSchema = BaseAppConnectionSchema.extend({
  app: z.literal(AppConnection.NutanixPrismCentral)
});

export const NutanixPrismCentralConnectionSchema = z.discriminatedUnion("method", [
  BaseNutanixPrismCentralConnectionSchema.extend({
    method: z.literal(NutanixPrismCentralConnectionMethod.ApiKey),
    credentials: NutanixPrismCentralApiKeyCredentialsSchema
  }),
  BaseNutanixPrismCentralConnectionSchema.extend({
    method: z.literal(NutanixPrismCentralConnectionMethod.BasicAuth),
    credentials: NutanixPrismCentralBasicAuthCredentialsSchema
  })
]);

export const SanitizedNutanixPrismCentralConnectionSchema = z.discriminatedUnion("method", [
  BaseNutanixPrismCentralConnectionSchema.extend({
    method: z.literal(NutanixPrismCentralConnectionMethod.ApiKey),
    credentials: NutanixPrismCentralApiKeyCredentialsSchema.pick({
      hostname: true,
      port: true,
      sslRejectUnauthorized: true,
      sslCertificate: true
    })
  }).describe(JSON.stringify({ title: `${APP_CONNECTION_NAME_MAP[AppConnection.NutanixPrismCentral]} (API Key)` })),
  BaseNutanixPrismCentralConnectionSchema.extend({
    method: z.literal(NutanixPrismCentralConnectionMethod.BasicAuth),
    credentials: NutanixPrismCentralBasicAuthCredentialsSchema.pick({
      hostname: true,
      port: true,
      username: true,
      sslRejectUnauthorized: true,
      sslCertificate: true
    })
  }).describe(JSON.stringify({ title: `${APP_CONNECTION_NAME_MAP[AppConnection.NutanixPrismCentral]} (Basic Auth)` }))
]);

export const ValidateNutanixPrismCentralConnectionCredentialsSchema = z.discriminatedUnion("method", [
  z.object({
    method: z
      .literal(NutanixPrismCentralConnectionMethod.ApiKey)
      .describe(AppConnections.CREATE(AppConnection.NutanixPrismCentral).method),
    credentials: NutanixPrismCentralApiKeyCredentialsSchema.describe(
      AppConnections.CREATE(AppConnection.NutanixPrismCentral).credentials
    )
  }),
  z.object({
    method: z
      .literal(NutanixPrismCentralConnectionMethod.BasicAuth)
      .describe(AppConnections.CREATE(AppConnection.NutanixPrismCentral).method),
    credentials: NutanixPrismCentralBasicAuthCredentialsSchema.describe(
      AppConnections.CREATE(AppConnection.NutanixPrismCentral).credentials
    )
  })
]);

export const CreateNutanixPrismCentralConnectionSchema = ValidateNutanixPrismCentralConnectionCredentialsSchema.and(
  GenericCreateAppConnectionFieldsSchema(AppConnection.NutanixPrismCentral, {
    supportsGateways: true
  })
);

export const UpdateNutanixPrismCentralConnectionSchema = z
  .object({
    credentials: z
      .union([NutanixPrismCentralApiKeyCredentialsSchema, NutanixPrismCentralBasicAuthCredentialsSchema])
      .optional()
      .describe(AppConnections.UPDATE(AppConnection.NutanixPrismCentral).credentials)
  })
  .and(
    GenericUpdateAppConnectionFieldsSchema(AppConnection.NutanixPrismCentral, {
      supportsGateways: true
    })
  );

export const NutanixPrismCentralConnectionListItemSchema = z
  .object({
    name: z.literal("Nutanix Prism Central"),
    app: z.literal(AppConnection.NutanixPrismCentral),
    methods: z.nativeEnum(NutanixPrismCentralConnectionMethod).array()
  })
  .describe(JSON.stringify({ title: APP_CONNECTION_NAME_MAP[AppConnection.NutanixPrismCentral] }));
