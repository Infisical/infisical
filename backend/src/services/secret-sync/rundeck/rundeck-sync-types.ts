import z from "zod";

import { TRundeckConnection } from "@app/services/app-connection/rundeck";

import { CreateRundeckSyncSchema, RundeckSyncListItemSchema, RundeckSyncSchema } from "./rundeck-sync-schemas";

export type TRundeckSyncListItem = z.infer<typeof RundeckSyncListItemSchema>;

export type TRundeckSync = z.infer<typeof RundeckSyncSchema>;

export type TRundeckSyncInput = z.infer<typeof CreateRundeckSyncSchema>;

export type TRundeckSyncWithCredentials = TRundeckSync & {
  connection: TRundeckConnection;
};
