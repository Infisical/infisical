import { z } from "zod";

import { THCVaultConnection } from "@app/services/app-connection/hc-vault";
import { KvVersion } from "@app/services/external-migration/external-migration-types";

import { CreateHCVaultSyncSchema, HCVaultSyncListItemSchema, HCVaultSyncSchema } from "./hc-vault-sync-schemas";

export type THCVaultSync = z.infer<typeof HCVaultSyncSchema>;

export type THCVaultSyncInput = z.infer<typeof CreateHCVaultSyncSchema>;

export type THCVaultSyncListItem = z.infer<typeof HCVaultSyncListItemSchema>;

export type THCVaultSyncWithCredentials = THCVaultSync & {
  connection: THCVaultConnection;
};

export type THCVaultListVariablesResponse = {
  data: {
    data: {
      [key: string]: string;
    };
  };
};

export type THCVaultListVariables = {
  accessToken: string;
  instanceUrl: string;
  namespace?: string;
  mount: string;
  mountVersion: KvVersion;
  path: string;
};

export type TPostHCVaultVariable = THCVaultListVariables & {
  data: {
    [key: string]: string;
  };
};

export type TDeleteHCVaultVariable = THCVaultListVariables;
