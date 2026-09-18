import { z } from "zod";

import { TNutanixPrismCentralConnection } from "@app/services/app-connection/nutanix-prism-central/nutanix-prism-central-connection-types";

import {
  CreateNutanixPrismCentralPkiSyncSchema,
  NutanixPrismCentralPkiSyncConfigSchema,
  NutanixPrismCentralPkiSyncSchema,
  UpdateNutanixPrismCentralPkiSyncSchema
} from "./nutanix-prism-central-pki-sync-schemas";

export type TNutanixPrismCentralPkiSyncConfig = z.infer<typeof NutanixPrismCentralPkiSyncConfigSchema>;

export type TNutanixPrismCentralPkiSync = z.infer<typeof NutanixPrismCentralPkiSyncSchema>;

export type TNutanixPrismCentralPkiSyncInput = z.infer<typeof CreateNutanixPrismCentralPkiSyncSchema>;

export type TNutanixPrismCentralPkiSyncUpdate = z.infer<typeof UpdateNutanixPrismCentralPkiSyncSchema>;

export type TNutanixPrismCentralPkiSyncWithCredentials = TNutanixPrismCentralPkiSync & {
  connection: TNutanixPrismCentralConnection;
};
