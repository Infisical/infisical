import { z } from "zod";

import { TCloudflareConnection } from "@app/services/app-connection/cloudflare/cloudflare-connection-types";

import {
  CloudflareCustomCertificatePkiSyncConfigSchema,
  CloudflareCustomCertificatePkiSyncSchema,
  CreateCloudflareCustomCertificatePkiSyncSchema,
  UpdateCloudflareCustomCertificatePkiSyncSchema
} from "./cloudflare-custom-certificate-pki-sync-schemas";

export type CloudflareEdgeCertificate = {
  id: string;
  hosts: string[];
  issuer: string;
  signature: string;
  status: string;
  bundle_method: string;
  zone_id: string;
  uploaded_on: string;
  modified_on: string;
  expires_on: string;
  priority: number;
};

export type TCloudflareCustomCertificatePkiSyncConfig = z.infer<typeof CloudflareCustomCertificatePkiSyncConfigSchema>;

export type TCloudflareCustomCertificatePkiSync = z.infer<typeof CloudflareCustomCertificatePkiSyncSchema>;

export type TCloudflareCustomCertificatePkiSyncInput = z.infer<typeof CreateCloudflareCustomCertificatePkiSyncSchema>;

export type TCloudflareCustomCertificatePkiSyncUpdate = z.infer<typeof UpdateCloudflareCustomCertificatePkiSyncSchema>;

export type TCloudflareCustomCertificatePkiSyncWithCredentials = TCloudflareCustomCertificatePkiSync & {
  connection: TCloudflareConnection;
};
