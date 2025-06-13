import { z } from "zod";

import { TAzureDevOpsConnection } from "@app/services/app-connection/azure-devops/azure-devops-types";

import {
  AzureDevOpsSyncDestinationConfigSchema,
  AzureDevOpsSyncListItemSchema,
  AzureDevOpsSyncSchema,
  CreateAzureDevOpsSyncSchema
} from "./azure-devops-sync-schemas";

export type TAzureDevOpsSync = z.infer<typeof AzureDevOpsSyncSchema>;

export type TAzureDevOpsSyncInput = z.infer<typeof CreateAzureDevOpsSyncSchema>;

export type TAzureDevOpsSyncListItem = z.infer<typeof AzureDevOpsSyncListItemSchema>;

export type TAzureDevOpsSyncDestinationConfig = z.infer<typeof AzureDevOpsSyncDestinationConfigSchema>;

export type TAzureDevOpsSyncWithCredentials = TAzureDevOpsSync & {
  connection: TAzureDevOpsConnection;
};
