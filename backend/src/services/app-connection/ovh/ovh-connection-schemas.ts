import z from "zod";

import { AppConnections } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  BaseAppConnectionSchema,
  GenericCreateAppConnectionFieldsSchema,
  GenericUpdateAppConnectionFieldsSchema
} from "@app/services/app-connection/app-connection-schemas";

import { APP_CONNECTION_NAME_MAP } from "../app-connection-maps";
import { OVHConnectionMethod } from "./ovh-connection-enums";

export const OvhConnectionCertificateCredentialsSchema = z.object({
  privateKey: z.string().trim().min(1, "Private key required").describe(AppConnections.CREDENTIALS.OVH.privateKey),
  certificate: z.string().trim().min(1, "Certificate required").describe(AppConnections.CREDENTIALS.OVH.certificate),
  okmsDomain: z
    .string()
    .trim()
    .min(1, "OKMS domain required")
    .url("OKMS domain must be a valid URL (e.g. https://example.com)")
    .describe(AppConnections.CREDENTIALS.OVH.okmsDomain),
  okmsId: z.string().trim().min(1, "OKMS ID required").describe(AppConnections.CREDENTIALS.OVH.okmsId)
});

const BaseOvhConnectionSchema = BaseAppConnectionSchema.extend({ app: z.literal(AppConnection.OVH) });

export const OvhConnectionSchema = BaseOvhConnectionSchema.extend({
  method: z.literal(OVHConnectionMethod.Certificate),
  credentials: OvhConnectionCertificateCredentialsSchema
});

export const SanitizedOvhConnectionSchema = z.discriminatedUnion("method", [
  BaseOvhConnectionSchema.extend({
    method: z.literal(OVHConnectionMethod.Certificate),
    credentials: OvhConnectionCertificateCredentialsSchema.pick({
      okmsDomain: true,
      okmsId: true
    })
  }).describe(JSON.stringify({ title: `${APP_CONNECTION_NAME_MAP[AppConnection.OVH]} (Certificate)` }))
]);

export const ValidateOvhConnectionCredentialsSchema = z.discriminatedUnion("method", [
  z.object({
    method: z.literal(OVHConnectionMethod.Certificate).describe(AppConnections.CREATE(AppConnection.OVH).method),
    credentials: OvhConnectionCertificateCredentialsSchema.describe(
      AppConnections.CREATE(AppConnection.OVH).credentials
    )
  })
]);

export const CreateOvhConnectionSchema = ValidateOvhConnectionCredentialsSchema.and(
  GenericCreateAppConnectionFieldsSchema(AppConnection.OVH)
);

export const UpdateOvhConnectionSchema = z
  .object({
    credentials: OvhConnectionCertificateCredentialsSchema.optional().describe(
      AppConnections.UPDATE(AppConnection.OVH).credentials
    )
  })
  .and(GenericUpdateAppConnectionFieldsSchema(AppConnection.OVH));

export const OvhConnectionListItemSchema = z
  .object({
    name: z.literal("OVH"),
    app: z.literal(AppConnection.OVH),
    methods: z.nativeEnum(OVHConnectionMethod).array()
  })
  .describe(JSON.stringify({ title: APP_CONNECTION_NAME_MAP[AppConnection.OVH] }));
