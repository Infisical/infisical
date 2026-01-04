import z from "zod";

import { TTriggerDevConnection } from "@app/services/app-connection/trigger-dev/trigger-dev-connection-types";

import {
  CreateTriggerDevSyncSchema,
  TriggerDevSyncListItemSchema,
  TriggerDevSyncSchema
} from "./trigger-dev-sync-schemas";

export type TTriggerDevSyncListItem = z.infer<typeof TriggerDevSyncListItemSchema>;

export type TTriggerDevSync = z.infer<typeof TriggerDevSyncSchema>;

export type TTriggerDevSyncInput = z.infer<typeof CreateTriggerDevSyncSchema>;

export type TTriggerDevSyncWithCredentials = TTriggerDevSync & {
  connection: TTriggerDevConnection;
};

export type TTriggerDevListEnvVarsResponse = {
  environment: string;
  variables: Record<string, string>;
};

export type TTriggerDevImportEnvVarsRequest = {
  variables: Record<string, string>;
  override?: boolean;
};
