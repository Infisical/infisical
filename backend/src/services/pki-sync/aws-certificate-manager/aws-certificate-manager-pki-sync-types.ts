import * as AWS from "aws-sdk";
import { z } from "zod";

import { TAwsConnection } from "@app/services/app-connection/aws/aws-connection-types";

import {
  AwsCertificateManagerPkiSyncConfigSchema,
  AwsCertificateManagerPkiSyncSchema,
  CreateAwsCertificateManagerPkiSyncSchema,
  UpdateAwsCertificateManagerPkiSyncSchema
} from "./aws-certificate-manager-pki-sync-schemas";

export type TAwsCertificateManagerPkiSyncConfig = z.infer<typeof AwsCertificateManagerPkiSyncConfigSchema>;

export type TAwsCertificateManagerPkiSync = z.infer<typeof AwsCertificateManagerPkiSyncSchema>;

export type TAwsCertificateManagerPkiSyncInput = z.infer<typeof CreateAwsCertificateManagerPkiSyncSchema>;

export type TAwsCertificateManagerPkiSyncUpdate = z.infer<typeof UpdateAwsCertificateManagerPkiSyncSchema>;

export type TAwsCertificateManagerPkiSyncWithCredentials = TAwsCertificateManagerPkiSync & {
  connection: TAwsConnection;
};

export interface ACMCertificateWithKey extends AWS.ACM.CertificateDetail {
  Tags?: AWS.ACM.TagList;
  key: string;
  cert: string;
  certificateChain: string;
  privateKey: string;
  arn?: string;
}

export interface SyncCertificatesResult {
  uploaded: number;
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
  key: string;
  name: string;
  cert: string;
  privateKey: string;
  certificateChain?: string;
  existingArn?: string;
}
