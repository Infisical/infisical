import { z } from "zod";

import { TGcpConnection } from "@app/services/app-connection/gcp/gcp-connection-types";

import {
  CreateGcpCertificateManagerPkiSyncSchema,
  GcpCertificateManagerPkiSyncConfigSchema,
  GcpCertificateManagerPkiSyncOptionsSchema,
  GcpCertificateManagerPkiSyncSchema,
  UpdateGcpCertificateManagerPkiSyncSchema
} from "./gcp-certificate-manager-pki-sync-schemas";

export type TGcpCertificateManagerPkiSyncConfig = z.infer<typeof GcpCertificateManagerPkiSyncConfigSchema>;

export type TGcpCertificateManagerPkiSyncOptions = z.infer<typeof GcpCertificateManagerPkiSyncOptionsSchema>;

export type TGcpCertificateManagerPkiSync = z.infer<typeof GcpCertificateManagerPkiSyncSchema>;

export type TGcpCertificateManagerPkiSyncInput = z.infer<typeof CreateGcpCertificateManagerPkiSyncSchema>;

export type TGcpCertificateManagerPkiSyncUpdate = z.infer<typeof UpdateGcpCertificateManagerPkiSyncSchema>;

export type TGcpCertificateManagerPkiSyncWithCredentials = TGcpCertificateManagerPkiSync & {
  connection: TGcpConnection;
};

export type TGcpCertificate = {
  name: string;
  description?: string;
  labels?: Record<string, string>;
  sanDnsnames?: string[];
  pemCertificate?: string;
  expireTime?: string;
  scope?: string;
  createTime?: string;
  updateTime?: string;
  usedBy?: { name: string }[];
};

export type TGcpCertificateMapEntry = {
  name: string;
  description?: string;
  labels?: Record<string, string>;
  certificates?: string[];
  hostname?: string;
  matcher?: string;
  state?: string;
};

export type TGcpCertificateMap = {
  name: string;
  description?: string;
  labels?: Record<string, string>;
};

export type TGcpOperationStatus = {
  code?: number;
  message?: string;
  details?: unknown[];
};

export type TGcpOperation = {
  name: string;
  done?: boolean;
  error?: TGcpOperationStatus;
  response?: Record<string, unknown>;
};

export type TGcpListCertificatesResponse = {
  certificates?: TGcpCertificate[];
  nextPageToken?: string;
};

export type TGcpListCertificateMapEntriesResponse = {
  certificateMapEntries?: TGcpCertificateMapEntry[];
  nextPageToken?: string;
};
