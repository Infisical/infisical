import { IdentityAuthMethod } from "@app/hooks/api";

// These types mirror the org insights endpoint schemas in
// backend/src/ee/services/insights/insights-schemas.ts. The cards are not wired to the
// backend yet; keeping the shapes identical means wiring later is only a data-source swap.

// Header stat strip counts. No org endpoint returns these yet — flag to backend when wiring.
export type TOrgCounts = {
  projects: number;
  secrets: number;
  environments: number;
  rotations: number;
};

export type TSecretsSummary = {
  activeLeases: number;
  users: number;
  identities: number;
};

export type TProjectInsightWarnings = {
  // null means unknown (e.g. secret blind index disabled), which is different from zero
  duplicatedSecrets: number | null;
  staleSecrets: number;
  failedRotations: number;
  failedSyncs: number;
  orphanedLeases: number;
};

export type TProjectInsight = {
  projectId: string;
  projectName: string;
  projectSlug: string;
  totalSecrets: number;
  severityScore: number;
  warnings: TProjectInsightWarnings;
};

export type TProjectsInsights = {
  projects: TProjectInsight[];
  totalProjects: number;
  projectsWithIssues: number;
};

export type TAuthMethodUsage = {
  isSupported: boolean;
  totalFetches: number;
  unknownCount: number;
  methods: { authMethod: IdentityAuthMethod; count: number }[];
};

export type TStaticSecretUsage = {
  // Secrets created during each of the last twelve UTC calendar weeks, oldest first.
  // totalSecrets is a per-week count, not a running total.
  weeks: { weekStart: string; totalSecrets: number; isPartial: boolean }[];
};

export type TSecretAccessVolume = {
  isSupported: boolean;
  days: { date: string; total: number }[];
};
