import { z } from "zod";

import { TOvhConnection } from "@app/services/app-connection/ovh";

import {
  CreateOvhSyncSchema,
  OvhSyncDestinationConfigSchema,
  OvhSyncListItemSchema,
  OvhSyncSchema
} from "./ovh-sync-schemas";

export type TOvhSyncDestinationConfig = z.infer<typeof OvhSyncDestinationConfigSchema>;

export type TOvhSync = Omit<z.infer<typeof OvhSyncSchema>, "destinationConfig"> & {
  destinationConfig: TOvhSyncDestinationConfig;
};

export type TOvhSyncInput = z.infer<typeof CreateOvhSyncSchema>;

export type TOvhSyncListItem = z.infer<typeof OvhSyncListItemSchema>;

export type TOvhSyncWithCredentials = TOvhSync & {
  connection: TOvhConnection;
};
