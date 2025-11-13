import z from "zod";

import { AppConnections } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { APP_CONNECTION_NAME_MAP } from "@app/services/app-connection/app-connection-maps";
import {
  BaseAppConnectionSchema,
  GenericCreateAppConnectionFieldsSchema,
  GenericUpdateAppConnectionFieldsSchema
} from "@app/services/app-connection/app-connection-schemas";

import { OCIConnectionMethod } from "./oci-connection-enums";

export const OCIConnectionAccessTokenCredentialsSchema = z.object({
  userOcid: z.string().trim().min(1, "User OCID required").describe(AppConnections.CREDENTIALS.OCI.userOcid),
  tenancyOcid: z.string().trim().min(1, "Tenancy OCID required").describe(AppConnections.CREDENTIALS.OCI.tenancyOcid),
  region: z.string().trim().min(1, "Region required").describe(AppConnections.CREDENTIALS.OCI.region),
  fingerprint: z.string().trim().min(1, "Fingerprint required").describe(AppConnections.CREDENTIALS.OCI.fingerprint),
  privateKey: z.string().trim().min(1, "Private Key required").describe(AppConnections.CREDENTIALS.OCI.privateKey)
});

const BaseOCIConnectionSchema = BaseAppConnectionSchema.extend({ app: z.literal(AppConnection.OCI) });

export const OCIConnectionSchema = BaseOCIConnectionSchema.extend({
  method: z.literal(OCIConnectionMethod.AccessKey),
  credentials: OCIConnectionAccessTokenCredentialsSchema
});

export const SanitizedOCIConnectionSchema = z.discriminatedUnion("method", [
  BaseOCIConnectionSchema.extend({
    method: z.literal(OCIConnectionMethod.AccessKey),
    credentials: OCIConnectionAccessTokenCredentialsSchema.pick({
      userOcid: true,
      tenancyOcid: true,
      region: true,
      fingerprint: true
    })
  }).describe(JSON.stringify({ title: `${APP_CONNECTION_NAME_MAP[AppConnection.OCI]} (Access Key)` }))
]);

export const ValidateOCIConnectionCredentialsSchema = z.discriminatedUnion("method", [
  z.object({
    method: z.literal(OCIConnectionMethod.AccessKey).describe(AppConnections.CREATE(AppConnection.OCI).method),
    credentials: OCIConnectionAccessTokenCredentialsSchema.describe(
      AppConnections.CREATE(AppConnection.OCI).credentials
    )
  })
]);

export const CreateOCIConnectionSchema = ValidateOCIConnectionCredentialsSchema.and(
  GenericCreateAppConnectionFieldsSchema(AppConnection.OCI)
);

export const UpdateOCIConnectionSchema = z
  .object({
    credentials: OCIConnectionAccessTokenCredentialsSchema.optional().describe(
      AppConnections.UPDATE(AppConnection.OCI).credentials
    )
  })
  .and(GenericUpdateAppConnectionFieldsSchema(AppConnection.OCI));

export const OCIConnectionListItemSchema = z
  .object({
    name: z.literal("OCI"),
    app: z.literal(AppConnection.OCI),
    methods: z.nativeEnum(OCIConnectionMethod).array()
  })
  .describe(JSON.stringify({ title: APP_CONNECTION_NAME_MAP[AppConnection.OCI] }));
