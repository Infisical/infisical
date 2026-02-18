import { z } from "zod";

import { AppConnection, AWSRegion } from "@app/services/app-connection/app-connection-enums";
import { PkiSync } from "@app/services/pki-sync/pki-sync-enums";
import { PkiSyncSchema } from "@app/services/pki-sync/pki-sync-schemas";

export const AwsElasticLoadBalancerListenerSchema = z.object({
  listenerArn: z.string().min(1, "Listener ARN is required"),
  port: z.number().int().positive(),
  protocol: z.string().min(1),
  // setAsDefault is deprecated - use per-certificate default via syncMetadata.isDefault
  // Kept optional for backward compatibility with existing syncs
  setAsDefault: z.boolean().optional()
});

export const AwsElasticLoadBalancerPkiSyncConfigSchema = z.object({
  region: z.nativeEnum(AWSRegion),
  loadBalancerArn: z.string().min(1, "Load Balancer ARN is required"),
  listeners: z.array(AwsElasticLoadBalancerListenerSchema).min(1, "At least one listener is required")
});

const AwsElasticLoadBalancerPkiSyncOptionsSchema = z.object({
  canImportCertificates: z.boolean().default(false),
  canRemoveCertificates: z.boolean().default(false),
  preserveArn: z.boolean().default(true),
  includeRootCa: z.boolean().default(false),
  certificateNameSchema: z.string().optional()
});

export const AwsElasticLoadBalancerPkiSyncSchema = PkiSyncSchema.extend({
  destination: z.literal(PkiSync.AwsElasticLoadBalancer),
  destinationConfig: AwsElasticLoadBalancerPkiSyncConfigSchema,
  syncOptions: AwsElasticLoadBalancerPkiSyncOptionsSchema
});

export const CreateAwsElasticLoadBalancerPkiSyncSchema = z.object({
  name: z.string().trim().min(1).max(256),
  description: z.string().optional(),
  isAutoSyncEnabled: z.boolean().default(true),
  destinationConfig: AwsElasticLoadBalancerPkiSyncConfigSchema,
  syncOptions: AwsElasticLoadBalancerPkiSyncOptionsSchema.optional().default({}),
  subscriberId: z.string().nullish(),
  connectionId: z.string(),
  projectId: z.string().trim().min(1),
  certificateIds: z.array(z.string().uuid()).optional()
});

export const UpdateAwsElasticLoadBalancerPkiSyncSchema = z.object({
  name: z.string().trim().min(1).max(256).optional(),
  description: z.string().optional(),
  isAutoSyncEnabled: z.boolean().optional(),
  destinationConfig: AwsElasticLoadBalancerPkiSyncConfigSchema.optional(),
  syncOptions: AwsElasticLoadBalancerPkiSyncOptionsSchema.optional(),
  subscriberId: z.string().nullish(),
  connectionId: z.string().optional()
});

export const AwsElasticLoadBalancerPkiSyncListItemSchema = z.object({
  name: z.literal("AWS Elastic Load Balancer"),
  connection: z.literal(AppConnection.AWS),
  destination: z.literal(PkiSync.AwsElasticLoadBalancer),
  canImportCertificates: z.literal(false),
  canRemoveCertificates: z.literal(false)
});
