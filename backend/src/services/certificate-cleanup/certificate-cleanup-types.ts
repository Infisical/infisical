import { TActorInput } from "@app/lib/types";

export type TGetCertificateCleanupConfigDTO = { projectId: string } & TActorInput;

export type TUpdateCertificateCleanupConfigDTO = {
  isEnabled?: boolean;
  postExpiryRetentionDays?: number;
  skipCertsWithActiveSyncs?: boolean;
  projectId: string;
} & TActorInput;

export enum CleanupRunStatus {
  Success = "success",
  Error = "error"
}

export const CLEANUP_BATCH_SIZE = 500;
