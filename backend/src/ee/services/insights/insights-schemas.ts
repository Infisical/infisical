import { z } from "zod";

import { IdentityAuthMethod } from "@app/db/schemas";
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

export const OrgSecretsAccessVolumeSchema = z.object({
  isSupported: z.boolean().describe(INSIGHTS.GET_SECRETS_ACCESS_VOLUME.isSupported),
  days: z
    .object({
      date: z.string().describe(INSIGHTS.GET_SECRETS_ACCESS_VOLUME.date),
      total: z.number().int().describe(INSIGHTS.GET_SECRETS_ACCESS_VOLUME.total)
    })
    .array()
    .describe(INSIGHTS.GET_SECRETS_ACCESS_VOLUME.days)
});

export const OrgAuthMethodDistributionSchema = z.object({
  isSupported: z.boolean().describe(INSIGHTS.GET_SECRETS_AUTH_METHOD_DISTRIBUTION.isSupported),
  totalFetches: z.number().int().describe(INSIGHTS.GET_SECRETS_AUTH_METHOD_DISTRIBUTION.totalFetches),
  unknownCount: z.number().int().describe(INSIGHTS.GET_SECRETS_AUTH_METHOD_DISTRIBUTION.unknownCount),
  methods: z
    .object({
      authMethod: z.nativeEnum(IdentityAuthMethod).describe(INSIGHTS.GET_SECRETS_AUTH_METHOD_DISTRIBUTION.authMethod),
      count: z.number().int().describe(INSIGHTS.GET_SECRETS_AUTH_METHOD_DISTRIBUTION.count)
    })
    .array()
    .describe(INSIGHTS.GET_SECRETS_AUTH_METHOD_DISTRIBUTION.methods)
});

export const StaticSecretsUsageSchema = z.object({
  weeks: z
    .object({
      weekStart: z.string().describe(INSIGHTS.GET_STATIC_SECRETS_USAGE.weekStart),
      totalSecrets: z.number().int().describe(INSIGHTS.GET_STATIC_SECRETS_USAGE.totalSecrets),
      isPartial: z.boolean().describe(INSIGHTS.GET_STATIC_SECRETS_USAGE.isPartial)
    })
    .array()
    .describe(INSIGHTS.GET_STATIC_SECRETS_USAGE.weeks)
});

export const SecretsProjectWarningsSchema = z.object({
  projects: SecretsProjectWarningSchema.array(),
  totalProjects: z.number().int().describe(INSIGHTS.GET_SECRETS_PROJECT_WARNINGS.totalProjects),
  projectsWithIssues: z.number().int().describe(INSIGHTS.GET_SECRETS_PROJECT_WARNINGS.projectsWithIssues),
  offset: z.number().int().describe(INSIGHTS.GET_SECRETS_PROJECT_WARNINGS.offset),
  limit: z.number().int().describe(INSIGHTS.GET_SECRETS_PROJECT_WARNINGS.limit)
});
