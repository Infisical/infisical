import { SimpleAuthenticationDetailsProvider } from "oci-sdk";
import { z } from "zod";

import { TOCIConnection } from "@app/ee/services/app-connections/oci";

import { CreateOCIVaultSyncSchema, OCIVaultSyncListItemSchema, OCIVaultSyncSchema } from "./oci-vault-sync-schemas";

export type TOCIVaultSync = z.infer<typeof OCIVaultSyncSchema>;

export type TOCIVaultSyncInput = z.infer<typeof CreateOCIVaultSyncSchema>;

export type TOCIVaultSyncListItem = z.infer<typeof OCIVaultSyncListItemSchema>;

export type TOCIVaultSyncWithCredentials = TOCIVaultSync & {
  connection: TOCIConnection;
};

export type TOCIVaultVariable = {
  id: string;
  name: string;
  value: string;
};

export type TOCIVaultListVariables = {
  provider: SimpleAuthenticationDetailsProvider;
  compartmentId: string;
  vaultId: string;
  onlyActive?: boolean; // Whether to filter for only active secrets. Removes deleted / scheduled for deletion secrets
};

export type TCreateOCIVaultVariable = TOCIVaultListVariables & {
  keyId: string;
  name: string;
  value: string;
};

export type TUpdateOCIVaultVariable = TOCIVaultListVariables & {
  secretId: string;
  value: string;
};

export type TDeleteOCIVaultVariable = TOCIVaultListVariables & {
  secretId: string;
};

export type TUnmarkOCIVaultVariableFromDeletion = TOCIVaultListVariables & {
  secretId: string;
};
