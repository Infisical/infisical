import { z } from "zod";

import { TAzureConnection } from "@app/services/app-connection/azure";

import {
  AzureAppConfigurationSyncListItemSchema,
  AzureAppConfigurationSyncSchema,
  CreateAzureAppConfigurationSyncSchema
} from "./azure-app-configuration-sync-schemas";

export type TAzureAppConfigurationSync = z.infer<typeof AzureAppConfigurationSyncSchema>;

export type TAzureAppConfigurationSyncInput = z.infer<typeof CreateAzureAppConfigurationSyncSchema>;

export type TAzureAppConfigurationSyncListItem = z.infer<typeof AzureAppConfigurationSyncListItemSchema>;

export type TAzureAppConfigurationSyncWithCredentials = TAzureAppConfigurationSync & {
  connection: TAzureConnection;
};
