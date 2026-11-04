import { z } from "zod";

import { IdentityAuthMethod, SecretFolderRole } from "@app/db/schemas";
import {
  SecretReadNotJudgedReason,
  SecretReadStatus
} from "@app/ee/services/secret-read-activity/secret-read-activity-types";
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

const UnusedAccessRoleSchema = z.object({
  id: z.string().nullable().describe(INSIGHTS.GET_UNUSED_ACCESS.roleId),
  slug: z.string().describe(INSIGHTS.GET_UNUSED_ACCESS.roleSlug),
  name: z.string().describe(INSIGHTS.GET_UNUSED_ACCESS.roleName)
});

const UnusedAccessActorRowSchema = z.object({
  actorType: z.enum([ActorType.USER, ActorType.IDENTITY]).describe(INSIGHTS.GET_UNUSED_ACCESS.actorType),
  actorId: z.string().describe(INSIGHTS.GET_UNUSED_ACCESS.actorId),
  name: z.string().describe(INSIGHTS.GET_UNUSED_ACCESS.name),
  accessibleSecretCount: z.number().int().describe(INSIGHTS.GET_UNUSED_ACCESS.accessibleSecretCount),
  unusedSecretCount: z.number().int().describe(INSIGHTS.GET_UNUSED_ACCESS.unusedSecretCount),
  environments: z.string().array().describe(INSIGHTS.GET_UNUSED_ACCESS.environments),
  accessPaths: z
    .object({
      roles: UnusedAccessRoleSchema.array().describe(INSIGHTS.GET_UNUSED_ACCESS.roles),
      groups: z
        .object({
          id: z.string().describe(INSIGHTS.GET_UNUSED_ACCESS.groupId),
          name: z.string().describe(INSIGHTS.GET_UNUSED_ACCESS.groupName),
          roles: UnusedAccessRoleSchema.array().describe(INSIGHTS.GET_UNUSED_ACCESS.groupRoles)
        })
        .array()
        .describe(INSIGHTS.GET_UNUSED_ACCESS.groups),
      additionalPrivileges: z
        .object({
          id: z.string().describe(INSIGHTS.GET_UNUSED_ACCESS.additionalPrivilegeId),
          name: z.string().describe(INSIGHTS.GET_UNUSED_ACCESS.additionalPrivilegeName)
        })
        .array()
        .describe(INSIGHTS.GET_UNUSED_ACCESS.additionalPrivileges),
      folderAccess: z
        .object({
          id: z.string().describe(INSIGHTS.GET_UNUSED_ACCESS.folderAccessId),
          folderId: z.string().describe(INSIGHTS.GET_UNUSED_ACCESS.folderId),
          environment: z.string().describe(INSIGHTS.GET_UNUSED_ACCESS.folderEnvironment),
          secretPath: z.string().describe(INSIGHTS.GET_UNUSED_ACCESS.folderSecretPath),
          role: z.nativeEnum(SecretFolderRole).describe(INSIGHTS.GET_UNUSED_ACCESS.folderRole)
        })
        .array()
        .describe(INSIGHTS.GET_UNUSED_ACCESS.folderAccess)
    })
    .describe(INSIGHTS.GET_UNUSED_ACCESS.accessPaths)
});

export const UnusedAccessSchema = z.object({
  totalCount: z.number().int().describe(INSIGHTS.GET_UNUSED_ACCESS.totalCount),
  unusedAccessFrom: z.date().describe(INSIGHTS.GET_UNUSED_ACCESS.unusedAccessFrom),
  actors: UnusedAccessActorRowSchema.array().describe(INSIGHTS.GET_UNUSED_ACCESS.actors)
});

export const UnusedAccessActorSchema = z.object({
  actor: UnusedAccessActorRowSchema,
  unusedAccessFrom: z.date().describe(INSIGHTS.GET_UNUSED_ACCESS.unusedAccessFrom),
  secrets: z
    .object({
      secretKey: z.string().describe(INSIGHTS.GET_UNUSED_ACCESS_ACTOR.secretKey),
      environment: z.string().describe(INSIGHTS.GET_UNUSED_ACCESS_ACTOR.environment),
      secretPath: z.string().describe(INSIGHTS.GET_UNUSED_ACCESS_ACTOR.secretPath)
    })
    .array()
    .describe(INSIGHTS.GET_UNUSED_ACCESS_ACTOR.secrets)
});

export const SecretReadActivitySchema = z.object({
  readsTrackedSince: z.date().describe(INSIGHTS.GET_SECRET_READ_ACTIVITY.readsTrackedSince),
  unusedAccessFrom: z.date().describe(INSIGHTS.GET_SECRET_READ_ACTIVITY.unusedAccessFrom),
  actors: z
    .object({
      actorType: z.enum([ActorType.USER, ActorType.IDENTITY]).describe(INSIGHTS.GET_SECRET_READ_ACTIVITY.actorType),
      actorId: z.string().describe(INSIGHTS.GET_SECRET_READ_ACTIVITY.actorId),
      name: z.string().describe(INSIGHTS.GET_SECRET_READ_ACTIVITY.name),
      isProjectAdmin: z.boolean().describe(INSIGHTS.GET_SECRET_READ_ACTIVITY.isProjectAdmin),
      lastReadAt: z.date().nullable().describe(INSIGHTS.GET_SECRET_READ_ACTIVITY.lastReadAt),
      accessSince: z.date().describe(INSIGHTS.GET_SECRET_READ_ACTIVITY.accessSince),
      readStatus: z.nativeEnum(SecretReadStatus).describe(INSIGHTS.GET_SECRET_READ_ACTIVITY.readStatus),
      notJudgedReason: z
        .nativeEnum(SecretReadNotJudgedReason)
        .nullable()
        .describe(INSIGHTS.GET_SECRET_READ_ACTIVITY.notJudgedReason)
    })
    .array()
    .describe(INSIGHTS.GET_SECRET_READ_ACTIVITY.actors)
});
