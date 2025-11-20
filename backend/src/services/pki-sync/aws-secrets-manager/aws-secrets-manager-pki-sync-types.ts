import { z } from "zod";

import { TAwsConnection } from "@app/services/app-connection/aws/aws-connection-types";

import {
  AwsSecretsManagerFieldMappingsSchema,
  AwsSecretsManagerPkiSyncConfigSchema,
  AwsSecretsManagerPkiSyncSchema,
  CreateAwsSecretsManagerPkiSyncSchema,
  UpdateAwsSecretsManagerPkiSyncSchema
} from "./aws-secrets-manager-pki-sync-schemas";

export type TAwsSecretsManagerPkiSyncConfig = z.infer<typeof AwsSecretsManagerPkiSyncConfigSchema>;

export type TAwsSecretsManagerFieldMappings = z.infer<typeof AwsSecretsManagerFieldMappingsSchema>;

export type TAwsSecretsManagerPkiSync = z.infer<typeof AwsSecretsManagerPkiSyncSchema>;

export type TAwsSecretsManagerPkiSyncInput = z.infer<typeof CreateAwsSecretsManagerPkiSyncSchema>;

export type TAwsSecretsManagerPkiSyncUpdate = z.infer<typeof UpdateAwsSecretsManagerPkiSyncSchema>;

export type TAwsSecretsManagerPkiSyncWithCredentials = TAwsSecretsManagerPkiSync & {
  connection: TAwsConnection;
  appConnectionName: string;
  appConnectionApp: string;
};

export interface AwsSecretsManagerCertificateSecret {
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
  name: string;
  certificate: string;
  privateKey: string;
  certificateChain?: string;
  caCertificate?: string;
  certificateId?: string;
}
