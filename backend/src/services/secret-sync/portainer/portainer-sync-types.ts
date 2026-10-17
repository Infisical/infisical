import z from "zod";

import { TPortainerConnection } from "@app/services/app-connection/portainer";

import { CreatePortainerSyncSchema, PortainerSyncListItemSchema, PortainerSyncSchema } from "./portainer-sync-schemas";

export type TPortainerSyncListItem = z.infer<typeof PortainerSyncListItemSchema>;

export type TPortainerSync = z.infer<typeof PortainerSyncSchema>;

export type TPortainerSyncInput = z.infer<typeof CreatePortainerSyncSchema>;

export type TPortainerSyncWithCredentials = TPortainerSync & {
  connection: TPortainerConnection;
};

export type TPortainerStackFileResponse = {
  StackFileContent: string;
};
