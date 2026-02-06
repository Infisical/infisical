import { z } from "zod";

import { PkiSync } from "@app/hooks/api/pkiSyncs";

import { BasePkiSyncSchema } from "./base-pki-sync-schema";

const AwsElasticLoadBalancerSyncOptionsSchema = z.object({
  canImportCertificates: z.boolean().default(false),
  canRemoveCertificates: z.boolean().default(false),
  preserveArn: z.boolean().default(true),
  includeRootCa: z.boolean().default(false),
  certificateNameSchema: z.string().optional()
});

const AwsElasticLoadBalancerListenerSchema = z.object({
  listenerArn: z.string().min(1, "Listener ARN is required"),
  port: z.number().int().positive(),
  protocol: z.string().min(1)
});

export const AwsElasticLoadBalancerPkiSyncDestinationSchema = BasePkiSyncSchema(
  AwsElasticLoadBalancerSyncOptionsSchema
).merge(
  z.object({
    destination: z.literal(PkiSync.AwsElasticLoadBalancer),
    destinationConfig: z.object({
      region: z.string().min(1, "AWS region is required"),
      loadBalancerArn: z.string().min(1, "Load Balancer is required"),
      listeners: z
        .array(AwsElasticLoadBalancerListenerSchema)
        .min(1, "At least one listener is required")
    })
  })
);

export const UpdateAwsElasticLoadBalancerPkiSyncDestinationSchema =
  AwsElasticLoadBalancerPkiSyncDestinationSchema.partial().merge(
    z.object({
      name: z
        .string()
        .trim()
        .min(1, "Name is required")
        .max(255, "Name must be less than 255 characters"),
      destination: z.literal(PkiSync.AwsElasticLoadBalancer),
      connection: z.object({
        id: z.string().uuid("Invalid connection ID format"),
        name: z.string().max(255, "Connection name must be less than 255 characters")
      })
    })
  );
