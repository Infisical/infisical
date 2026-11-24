import RE2 from "re2";
import z from "zod";

import { AppConnections } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  BaseAppConnectionSchema,
  GenericCreateAppConnectionFieldsSchema,
  GenericUpdateAppConnectionFieldsSchema
} from "@app/services/app-connection/app-connection-schemas";

import { APP_CONNECTION_NAME_MAP } from "../app-connection-maps";
import { AzureBlobStorageConnectionMethod } from "./azure-blob-storage-connection-enums";

const STORAGE_ACCOUNT_NAME = new RE2(/^[a-z0-9]{3,24}$/);

const AccountNameSchema = z
  .string()
  .trim()
  .refine((name) => STORAGE_ACCOUNT_NAME.test(name), "Storage account name must be 3-24 lowercase letters and numbers")
  .describe(AppConnections.CREDENTIALS.AZURE_BLOB_STORAGE.accountName);

export const AzureBlobStorageConnectionClientSecretCredentialsSchema = z.object({
  accountName: AccountNameSchema,
  tenantId: z
    .string()
    .trim()
    .uuid("Tenant ID must be a UUID")
    .describe(AppConnections.CREDENTIALS.AZURE_BLOB_STORAGE.tenantId),
  clientId: z
    .string()
    .trim()
    .uuid("Client ID must be a UUID")
    .describe(AppConnections.CREDENTIALS.AZURE_BLOB_STORAGE.clientId),
  clientSecret: z
    .string()
    .trim()
    .min(1, "Client Secret required")
    .max(256, "Client Secret cannot exceed 256 characters")
    .describe(AppConnections.CREDENTIALS.AZURE_BLOB_STORAGE.clientSecret)
});

export const AzureBlobStorageConnectionAccessKeyCredentialsSchema = z.object({
  accountName: AccountNameSchema,
  accountKey: z
    .string()
    .trim()
    .min(1, "Account Key required")
    .max(256, "Account Key cannot exceed 256 characters")
    .describe(AppConnections.CREDENTIALS.AZURE_BLOB_STORAGE.accountKey)
});

const BaseAzureBlobStorageConnectionSchema = BaseAppConnectionSchema.extend({
  app: z.literal(AppConnection.AzureBlobStorage)
});

export const AzureBlobStorageConnectionSchema = z.discriminatedUnion("method", [
  BaseAzureBlobStorageConnectionSchema.extend({
    method: z.literal(AzureBlobStorageConnectionMethod.ClientSecret),
    credentials: AzureBlobStorageConnectionClientSecretCredentialsSchema
  }),
  BaseAzureBlobStorageConnectionSchema.extend({
    method: z.literal(AzureBlobStorageConnectionMethod.AccessKey),
    credentials: AzureBlobStorageConnectionAccessKeyCredentialsSchema
  })
]);

export const SanitizedAzureBlobStorageConnectionSchema = z.discriminatedUnion("method", [
  BaseAzureBlobStorageConnectionSchema.extend({
    method: z.literal(AzureBlobStorageConnectionMethod.ClientSecret),
    credentials: AzureBlobStorageConnectionClientSecretCredentialsSchema.pick({
      accountName: true,
      tenantId: true,
      clientId: true
    })
  }).describe(JSON.stringify({ title: `${APP_CONNECTION_NAME_MAP[AppConnection.AzureBlobStorage]} (Client Secret)` })),
  BaseAzureBlobStorageConnectionSchema.extend({
    method: z.literal(AzureBlobStorageConnectionMethod.AccessKey),
    credentials: AzureBlobStorageConnectionAccessKeyCredentialsSchema.pick({ accountName: true })
  }).describe(JSON.stringify({ title: `${APP_CONNECTION_NAME_MAP[AppConnection.AzureBlobStorage]} (Access Key)` }))
]);

export const ValidateAzureBlobStorageConnectionCredentialsSchema = z.discriminatedUnion("method", [
  z.object({
    method: z
      .literal(AzureBlobStorageConnectionMethod.ClientSecret)
      .describe(AppConnections.CREATE(AppConnection.AzureBlobStorage).method),
    credentials: AzureBlobStorageConnectionClientSecretCredentialsSchema.describe(
      AppConnections.CREATE(AppConnection.AzureBlobStorage).credentials
    )
  }),
  z.object({
    method: z
      .literal(AzureBlobStorageConnectionMethod.AccessKey)
      .describe(AppConnections.CREATE(AppConnection.AzureBlobStorage).method),
    credentials: AzureBlobStorageConnectionAccessKeyCredentialsSchema.describe(
      AppConnections.CREATE(AppConnection.AzureBlobStorage).credentials
    )
  })
]);

export const CreateAzureBlobStorageConnectionSchema = ValidateAzureBlobStorageConnectionCredentialsSchema.and(
  GenericCreateAppConnectionFieldsSchema(AppConnection.AzureBlobStorage)
);

export const UpdateAzureBlobStorageConnectionSchema = z
  .object({
    credentials: z
      .union([
        AzureBlobStorageConnectionClientSecretCredentialsSchema,
        AzureBlobStorageConnectionAccessKeyCredentialsSchema
      ])
      .optional()
      .describe(AppConnections.UPDATE(AppConnection.AzureBlobStorage).credentials)
  })
  .and(GenericUpdateAppConnectionFieldsSchema(AppConnection.AzureBlobStorage));

export const AzureBlobStorageConnectionListItemSchema = z
  .object({
    name: z.literal("Azure Blob Storage"),
    app: z.literal(AppConnection.AzureBlobStorage),
    methods: z.nativeEnum(AzureBlobStorageConnectionMethod).array()
  })
  .describe(JSON.stringify({ title: APP_CONNECTION_NAME_MAP[AppConnection.AzureBlobStorage] }));
