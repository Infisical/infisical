export type TCertificateCleanupConfig = {
  projectId: string;
  isEnabled: boolean;
  daysBeforeDeletion: number;
  includeRevokedCertificates: boolean;
  skipCertsWithActiveSyncs: boolean;

  lastRunStatus: string | null;
  lastRunAt: string | null;
  lastRunCertsDeleted: number;
  lastRunMessage: string | null;
};

export type TUpdateCertificateCleanupConfigDTO = {
  projectId: string;
  isEnabled?: boolean;
  daysBeforeDeletion?: number;
  includeRevokedCertificates?: boolean;
  skipCertsWithActiveSyncs?: boolean;
};
