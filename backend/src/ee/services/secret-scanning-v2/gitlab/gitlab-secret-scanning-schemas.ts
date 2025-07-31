import { z } from "zod";

import { GitLabDataSourceScope } from "@app/ee/services/secret-scanning-v2/gitlab/gitlab-secret-scanning-enums";
import {
  SecretScanningDataSource,
  SecretScanningResource
} from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-enums";
import {
  BaseCreateSecretScanningDataSourceSchema,
  BaseSecretScanningDataSourceSchema,
  BaseSecretScanningFindingSchema,
  BaseUpdateSecretScanningDataSourceSchema,
  GitRepositoryScanFindingDetailsSchema
} from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-schemas";
import { SecretScanningDataSources } from "@app/lib/api-docs";
import { GitLabProjectRegex } from "@app/lib/regex";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

export const GitLabDataSourceConfigSchema = z.discriminatedUnion("scope", [
  z.object({
    scope: z.literal(GitLabDataSourceScope.Group).describe(SecretScanningDataSources.CONFIG.GITLAB.scope),
    groupId: z.number().describe(SecretScanningDataSources.CONFIG.GITLAB.groupId),
    groupName: z.string().trim().max(256).optional().describe(SecretScanningDataSources.CONFIG.GITLAB.groupName),
    includeProjects: z
      .array(
        z
          .string()
          .min(1)
          .max(256)
          .refine((value) => value === "*" || GitLabProjectRegex.test(value), "Invalid project name format")
      )
      .nonempty("One or more projects required")
      .max(100, "Cannot configure more than 100 projects")
      .default(["*"])
      .describe(SecretScanningDataSources.CONFIG.GITLAB.includeProjects)
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
  resourceType: z.literal(SecretScanningResource.Project),
  dataSourceType: z.literal(SecretScanningDataSource.GitLab),
  details: GitRepositoryScanFindingDetailsSchema
});

export const GitLabDataSourceCredentialsSchema = z.object({
  token: z.string(),
  hookId: z.number()
});
