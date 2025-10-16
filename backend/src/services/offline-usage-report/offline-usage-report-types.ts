export interface TUsageMetrics {
  // User metrics
  totalUsers: number;
  usersByAuthMethod: Record<string, number>;
  adminUsers: number;

  // Machine identity metrics
  totalMachineIdentities: number;
  machineIdentitiesByAuthMethod: Record<string, number>;

  // Project metrics
  totalProjects: number;
  projectsByType: Record<string, number>;
  averageSecretsPerProject: number;

  // Secret metrics
  totalSecrets: number;
  totalSecretSyncs: number;
  totalDynamicSecrets: number;
  totalSecretRotations: number;
}

export interface TUsageReportMetadata {
  generatedAt: string;
  instanceId: string;
  reportVersion: string;
}

export interface TUsageReport {
  metadata: TUsageReportMetadata;
  metrics: TUsageMetrics;
  signature?: string;
}

export interface TGenerateUsageReportDTO {
  includeSignature?: boolean;
}

export interface TVerifyUsageReportDTO {
  reportData: string;
  signature: string;
}
