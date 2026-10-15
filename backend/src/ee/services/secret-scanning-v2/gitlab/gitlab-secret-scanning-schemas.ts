import { z } from "zod";

import { GitLabDataSourceScope } from "@app/ee/services/secret-scanning-v2/gitlab/gitlab-secret-scanning-enums";
import { SecretScanningDataSource } from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-enums";
import {
  BaseCreateSecretScanningDataSourceSchema,
  BaseSecretScanningDataSourceSchema,
  BaseSecretScanningFindingSchema,
  BaseUpdateSecretScanningDataSourceSchema,
  GitRepositoryScanFindingDetailsSchema
} from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-schemas";
import { SecretScanningDataSources } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

export const GitLabDataSourceConfigSchema = z.discriminatedUnion("scope", [
  z.object({
    scope: z.literal(GitLabDataSourceScope.Group).describe(SecretScanningDataSources.CONFIG.GITLAB.scope),
    groupId: z.number().describe(SecretScanningDataSources.CONFIG.GITLAB.groupId),
    groupName: z.string().trim().max(256).optional().describe(SecretScanningDataSources.CONFIG.GITLAB.groupName)
  }),
  z.object({
    scope: z.literal(GitLabDataSourceScope.Account).describe(SecretScanningDataSources.CONFIG.GITLAB.scope)
  }),
  z.object({
    scope: z.literal(GitLabDataSourceScope.Project).describe(SecretScanningDataSources.CONFIG.GITLAB.scope),
    projectName: z.string().trim().max(256).optional().describe(SecretScanningDataSources.CONFIG.GITLAB.projectName),
    projectId: z.number().describe(SecretScanningDataSources.CONFIG.GITLAB.projectId)
  })
]);

export const GitLabDataSourceSchema = BaseSecretScanningDataSourceSchema({
  type: SecretScanningDataSource.GitLab,
  isConnectionRequired: true
})
  .extend({
    config: GitLabDataSourceConfigSchema
  })
  .describe(
    JSON.stringify({
      title: "GitLab"
    })
  );

export const CreateGitLabDataSourceSchema = BaseCreateSecretScanningDataSourceSchema({
  type: SecretScanningDataSource.GitLab,
  isConnectionRequired: true
})
  .extend({
    config: GitLabDataSourceConfigSchema
  })
  .describe(
    JSON.stringify({
      title: "GitLab"
    })
  );

export const UpdateGitLabDataSourceSchema = BaseUpdateSecretScanningDataSourceSchema(SecretScanningDataSource.GitLab)
  .extend({
    config: GitLabDataSourceConfigSchema.optional()
  })
  .describe(
    JSON.stringify({
      title: "GitLab"
    })
  );

export const GitLabDataSourceListItemSchema = z
  .object({
    name: z.literal("GitLab"),
    connection: z.literal(AppConnection.GitLab),
    type: z.literal(SecretScanningDataSource.GitLab)
  })
  .describe(
    JSON.stringify({
      title: "GitLab"
    })
  );

export const GitLabFindingSchema = BaseSecretScanningFindingSchema.extend({
  dataSourceType: z.literal(SecretScanningDataSource.GitLab),
  details: GitRepositoryScanFindingDetailsSchema
});

// A group or project data source has one hook. GitLab has no account-level hook, so an account data source
// has one on each included project.
export const GitLabDataSourceCredentialsSchema = z.union([
  z.object({
    token: z.string(),
    hookId: z.number()
  }),
  z.object({
    token: z.string(),
    projectHooks: z.array(z.object({ projectId: z.number(), projectName: z.string(), hookId: z.number() }))
  })
]);
