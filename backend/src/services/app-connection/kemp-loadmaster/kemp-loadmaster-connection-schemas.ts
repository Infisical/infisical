import z from "zod";

import { AppConnections } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  BaseAppConnectionSchema,
  GenericCreateAppConnectionFieldsSchema,
  GenericUpdateAppConnectionFieldsSchema
} from "@app/services/app-connection/app-connection-schemas";

import { APP_CONNECTION_NAME_MAP } from "../app-connection-maps";
import { KempLoadMasterConnectionMethod } from "./kemp-loadmaster-connection-enums";

export const KempLoadMasterConnectionBasicAuthCredentialsSchema = z.object({
  hostname: z
    .string()
    .trim()
    .min(1, "Hostname is required")
    .max(512, "Hostname cannot exceed 512 characters")
    .refine((val) => !val.includes("/") && !val.includes("@") && !val.includes("?"), {
      message: "Hostname must not contain /, @, or ? characters"
    }),
  port: z.number().int().min(1).max(65535).optional(),
  username: z.string().trim().min(1, "Username is required").max(256, "Username cannot exceed 256 characters"),
  password: z.string().trim().min(1, "Password is required").max(512, "Password cannot exceed 512 characters"),
  sslRejectUnauthorized: z.boolean().optional(),
  sslCertificate: z
    .string()
    .trim()
    .transform((value) => value || undefined)
    .optional()
});

const BaseKempLoadMasterConnectionSchema = BaseAppConnectionSchema.extend({
  app: z.literal(AppConnection.KempLoadMaster)
});

export const KempLoadMasterConnectionSchema = BaseKempLoadMasterConnectionSchema.extend({
  method: z.literal(KempLoadMasterConnectionMethod.BasicAuth),
  credentials: KempLoadMasterConnectionBasicAuthCredentialsSchema
});

export const SanitizedKempLoadMasterConnectionSchema = z.discriminatedUnion("method", [
  BaseKempLoadMasterConnectionSchema.extend({
    method: z.literal(KempLoadMasterConnectionMethod.BasicAuth),
    credentials: KempLoadMasterConnectionBasicAuthCredentialsSchema.pick({
      hostname: true,
      port: true,
      username: true,
      sslRejectUnauthorized: true,
      sslCertificate: true
    })
  }).describe(JSON.stringify({ title: `${APP_CONNECTION_NAME_MAP[AppConnection.KempLoadMaster]} (Basic Auth)` }))
]);

export const ValidateKempLoadMasterConnectionCredentialsSchema = z.discriminatedUnion("method", [
  z.object({
    method: z
      .literal(KempLoadMasterConnectionMethod.BasicAuth)
      .describe(AppConnections.CREATE(AppConnection.KempLoadMaster).method),
    credentials: KempLoadMasterConnectionBasicAuthCredentialsSchema.describe(
      AppConnections.CREATE(AppConnection.KempLoadMaster).credentials
    )
  })
]);

export const CreateKempLoadMasterConnectionSchema = ValidateKempLoadMasterConnectionCredentialsSchema.and(
  GenericCreateAppConnectionFieldsSchema(AppConnection.KempLoadMaster, {
    supportsGateways: true
  })
);

export const UpdateKempLoadMasterConnectionSchema = z
  .object({
    credentials: KempLoadMasterConnectionBasicAuthCredentialsSchema.optional().describe(
      AppConnections.UPDATE(AppConnection.KempLoadMaster).credentials
    )
  })
  .and(
    GenericUpdateAppConnectionFieldsSchema(AppConnection.KempLoadMaster, {
      supportsGateways: true
    })
  );

export const KempLoadMasterConnectionListItemSchema = z
  .object({
    name: z.literal("Kemp LoadMaster"),
    app: z.literal(AppConnection.KempLoadMaster),
    methods: z.nativeEnum(KempLoadMasterConnectionMethod).array()
  })
  .describe(JSON.stringify({ title: APP_CONNECTION_NAME_MAP[AppConnection.KempLoadMaster] }));
