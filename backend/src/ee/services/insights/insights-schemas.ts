import { z } from "zod";

import { IdentityAuthMethod } from "@app/db/schemas";
import { INSIGHTS } from "@app/lib/api-docs";

export const SecretsSummarySchema = z.object({
  activeLeases: z.number().int().describe(INSIGHTS.GET_SECRETS_SUMMARY.activeLeases),
  users: z.number().int().describe(INSIGHTS.GET_SECRETS_SUMMARY.users),
  identities: z.number().int().describe(INSIGHTS.GET_SECRETS_SUMMARY.identities)
});

export const SecretsProjectWarningSchema = z.object({
  projectId: z.string().uuid().describe(INSIGHTS.GET_SECRETS_PROJECT.projectId),
  projectName: z.string().describe(INSIGHTS.GET_SECRETS_PROJECT.projectName),
  projectSlug: z.string().describe(INSIGHTS.GET_SECRETS_PROJECT.projectSlug),
  totalSecrets: z.number().int().describe(INSIGHTS.GET_SECRETS_PROJECT.totalSecrets),
  severityScore: z.number().int().describe(INSIGHTS.GET_SECRETS_PROJECT.severityScore),
  warnings: z
    .object({
      duplicatedSecrets: z.number().int().nullable().describe(INSIGHTS.GET_SECRETS_PROJECT.duplicatedSecrets),
      staleSecrets: z.number().int().describe(INSIGHTS.GET_SECRETS_PROJECT.staleSecrets),
      failedRotations: z.number().int().describe(INSIGHTS.GET_SECRETS_PROJECT.failedRotations),
      failedSyncs: z.number().int().describe(INSIGHTS.GET_SECRETS_PROJECT.failedSyncs),
      orphanedLeases: z.number().int().describe(INSIGHTS.GET_SECRETS_PROJECT.orphanedLeases)
    })
    .describe(INSIGHTS.GET_SECRETS_PROJECT.warnings)
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

export const SecretsProjectsSchema = z.object({
  projects: SecretsProjectWarningSchema.array(),
  totalProjects: z.number().int().describe(INSIGHTS.GET_SECRETS_PROJECTS.totalProjects),
  projectsWithIssues: z.number().int().describe(INSIGHTS.GET_SECRETS_PROJECTS.projectsWithIssues),
  offset: z.number().int().describe(INSIGHTS.GET_SECRETS_PROJECTS.offset),
  limit: z.number().int().describe(INSIGHTS.GET_SECRETS_PROJECTS.limit)
});
