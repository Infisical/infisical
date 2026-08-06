import { TOrgPermission } from "@app/lib/types";

// Project-scoped insights: the dashboard for a single secret management project.

export type TGetInsightsCalendarDTO = {
  projectId: string;
  month: number;
  year: number;
};

export type TGetAccessVolumeDTO = {
  projectId: string;
};

export type TGetAccessLocationsDTO = {
  projectId: string;
  days: number;
};

export type TGetAuthMethodDistributionDTO = {
  projectId: string;
  days: number;
};

export type TGetInsightsSummaryDTO = {
  projectId: string;
  staleSecretsOffset?: number;
  staleSecretsLimit?: number;
};

export type TGetSecretsDuplicationDTO = {
  projectId: string;
};

export type TGetInsightsCountsDTO = {
  projectId: string;
};

// Org-scoped insights: aggregates spanning every secret management project in the organization.

export type TOrgInsightsDTO = TOrgPermission;

export type TGetSecretsUsageInsightsDTO = TOrgInsightsDTO;

export type TSecretsUsageInsights = {
  activeLeases: number;
  users: number;
  identities: number;
};

export type TGetSecretsProjectWarningsDTO = TOrgInsightsDTO & {
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

export type TGetOrgAccessVolumeDTO = TOrgInsightsDTO;

export type TAccessVolumeActor = {
  name: string;
  type: string;
  count: number;
};

export type TAccessVolumeDay = {
  date: string;
  total: number;
  actors: TAccessVolumeActor[];
};

export type TOrgAccessVolumeDay = {
  date: string;
  total: number;
};

export type TOrgAccessVolume = {
  days: TOrgAccessVolumeDay[];
  // false when audit logs are served from Postgres rather than ClickHouse, in which case
  // the aggregate is not computed and `days` is empty.
  isSupported: boolean;
};
