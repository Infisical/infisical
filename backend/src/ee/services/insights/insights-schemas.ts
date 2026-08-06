import { z } from "zod";

import { INSIGHTS } from "@app/lib/api-docs";

export const SecretsUsageInsightsSchema = z.object({
  activeLeases: z.number().int().describe(INSIGHTS.GET_SECRETS_USAGE_INSIGHTS.activeLeases),
  users: z.number().int().describe(INSIGHTS.GET_SECRETS_USAGE_INSIGHTS.users),
  identities: z.number().int().describe(INSIGHTS.GET_SECRETS_USAGE_INSIGHTS.identities)
});

export const SecretsProjectWarningSchema = z.object({
  projectId: z.string().uuid().describe(INSIGHTS.GET_SECRETS_PROJECT_WARNINGS.projectId),
  projectName: z.string().describe(INSIGHTS.GET_SECRETS_PROJECT_WARNINGS.projectName),
  projectSlug: z.string().describe(INSIGHTS.GET_SECRETS_PROJECT_WARNINGS.projectSlug),
  totalSecrets: z.number().int().describe(INSIGHTS.GET_SECRETS_PROJECT_WARNINGS.totalSecrets),
  severityScore: z.number().int().describe(INSIGHTS.GET_SECRETS_PROJECT_WARNINGS.severityScore),
  warnings: z
    .object({
      duplicatedSecrets: z.number().int().nullable().describe(INSIGHTS.GET_SECRETS_PROJECT_WARNINGS.duplicatedSecrets),
      staleSecrets: z.number().int().describe(INSIGHTS.GET_SECRETS_PROJECT_WARNINGS.staleSecrets),
      failedRotations: z.number().int().describe(INSIGHTS.GET_SECRETS_PROJECT_WARNINGS.failedRotations),
      failedSyncs: z.number().int().describe(INSIGHTS.GET_SECRETS_PROJECT_WARNINGS.failedSyncs),
      orphanedLeases: z.number().int().describe(INSIGHTS.GET_SECRETS_PROJECT_WARNINGS.orphanedLeases)
    })
    .describe(INSIGHTS.GET_SECRETS_PROJECT_WARNINGS.warnings)
});

export const SecretsProjectWarningsSchema = z.object({
  projects: SecretsProjectWarningSchema.array(),
  totalProjects: z.number().int().describe(INSIGHTS.GET_SECRETS_PROJECT_WARNINGS.totalProjects),
  projectsWithIssues: z.number().int().describe(INSIGHTS.GET_SECRETS_PROJECT_WARNINGS.projectsWithIssues),
  offset: z.number().int().describe(INSIGHTS.GET_SECRETS_PROJECT_WARNINGS.offset),
  limit: z.number().int().describe(INSIGHTS.GET_SECRETS_PROJECT_WARNINGS.limit)
});
