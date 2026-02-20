import z from "zod";

import { AppConnections } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  BaseAppConnectionSchema,
  GenericCreateAppConnectionFieldsSchema,
  GenericUpdateAppConnectionFieldsSchema
} from "@app/services/app-connection/app-connection-schemas";

import { APP_CONNECTION_NAME_MAP } from "../app-connection-maps";
import { AlibabaCloudConnectionMethod, AlibabaCloudRegion } from "./alibaba-cloud-connection-enums";

export const AlibabaCloudConnectionAccessKeyCredentialsSchema = z.object({
  accessKeyId: z
    .string()
    .trim()
    .min(1, "Access key ID required")
    .max(256, "Access key ID cannot exceed 256 characters"),
  accessKeySecret: z
    .string()
    .trim()
    .min(1, "Access key secret required")
    .max(256, "Access key secret cannot exceed 256 characters"),
  regionId: z.nativeEnum(AlibabaCloudRegion)
});

const BaseAlibabaCloudConnectionSchema = BaseAppConnectionSchema.extend({
  app: z.literal(AppConnection.AlibabaCloud)
});

export const AlibabaCloudConnectionSchema = BaseAlibabaCloudConnectionSchema.extend({
  method: z.literal(AlibabaCloudConnectionMethod.AccessKey),
  credentials: AlibabaCloudConnectionAccessKeyCredentialsSchema
});

export const SanitizedAlibabaCloudConnectionSchema = z.discriminatedUnion("method", [
  BaseAlibabaCloudConnectionSchema.extend({
    method: z.literal(AlibabaCloudConnectionMethod.AccessKey),
    credentials: AlibabaCloudConnectionAccessKeyCredentialsSchema.pick({ accessKeyId: true, regionId: true })
  }).describe(JSON.stringify({ title: `${APP_CONNECTION_NAME_MAP[AppConnection.AlibabaCloud]} (Access Key)` }))
]);

export const ValidateAlibabaCloudConnectionCredentialsSchema = z.discriminatedUnion("method", [
  z.object({
    method: z
      .literal(AlibabaCloudConnectionMethod.AccessKey)
      .describe(AppConnections.CREATE(AppConnection.AlibabaCloud).method),
    credentials: AlibabaCloudConnectionAccessKeyCredentialsSchema.describe(
      AppConnections.CREATE(AppConnection.AlibabaCloud).credentials
    )
  })
]);

export const CreateAlibabaCloudConnectionSchema = ValidateAlibabaCloudConnectionCredentialsSchema.and(
  GenericCreateAppConnectionFieldsSchema(AppConnection.AlibabaCloud)
);

export const UpdateAlibabaCloudConnectionSchema = z
  .object({
    credentials: AlibabaCloudConnectionAccessKeyCredentialsSchema.optional().describe(
      AppConnections.UPDATE(AppConnection.AlibabaCloud).credentials
    )
  })
  .and(GenericUpdateAppConnectionFieldsSchema(AppConnection.AlibabaCloud));

export const AlibabaCloudConnectionListItemSchema = z
  .object({
    name: z.literal("Alibaba Cloud KMS"),
    app: z.literal(AppConnection.AlibabaCloud),
    methods: z.nativeEnum(AlibabaCloudConnectionMethod).array()
  })
  .describe(JSON.stringify({ title: APP_CONNECTION_NAME_MAP[AppConnection.AlibabaCloud] }));
