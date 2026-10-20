import { z } from "zod";

import { IdentityAuthMethod } from "@app/db/schemas";
import { UnusedAccessPrincipalType } from "@app/ee/services/secret-read-activity/secret-read-activity-types";
import { INSIGHTS } from "@app/lib/api-docs";

export const SecretsSummarySchema = z.object({
  activeLeases: z.number().int().describe(INSIGHTS.GET_SECRETS_SUMMARY.activeLeases),
  users: z.number().int().describe(INSIGHTS.GET_SECRETS_SUMMARY.users),
  identities: z.number().int().describe(INSIGHTS.GET_SECRETS_SUMMARY.identities)
});

export const SecretsProjectWarningSchema = z.object({
  projectId: z.string().describe(INSIGHTS.GET_SECRETS_PROJECTS.projectId),
  projectName: z.string().describe(INSIGHTS.GET_SECRETS_PROJECTS.projectName),
  projectSlug: z.string().describe(INSIGHTS.GET_SECRETS_PROJECTS.projectSlug),
  totalSecrets: z.number().int().describe(INSIGHTS.GET_SECRETS_PROJECTS.totalSecrets),
  severityScore: z.number().int().describe(INSIGHTS.GET_SECRETS_PROJECTS.severityScore),
  warnings: z
    .object({
      duplicatedSecrets: z.number().int().nullable().describe(INSIGHTS.GET_SECRETS_PROJECTS.duplicatedSecrets),
      staleSecrets: z.number().int().describe(INSIGHTS.GET_SECRETS_PROJECTS.staleSecrets),
      failedRotations: z.number().int().describe(INSIGHTS.GET_SECRETS_PROJECTS.failedRotations),
      failedSyncs: z.number().int().describe(INSIGHTS.GET_SECRETS_PROJECTS.failedSyncs),
      orphanedLeases: z.number().int().describe(INSIGHTS.GET_SECRETS_PROJECTS.orphanedLeases)
    })
    .describe(INSIGHTS.GET_SECRETS_PROJECTS.warnings)
});

export const OrgSecretsAccessVolumeSchema = z.object({
  days: z
    .object({
      date: z.string().describe(INSIGHTS.GET_SECRETS_ACCESS_VOLUME.date),
      total: z.number().int().describe(INSIGHTS.GET_SECRETS_ACCESS_VOLUME.total)
    })
    .array()
    .describe(INSIGHTS.GET_SECRETS_ACCESS_VOLUME.days)
});

export const OrgAuthMethodDistributionSchema = z.object({
  totalFetches: z.number().int().describe(INSIGHTS.GET_SECRETS_AUTH_METHOD_DISTRIBUTION.totalFetches),
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

const UnusedAccessPrincipalRowSchema = z.object({
  principalType: z.nativeEnum(UnusedAccessPrincipalType).describe(INSIGHTS.GET_UNUSED_ACCESS.principalType),
  principalId: z.string().describe(INSIGHTS.GET_UNUSED_ACCESS.principalId),
  name: z.string().describe(INSIGHTS.GET_UNUSED_ACCESS.name),
  memberCount: z.number().int().nullable().describe(INSIGHTS.GET_UNUSED_ACCESS.memberCount),
  entitledCount: z.number().int().describe(INSIGHTS.GET_UNUSED_ACCESS.entitledCount),
  unreadCount: z.number().int().describe(INSIGHTS.GET_UNUSED_ACCESS.unreadCount),
  environments: z.string().array().describe(INSIGHTS.GET_UNUSED_ACCESS.environments),
  lastReadAt: z.date().nullable().describe(INSIGHTS.GET_UNUSED_ACCESS.lastReadAt),
  accessVia: z.string().array().describe(INSIGHTS.GET_UNUSED_ACCESS.accessVia)
});

export const UnusedAccessSchema = z.object({
  totalCount: z.number().int().describe(INSIGHTS.GET_UNUSED_ACCESS.totalCount),
  trackingStartedAt: z.date().describe(INSIGHTS.GET_UNUSED_ACCESS.trackingStartedAt),
  preliminaryUntil: z.date().describe(INSIGHTS.GET_UNUSED_ACCESS.preliminaryUntil),
  principals: UnusedAccessPrincipalRowSchema.array().describe(INSIGHTS.GET_UNUSED_ACCESS.principals)
});

export const UnusedAccessPrincipalSchema = z.object({
  principal: UnusedAccessPrincipalRowSchema,
  unlistedCount: z.number().int().describe(INSIGHTS.GET_UNUSED_ACCESS_PRINCIPAL.unlistedCount),
  trackingStartedAt: z.date().describe(INSIGHTS.GET_UNUSED_ACCESS.trackingStartedAt),
  preliminaryUntil: z.date().describe(INSIGHTS.GET_UNUSED_ACCESS.preliminaryUntil),
  secrets: z
    .object({
      secretKey: z.string().describe(INSIGHTS.GET_UNUSED_ACCESS_PRINCIPAL.secretKey),
      environment: z.string().describe(INSIGHTS.GET_UNUSED_ACCESS_PRINCIPAL.environment),
      secretPath: z.string().describe(INSIGHTS.GET_UNUSED_ACCESS_PRINCIPAL.secretPath)
    })
    .array()
    .describe(INSIGHTS.GET_UNUSED_ACCESS_PRINCIPAL.secrets)
});
