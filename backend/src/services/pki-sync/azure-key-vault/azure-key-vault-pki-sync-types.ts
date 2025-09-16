import { z } from "zod";

import { TPkiSyncWithCredentials } from "../pki-sync-types";

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

export const AzureKeyVaultPkiSyncConfigSchema = z.object({
  vaultBaseUrl: z.string().url()
});

export type TAzureKeyVaultPkiSyncConfig = z.infer<typeof AzureKeyVaultPkiSyncConfigSchema>;

export type TAzureKeyVaultPkiSyncWithCredentials = TPkiSyncWithCredentials & {
  destinationConfig: TAzureKeyVaultPkiSyncConfig;
};
