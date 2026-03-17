import { TProjectPermission } from "@app/lib/types";

export type TGetCertificateCleanupConfigDTO = TProjectPermission;

export type TUpdateCertificateCleanupConfigDTO = {
  isEnabled?: boolean;
  daysBeforeDeletion?: number;
  includeRevokedCertificates?: boolean;
  skipCertsWithActiveSyncs?: boolean;
} & TProjectPermission;

export enum CleanupRunStatus {
  Success = "success",
  Error = "error"
}

export const CLEANUP_BATCH_SIZE = 500;
export const CLEANUP_AUDIT_LOG_CAP = 1000;
