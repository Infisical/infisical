import { z } from "zod";

import {
  CreateWindowsServerPkiSyncSchema,
  WindowsServerPkiSyncConfigSchema,
  WindowsServerPkiSyncListItemSchema,
  WindowsServerPkiSyncOptionsSchema,
  WindowsServerPkiSyncSchema
} from "./windows-server-pki-sync-schemas";

export type TWindowsServerPkiSync = z.infer<typeof WindowsServerPkiSyncSchema>;

export type TWindowsServerPkiSyncConfig = z.infer<typeof WindowsServerPkiSyncConfigSchema>;

export type TWindowsServerPkiSyncOptions = z.infer<typeof WindowsServerPkiSyncOptionsSchema>;

export type TWindowsServerPkiSyncListItem = z.infer<typeof WindowsServerPkiSyncListItemSchema>;

export type TCreateWindowsServerPkiSync = z.infer<typeof CreateWindowsServerPkiSyncSchema>;
