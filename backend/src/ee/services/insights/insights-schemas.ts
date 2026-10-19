import { z } from "zod";

import { IdentityAuthMethod } from "@app/db/schemas";
import {
  SecretExposureCountsSchema,
  SecretExposureSchema
} from "@app/ee/services/secret-read-activity/secret-read-activity-schemas";
import { SecretExposureBand } from "@app/ee/services/secret-read-activity/secret-read-activity-types";
import { INSIGHTS } from "@app/lib/api-docs";
import { ActorType } from "@app/services/auth/auth-type";

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

export const UnusedSecretAccessSchema = z.object({
  totalCount: z.number().int().describe(INSIGHTS.GET_UNUSED_SECRET_ACCESS.totalCount),
  unlistedCount: z.number().int().describe(INSIGHTS.GET_UNUSED_SECRET_ACCESS.unlistedCount),
  trackingStartedAt: z.date().describe(INSIGHTS.GET_UNUSED_SECRET_ACCESS.trackingStartedAt),
  preliminaryUntil: z.date().describe(INSIGHTS.GET_UNUSED_SECRET_ACCESS.preliminaryUntil),
  unusedAccess: z
    .object({
      secretKey: z.string().describe(INSIGHTS.GET_UNUSED_SECRET_ACCESS.secretKey),
      environment: z.string().describe(INSIGHTS.GET_UNUSED_SECRET_ACCESS.environment),
      secretPath: z.string().describe(INSIGHTS.GET_UNUSED_SECRET_ACCESS.secretPath),
      actorType: z.enum([ActorType.USER, ActorType.IDENTITY]).describe(INSIGHTS.GET_UNUSED_SECRET_ACCESS.actorType),
      actorId: z.string().describe(INSIGHTS.GET_UNUSED_SECRET_ACCESS.actorId),
      actorName: z.string().describe(INSIGHTS.GET_UNUSED_SECRET_ACCESS.actorName)
    })
    .merge(SecretExposureCountsSchema)
    .array()
    .describe(INSIGHTS.GET_UNUSED_SECRET_ACCESS.unusedAccess)
});

export const SecretExposureListSchema = z.object({
  totalCount: z.number().int().describe(INSIGHTS.GET_SECRET_EXPOSURE.totalCount),
  bands: z.record(z.nativeEnum(SecretExposureBand), z.number().int()).describe(INSIGHTS.GET_SECRET_EXPOSURE.bands),
  trackingStartedAt: z.date().describe(INSIGHTS.GET_SECRET_EXPOSURE.trackingStartedAt),
  preliminaryUntil: z.date().describe(INSIGHTS.GET_SECRET_EXPOSURE.preliminaryUntil),
  secrets: z
    .object({
      secretKey: z.string().describe(INSIGHTS.GET_UNUSED_SECRET_ACCESS.secretKey),
      environment: z.string().describe(INSIGHTS.GET_UNUSED_SECRET_ACCESS.environment),
      secretPath: z.string().describe(INSIGHTS.GET_UNUSED_SECRET_ACCESS.secretPath),
      exposure: SecretExposureSchema
    })
    .merge(SecretExposureCountsSchema)
    .array()
    .describe(INSIGHTS.GET_SECRET_EXPOSURE.secrets)
});
