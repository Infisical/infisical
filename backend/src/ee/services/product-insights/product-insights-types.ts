import { TOrgPermission } from "@app/lib/types";

export type TProductInsightsDTO = TOrgPermission;

export type TGetSecretsUsageInsightsDTO = TProductInsightsDTO;

export type TSecretsUsageInsights = {
  activeLeases: number;
  users: number;
  identities: number;
};

export type TGetSecretsProjectWarningsDTO = TProductInsightsDTO & {
  offset: number;
  limit: number;
};

export type TProjectWarningCounts = {
  // null when the project does not have secret blind indexing enabled (the metric is unknowable, not zero)
  duplicatedSecrets: number | null;
  staleSecrets: number;
  failedRotations: number;
  failedSyncs: number;
  orphanedLeases: number;
};

export type TSecretsProjectWarning = {
  projectId: string;
  projectName: string;
  projectSlug: string;
  totalSecrets: number;
  severityScore: number;
  warnings: TProjectWarningCounts;
};

export type TSecretsProjectWarnings = {
  projects: TSecretsProjectWarning[];
  totalProjects: number;
  projectsWithIssues: number;
  offset: number;
  limit: number;
};
