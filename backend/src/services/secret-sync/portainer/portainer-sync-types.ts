import z from "zod";

import { TPortainerConnection } from "@app/services/app-connection/portainer";

import { CreatePortainerSyncSchema, PortainerSyncListItemSchema, PortainerSyncSchema } from "./portainer-sync-schemas";

export type TPortainerSyncListItem = z.infer<typeof PortainerSyncListItemSchema>;

export type TPortainerSync = z.infer<typeof PortainerSyncSchema>;

export type TPortainerSyncInput = z.infer<typeof CreatePortainerSyncSchema>;

export type TPortainerSyncWithCredentials = TPortainerSync & {
  connection: TPortainerConnection;
};

export type TPortainerEnvVar = {
  name: string;
  value: string;
};

export type TPortainerStackResponse = {
  Id: number;
  Name: string;
  EndpointId: number;
  Env?: TPortainerEnvVar[] | null;
  GitConfig?: {
    URL: string;
    ReferenceName?: string;
    ConfigFilePath?: string;
  } | null;
  AutoUpdate?: {
    Interval?: string;
    Webhook?: string;
    ForceUpdate?: boolean;
    ForcePullImage?: boolean;
  } | null;
};

export type TPortainerStackFileResponse = {
  StackFileContent: string;
};
