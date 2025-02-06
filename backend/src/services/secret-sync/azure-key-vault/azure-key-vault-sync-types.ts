import { z } from "zod";

import { TAzureConnection } from "@app/services/app-connection/azure";

import {
  AzureKeyVaultSyncListItemSchema,
  AzureKeyVaultSyncSchema,
  CreateAzureKeyVaultSyncSchema
} from "./azure-key-vault-sync-schemas";

export type TAzureKeyVaultSync = z.infer<typeof AzureKeyVaultSyncSchema>;

export type TAzureKeyVaultSyncInput = z.infer<typeof CreateAzureKeyVaultSyncSchema>;

export type TAzureKeyVaultSyncListItem = z.infer<typeof AzureKeyVaultSyncListItemSchema>;

export type TAzureKeyVaultSyncWithCredentials = TAzureKeyVaultSync & {
  connection: TAzureConnection;
};

export interface GetAzureKeyVaultSecret {
  id: string; // secret URI
  value: string;
  attributes: {
    enabled: boolean;
    created: number;
    updated: number;
    recoveryLevel: string;
    recoverableDays: number;
  };
}

export interface AzureKeyVaultSecret extends GetAzureKeyVaultSecret {
  key: string;
}
