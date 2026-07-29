import { SecretRotation } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-enums";
import { TSecretRotationV2ListItem } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-types";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { CloudflareR2AccessLevel } from "./cloudflare-r2-access-key-rotation-schemas";

export const CLOUDFLARE_R2_ACCESS_KEY_ROTATION_LIST_OPTION: TSecretRotationV2ListItem = {
  name: "Cloudflare R2 Access Key",
  type: SecretRotation.CloudflareR2AccessKey,
  connection: AppConnection.Cloudflare,
  template: {
    secretsMapping: {
      apiToken: "CLOUDFLARE_R2_API_TOKEN",
      accessKeyId: "CLOUDFLARE_R2_ACCESS_KEY_ID",
      secretAccessKey: "CLOUDFLARE_R2_SECRET_ACCESS_KEY"
    }
  }
};

/** The resource scope Cloudflare reports for permission groups that attach to individual R2 buckets. */
export const CLOUDFLARE_R2_BUCKET_PERMISSION_SCOPE = "com.cloudflare.edge.r2.bucket";

/**
 * Access levels resolve to Cloudflare's bucket-item permission groups by name — the ids are opaque and
 * undocumented, so we look them up per account instead of hardcoding them. Read is granted alongside
 * Write so a read-write key can always list and get objects.
 */
export const CLOUDFLARE_R2_ACCESS_LEVEL_PERMISSION_GROUPS: Record<CloudflareR2AccessLevel, string[]> = {
  [CloudflareR2AccessLevel.ObjectRead]: ["Workers R2 Storage Bucket Item Read"],
  [CloudflareR2AccessLevel.ObjectReadWrite]: [
    "Workers R2 Storage Bucket Item Read",
    "Workers R2 Storage Bucket Item Write"
  ]
};
