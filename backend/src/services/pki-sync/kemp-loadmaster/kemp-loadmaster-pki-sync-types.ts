import { z } from "zod";

import { TKempLoadMasterConnection } from "@app/services/app-connection/kemp-loadmaster/kemp-loadmaster-connection-types";

import {
  CreateKempLoadMasterPkiSyncSchema,
  KempLoadMasterPkiSyncConfigSchema,
  KempLoadMasterPkiSyncSchema,
  UpdateKempLoadMasterPkiSyncSchema
} from "./kemp-loadmaster-pki-sync-schemas";

export type TKempLoadMasterPkiSyncConfig = z.infer<typeof KempLoadMasterPkiSyncConfigSchema>;

export type TKempLoadMasterPkiSync = z.infer<typeof KempLoadMasterPkiSyncSchema>;

export type TKempLoadMasterPkiSyncInput = z.infer<typeof CreateKempLoadMasterPkiSyncSchema>;

export type TKempLoadMasterPkiSyncUpdate = z.infer<typeof UpdateKempLoadMasterPkiSyncSchema>;

export type TKempLoadMasterPkiSyncWithCredentials = TKempLoadMasterPkiSync & {
  connection: TKempLoadMasterConnection;
};
