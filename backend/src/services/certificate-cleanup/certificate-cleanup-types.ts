import { TProjectPermission } from "@app/lib/types";

export type TGetCertificateCleanupConfigDTO = TProjectPermission;

export type TUpdateCertificateCleanupConfigDTO = {
  isEnabled?: boolean;
  postExpiryRetentionDays?: number;
  skipCertsWithActiveSyncs?: boolean;
} & TProjectPermission;

export enum CleanupRunStatus {
  Success = "success",
  Error = "error"
}

export const CLEANUP_BATCH_SIZE = 500;
