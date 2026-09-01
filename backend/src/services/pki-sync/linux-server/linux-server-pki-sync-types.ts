import { z } from "zod";

import { TSshConnection } from "@app/services/app-connection/ssh/ssh-connection-types";

import {
  CreateLinuxServerPkiSyncSchema,
  LinuxServerPkiSyncConfigSchema,
  LinuxServerPkiSyncSchema,
  UpdateLinuxServerPkiSyncSchema
} from "./linux-server-pki-sync-schemas";

export type TLinuxServerPkiSyncConfig = z.infer<typeof LinuxServerPkiSyncConfigSchema>;

export type TLinuxServerPkiSync = z.infer<typeof LinuxServerPkiSyncSchema>;

export type TLinuxServerPkiSyncInput = z.infer<typeof CreateLinuxServerPkiSyncSchema>;

export type TLinuxServerPkiSyncUpdate = z.infer<typeof UpdateLinuxServerPkiSyncSchema>;

export type TLinuxServerPkiSyncWithCredentials = TLinuxServerPkiSync & {
  connection: TSshConnection;
};
