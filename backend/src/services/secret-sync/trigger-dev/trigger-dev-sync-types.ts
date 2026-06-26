import { z } from "zod";

import { TTriggerDevConnection } from "@app/services/app-connection/trigger-dev";

import {
  CreateTriggerDevSyncSchema,
  TriggerDevSyncListItemSchema,
  TriggerDevSyncSchema
} from "./trigger-dev-sync-schemas";

export type TTriggerDevSync = z.infer<typeof TriggerDevSyncSchema>;

export type TTriggerDevSyncInput = z.infer<typeof CreateTriggerDevSyncSchema>;

export type TTriggerDevSyncListItem = z.infer<typeof TriggerDevSyncListItemSchema>;

export type TTriggerDevSyncWithCredentials = TTriggerDevSync & {
  connection: TTriggerDevConnection;
};

export type TTriggerDevEnvVar = {
  name: string;
  value: string;
  isSecret: boolean;
};
