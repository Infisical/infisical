import { z } from "zod";

import { TAwsConnection } from "@app/services/app-connection/aws/aws-connection-types";

import {
  AwsElasticLoadBalancerPkiSyncConfigSchema,
  AwsElasticLoadBalancerPkiSyncSchema,
  CreateAwsElasticLoadBalancerPkiSyncSchema,
  UpdateAwsElasticLoadBalancerPkiSyncSchema
} from "./aws-elastic-load-balancer-pki-sync-schemas";

export type TAwsElasticLoadBalancerPkiSyncConfig = z.infer<typeof AwsElasticLoadBalancerPkiSyncConfigSchema>;

export type TAwsElasticLoadBalancerPkiSync = z.infer<typeof AwsElasticLoadBalancerPkiSyncSchema>;

export type TAwsElasticLoadBalancerPkiSyncInput = z.infer<typeof CreateAwsElasticLoadBalancerPkiSyncSchema>;

export type TAwsElasticLoadBalancerPkiSyncUpdate = z.infer<typeof UpdateAwsElasticLoadBalancerPkiSyncSchema>;

export type TAwsElasticLoadBalancerPkiSyncWithCredentials = TAwsElasticLoadBalancerPkiSync & {
  connection: TAwsConnection;
};

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
