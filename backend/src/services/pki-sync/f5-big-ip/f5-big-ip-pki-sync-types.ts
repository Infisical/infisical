import { z } from "zod";

import { TF5BigIpConnection } from "@app/services/app-connection/f5-big-ip/f5-big-ip-connection-types";

import {
  CreateF5BigIpPkiSyncSchema,
  F5BigIpPkiSyncConfigSchema,
  F5BigIpPkiSyncSchema,
  UpdateF5BigIpPkiSyncSchema
} from "./f5-big-ip-pki-sync-schemas";

export type TF5BigIpPkiSyncConfig = z.infer<typeof F5BigIpPkiSyncConfigSchema>;

export type TF5BigIpPkiSync = z.infer<typeof F5BigIpPkiSyncSchema>;

export type TF5BigIpPkiSyncInput = z.infer<typeof CreateF5BigIpPkiSyncSchema>;

export type TF5BigIpPkiSyncUpdate = z.infer<typeof UpdateF5BigIpPkiSyncSchema>;

export type TF5BigIpPkiSyncWithCredentials = TF5BigIpPkiSync & {
  connection: TF5BigIpConnection;
};
