import { z } from "zod";

import { TChefConnection } from "@app/ee/services/app-connections/chef/chef-connection-types";

import {
  ChefFieldMappingsSchema,
  ChefPkiSyncConfigSchema,
  ChefPkiSyncSchema,
  CreateChefPkiSyncSchema,
  UpdateChefPkiSyncSchema
} from "./chef-pki-sync-schemas";

export type TChefPkiSyncConfig = z.infer<typeof ChefPkiSyncConfigSchema>;

export type TChefFieldMappings = z.infer<typeof ChefFieldMappingsSchema>;

export type TChefPkiSync = z.infer<typeof ChefPkiSyncSchema>;

export type TChefPkiSyncInput = z.infer<typeof CreateChefPkiSyncSchema>;

export type TChefPkiSyncUpdate = z.infer<typeof UpdateChefPkiSyncSchema>;

export type TChefPkiSyncWithCredentials = TChefPkiSync & {
  connection: TChefConnection;
};

export interface ChefCertificateDataBagItem {
  id: string;
  [key: string]: string;
}

export interface SyncCertificatesResult {
  uploaded: number;
  updated: number;
  removed: number;
  failedRemovals: number;
  skipped: number;
  details?: {
    failedUploads?: Array<{ name: string; error: string }>;
    failedRemovals?: Array<{ name: string; error: string }>;
    validationErrors?: Array<{ name: string; error: string }>;
  };
}

export interface RemoveCertificatesResult {
  removed: number;
  failed: number;
  skipped: number;
}

export interface CertificateImportRequest {
  id: string;
  name: string;
  certificate: string;
  privateKey: string;
  certificateChain?: string;
  alternativeNames?: string[];
  certificateId?: string;
}
