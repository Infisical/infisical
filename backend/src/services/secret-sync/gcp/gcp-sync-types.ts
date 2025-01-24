import z from "zod";

import { TGcpConnection } from "@app/services/app-connection/gcp";

import { CreateGcpSyncSchema, GcpSyncListItemSchema, GcpSyncSchema } from "./gcp-sync-schemas";

export type TGcpSyncListItem = z.infer<typeof GcpSyncListItemSchema>;

export type TGcpSync = z.infer<typeof GcpSyncSchema>;

export type TGcpSyncInput = z.infer<typeof CreateGcpSyncSchema>;

export type TGcpSyncWithCredentials = TGcpSync & {
  connection: TGcpConnection;
};
