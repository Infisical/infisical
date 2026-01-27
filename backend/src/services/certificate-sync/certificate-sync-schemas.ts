import { z } from "zod";

import { PkiSync } from "../pki-sync/pki-sync-enums";

/**
 * AWS Elastic Load Balancer specific sync metadata
 * - isDefault: When true, this certificate will be set as the default certificate
 *   for all configured listeners during sync
 */
export const AwsElbSyncMetadataSchema = z.object({
  isDefault: z.boolean().optional()
});

export type TAwsElbSyncMetadata = z.infer<typeof AwsElbSyncMetadataSchema>;

/**
 * Base sync metadata schema - can be extended for future sync types
 * Each sync type can define its own metadata structure
 */
export const BaseSyncMetadataSchema = z.object({}).catchall(z.unknown());

/**
 * Combined sync metadata schema that validates based on context
 * This schema is used for API responses where we don't know the sync type
 */
export const SyncMetadataSchema = z
  .object({
    // AWS ELB specific
    isDefault: z.boolean().optional()
    // Add more fields here as needed for other sync types
  })
  .catchall(z.unknown())
  .nullable()
  .optional();

export type TSyncMetadata = z.infer<typeof SyncMetadataSchema>;

/**
 * Get the appropriate metadata schema for a specific PKI sync destination
 */
export const getSyncMetadataSchemaForDestination = (destination: PkiSync) => {
  switch (destination) {
    case PkiSync.AwsElasticLoadBalancer:
      return AwsElbSyncMetadataSchema.nullable().optional();
    default:
      // Other sync types don't currently use syncMetadata
      return BaseSyncMetadataSchema.nullable().optional();
  }
};

/**
 * Validate sync metadata for a specific destination
 */
export const validateSyncMetadata = (destination: PkiSync, metadata: unknown): boolean => {
  const schema = getSyncMetadataSchemaForDestination(destination);
  const result = schema.safeParse(metadata);
  return result.success;
};
