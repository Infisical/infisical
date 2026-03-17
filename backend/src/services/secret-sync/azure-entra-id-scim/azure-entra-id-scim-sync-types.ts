import { z } from "zod";

import { TAzureEntraIdConnection } from "@app/services/app-connection/azure-entra-id";

import {
  AzureEntraIdScimSyncListItemSchema,
  AzureEntraIdScimSyncSchema,
  CreateAzureEntraIdScimSyncSchema
} from "./azure-entra-id-scim-sync-schemas";

export type TAzureEntraIdScimSync = z.infer<typeof AzureEntraIdScimSyncSchema>;

export type TAzureEntraIdScimSyncInput = z.infer<typeof CreateAzureEntraIdScimSyncSchema>;

export type TAzureEntraIdScimSyncListItem = z.infer<typeof AzureEntraIdScimSyncListItemSchema>;

export type TAzureEntraIdScimSyncWithCredentials = TAzureEntraIdScimSync & {
  connection: TAzureEntraIdConnection;
};
