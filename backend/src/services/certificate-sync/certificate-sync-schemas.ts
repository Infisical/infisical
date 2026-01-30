import { z } from "zod";

import { PkiSync } from "../pki-sync/pki-sync-enums";

/**
 * AWS Elastic Load Balancer specific sync metadata
 * - isDefault: When true, this certificate will be set as the default certificate
 */
export const AwsElbSyncMetadataSchema = z.object({
  isDefault: z.boolean().optional()
});

export type TAwsElbSyncMetadata = z.infer<typeof AwsElbSyncMetadataSchema>;

export const BaseSyncMetadataSchema = z.object({}).catchall(z.unknown());

export const SyncMetadataSchema = z
  .object({
    isDefault: z.boolean().optional()
  })
  .catchall(z.unknown())
  .nullable()
  .optional();

export type TSyncMetadata = z.infer<typeof SyncMetadataSchema>;

export const getSyncMetadataSchemaForDestination = (destination: PkiSync) => {
  switch (destination) {
    case PkiSync.AwsElasticLoadBalancer:
      return AwsElbSyncMetadataSchema.nullable().optional();
    default:
      return BaseSyncMetadataSchema.nullable().optional();
  }
};

export const validateSyncMetadata = (destination: PkiSync, metadata: unknown): boolean => {
  const schema = getSyncMetadataSchemaForDestination(destination);
  const result = schema.safeParse(metadata);
  return result.success;
};
