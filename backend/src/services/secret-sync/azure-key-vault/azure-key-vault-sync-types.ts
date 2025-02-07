import { z } from "zod";

import { TAzureKeyVaultConnection } from "@app/services/app-connection/azure-key-vault";

import {
  AzureKeyVaultSyncListItemSchema,
  AzureKeyVaultSyncSchema,
  CreateAzureKeyVaultSyncSchema
} from "./azure-key-vault-sync-schemas";

export type TAzureKeyVaultSync = z.infer<typeof AzureKeyVaultSyncSchema>;

export type TAzureKeyVaultSyncInput = z.infer<typeof CreateAzureKeyVaultSyncSchema>;

export type TAzureKeyVaultSyncListItem = z.infer<typeof AzureKeyVaultSyncListItemSchema>;

export type TAzureKeyVaultSyncWithCredentials = TAzureKeyVaultSync & {
  connection: TAzureKeyVaultConnection;
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
