import z from "zod";

import { AppConnections } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  BaseAppConnectionSchema,
  GenericCreateAppConnectionFieldsSchema,
  GenericUpdateAppConnectionFieldsSchema
} from "@app/services/app-connection/app-connection-schemas";

import { APP_CONNECTION_NAME_MAP } from "../app-connection-maps";
import { PaloAltoNetworksConnectionMethod } from "./palo-alto-networks-connection-enums";

export const PaloAltoNetworksConnectionBasicAuthCredentialsSchema = z.object({
  hostname: z
    .string()
    .trim()
    .min(1, "Hostname is required")
    .max(512, "Hostname cannot exceed 512 characters")
    .refine((val) => !val.includes("/") && !val.includes("@") && !val.includes("?"), {
      message: "Hostname must not contain /, @, or ? characters"
    })
    .describe(AppConnections.CREDENTIALS.PALO_ALTO_NETWORKS.hostname),
  port: z.number().int().min(1).max(65535).optional().describe(AppConnections.CREDENTIALS.PALO_ALTO_NETWORKS.port),
  username: z
    .string()
    .trim()
    .min(1, "Username is required")
    .max(256, "Username cannot exceed 256 characters")
    .describe(AppConnections.CREDENTIALS.PALO_ALTO_NETWORKS.username),
  password: z
    .string()
    .min(1, "Password is required")
    .max(512, "Password cannot exceed 512 characters")
    .describe(AppConnections.CREDENTIALS.PALO_ALTO_NETWORKS.password),
  sslRejectUnauthorized: z
    .boolean()
    .optional()
    .describe(AppConnections.CREDENTIALS.PALO_ALTO_NETWORKS.sslRejectUnauthorized),
  sslCertificate: z
    .string()
    .trim()
    .max(16384, "SSL certificate cannot exceed 16384 characters")
    .transform((value) => value || undefined)
    .optional()
    .describe(AppConnections.CREDENTIALS.PALO_ALTO_NETWORKS.sslCertificate)
});

const BasePaloAltoNetworksConnectionSchema = BaseAppConnectionSchema.extend({
  app: z.literal(AppConnection.PaloAltoNetworks)
});

export const PaloAltoNetworksConnectionSchema = BasePaloAltoNetworksConnectionSchema.extend({
  method: z.literal(PaloAltoNetworksConnectionMethod.BasicAuth),
  credentials: PaloAltoNetworksConnectionBasicAuthCredentialsSchema
});

export const SanitizedPaloAltoNetworksConnectionSchema = z.discriminatedUnion("method", [
  BasePaloAltoNetworksConnectionSchema.extend({
    method: z.literal(PaloAltoNetworksConnectionMethod.BasicAuth),
    credentials: PaloAltoNetworksConnectionBasicAuthCredentialsSchema.pick({
      hostname: true,
      port: true,
      username: true,
      sslRejectUnauthorized: true,
      sslCertificate: true
    })
  }).describe(JSON.stringify({ title: `${APP_CONNECTION_NAME_MAP[AppConnection.PaloAltoNetworks]} (Basic Auth)` }))
]);

export const ValidatePaloAltoNetworksConnectionCredentialsSchema = z.discriminatedUnion("method", [
  z.object({
    method: z
      .literal(PaloAltoNetworksConnectionMethod.BasicAuth)
      .describe(AppConnections.CREATE(AppConnection.PaloAltoNetworks).method),
    credentials: PaloAltoNetworksConnectionBasicAuthCredentialsSchema.describe(
      AppConnections.CREATE(AppConnection.PaloAltoNetworks).credentials
    )
  })
]);

export const CreatePaloAltoNetworksConnectionSchema = ValidatePaloAltoNetworksConnectionCredentialsSchema.and(
  GenericCreateAppConnectionFieldsSchema(AppConnection.PaloAltoNetworks, {
    supportsGateways: true
  })
);

export const UpdatePaloAltoNetworksConnectionSchema = z
  .object({
    credentials: PaloAltoNetworksConnectionBasicAuthCredentialsSchema.optional().describe(
      AppConnections.UPDATE(AppConnection.PaloAltoNetworks).credentials
    )
  })
  .and(
    GenericUpdateAppConnectionFieldsSchema(AppConnection.PaloAltoNetworks, {
      supportsGateways: true
    })
  );

export const PaloAltoNetworksConnectionListItemSchema = z
  .object({
    name: z.literal("Palo Alto Networks"),
    app: z.literal(AppConnection.PaloAltoNetworks),
    methods: z.nativeEnum(PaloAltoNetworksConnectionMethod).array()
  })
  .describe(JSON.stringify({ title: APP_CONNECTION_NAME_MAP[AppConnection.PaloAltoNetworks] }));

export const PanOsObjectNameSchema = (field: string) =>
  z
    .string()
    .trim()
    .min(1, `${field} is required`)
    .max(63, `${field} cannot exceed 63 characters`)
    .regex(
      /^[A-Za-z0-9 ._-]+$/,
      `${field} can only contain letters, numbers, spaces, periods, hyphens, and underscores`
    );
