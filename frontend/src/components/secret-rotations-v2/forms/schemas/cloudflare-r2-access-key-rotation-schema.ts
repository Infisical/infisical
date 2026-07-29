import { z } from "zod";

import { BaseSecretRotationSchema } from "@app/components/secret-rotations-v2/forms/schemas/base-secret-rotation-v2-schema";
import {
  CloudflareTokenIpRestrictionsSchema,
  CloudflareTokenNameSchema
} from "@app/components/secret-rotations-v2/forms/schemas/shared";
import { CloudflareR2Jurisdiction } from "@app/hooks/api/appConnections/cloudflare";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";

export enum CloudflareR2AccessLevel {
  ObjectRead = "object-read",
  ObjectReadWrite = "object-read-write"
}

export const CLOUDFLARE_R2_ACCESS_LEVEL_MAP: Record<CloudflareR2AccessLevel, string> = {
  [CloudflareR2AccessLevel.ObjectRead]: "Object Read only",
  [CloudflareR2AccessLevel.ObjectReadWrite]: "Object Read & Write"
};

export const CLOUDFLARE_R2_JURISDICTION_MAP: Record<CloudflareR2Jurisdiction, string> = {
  [CloudflareR2Jurisdiction.Default]: "Default",
  [CloudflareR2Jurisdiction.Eu]: "EU",
  [CloudflareR2Jurisdiction.FedRamp]: "FedRAMP"
};

export const CloudflareR2BucketSchema = z.object({
  name: z.string().trim().min(1, "Bucket name required"),
  jurisdiction: z.nativeEnum(CloudflareR2Jurisdiction)
});

export type TCloudflareR2BucketSelection = z.infer<typeof CloudflareR2BucketSchema>;

/**
 * A bucket is only unique per (jurisdiction, name) — which is exactly what the token policy's resource
 * key encodes — so both are needed to identify a selection.
 */
export const r2BucketKey = ({ name, jurisdiction }: TCloudflareR2BucketSelection) =>
  `${jurisdiction}:${name}`;

export const getR2BucketLabel = ({ name, jurisdiction }: TCloudflareR2BucketSelection) =>
  jurisdiction === CloudflareR2Jurisdiction.Default
    ? name
    : `${name} (${CLOUDFLARE_R2_JURISDICTION_MAP[jurisdiction]})`;

export const CloudflareR2AccessKeyRotationSchema = z
  .object({
    type: z.literal(SecretRotation.CloudflareR2AccessKey),
    parameters: z.object({
      name: CloudflareTokenNameSchema,
      buckets: CloudflareR2BucketSchema.array()
        .min(1, "At least one bucket is required")
        .refine(
          (buckets) => new Set(buckets.map(r2BucketKey)).size === buckets.length,
          "Buckets must be unique"
        ),
      accessLevel: z.nativeEnum(CloudflareR2AccessLevel),
      allowedIps: CloudflareTokenIpRestrictionsSchema,
      disallowedIps: CloudflareTokenIpRestrictionsSchema
    }),
    secretsMapping: z.object({
      accessKeyId: z.string().trim().min(1, "Access Key ID secret name required"),
      secretAccessKey: z.string().trim().min(1, "Secret Access Key secret name required")
    })
  })
  .merge(BaseSecretRotationSchema);
