import { z } from "zod";

import { TAzureKeyVaultConnection } from "@app/services/app-connection/azure-key-vault";

import {
  AzureKeyVaultPkiSyncConfigSchema,
  AzureKeyVaultPkiSyncSchema,
  CreateAzureKeyVaultPkiSyncSchema,
  UpdateAzureKeyVaultPkiSyncSchema
} from "./azure-key-vault-pki-sync-schemas";

export type GetAzureKeyVaultCertificate = {
  id: string;
  value: string;
  attributes: {
    enabled: boolean;
    created: number;
    updated: number;
    recoveryLevel: string;
    tags?: Record<string, string>;
  };
  x5t?: string;
  contentType?: string;
  key?: string;
  cer?: string;
};

export type TAzureKeyVaultPkiSyncConfig = z.infer<typeof AzureKeyVaultPkiSyncConfigSchema>;

export type TAzureKeyVaultPkiSync = z.infer<typeof AzureKeyVaultPkiSyncSchema>;

export type TAzureKeyVaultPkiSyncInput = z.infer<typeof CreateAzureKeyVaultPkiSyncSchema>;

export type TAzureKeyVaultPkiSyncUpdate = z.infer<typeof UpdateAzureKeyVaultPkiSyncSchema>;

export type TAzureKeyVaultPkiSyncWithCredentials = TAzureKeyVaultPkiSync & {
  connection: TAzureKeyVaultConnection;
};
