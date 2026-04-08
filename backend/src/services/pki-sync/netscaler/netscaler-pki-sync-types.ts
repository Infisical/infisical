import { z } from "zod";

import { TNetScalerConnection } from "@app/services/app-connection/netscaler/netscaler-connection-types";

import {
  CreateNetScalerPkiSyncSchema,
  NetScalerPkiSyncConfigSchema,
  NetScalerPkiSyncSchema,
  UpdateNetScalerPkiSyncSchema
} from "./netscaler-pki-sync-schemas";

export type TNetScalerPkiSyncConfig = z.infer<typeof NetScalerPkiSyncConfigSchema>;

export type TNetScalerPkiSync = z.infer<typeof NetScalerPkiSyncSchema>;

export type TNetScalerPkiSyncInput = z.infer<typeof CreateNetScalerPkiSyncSchema>;

export type TNetScalerPkiSyncUpdate = z.infer<typeof UpdateNetScalerPkiSyncSchema>;

export type TNetScalerPkiSyncWithCredentials = TNetScalerPkiSync & {
  connection: TNetScalerConnection;
};
