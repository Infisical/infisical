import z from "zod";

import { TCloudflareConnection } from "@app/services/app-connection/cloudflare/cloudflare-connection-types";

import {
  CloudflareSecretsStoreSyncListItemSchema,
  CloudflareSecretsStoreSyncSchema,
  CreateCloudflareSecretsStoreSyncSchema
} from "./cloudflare-secrets-store-sync-schemas";

export type TCloudflareSecretsStoreSyncListItem = z.infer<typeof CloudflareSecretsStoreSyncListItemSchema>;

export type TCloudflareSecretsStoreSync = z.infer<typeof CloudflareSecretsStoreSyncSchema>;

export type TCloudflareSecretsStoreSyncInput = z.infer<typeof CreateCloudflareSecretsStoreSyncSchema>;

export type TCloudflareSecretsStoreSyncWithCredentials = TCloudflareSecretsStoreSync & {
  connection: TCloudflareConnection;
};

export type TCloudflareSecretsStoreSecret = {
  id: string;
  name: string;
};

export type TCloudflareSecretsStoreQuotaResponse = {
  result: { secrets: { quota: number; usage: number } };
};
