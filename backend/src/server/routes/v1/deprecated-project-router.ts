import { z } from "zod";

import {
  IntegrationsSchema,
  ProjectRolesSchema,
  ProjectSlackConfigsSchema,
  ProjectSshConfigsSchema,
  ProjectType,
  SortDirection
} from "@app/db/schemas";
import { ProjectMicrosoftTeamsConfigsSchema } from "@app/db/schemas/project-microsoft-teams-configs";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ApiDocsTags, PROJECTS } from "@app/lib/api-docs";
import { CharacterType, characterValidator } from "@app/lib/validator/validate-string";
import { re2Validator } from "@app/lib/zod";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { validateMicrosoftTeamsChannelsSchema } from "@app/services/microsoft-teams/microsoft-teams-fns";
import { ProjectFilterType, SearchProjectSortBy } from "@app/services/project/project-types";
import { validateSlackChannelsField } from "@app/services/slack/slack-auth-validators";
import { WorkflowIntegration } from "@app/services/workflow-integration/workflow-integration-types";

import { integrationAuthPubSchema, SanitizedProjectSchema } from "../sanitizedSchemas";

const projectWithEnv = SanitizedProjectSchema.merge(
  z.object({
    _id: z.string(),
    environments: z.object({ name: z.string(), slug: z.string(), id: z.string() }).array()
  })
);

export const registerDeprecatedProjectRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/",
    config: {
      rateLimit: readLimit
    },
    schema: {
      querystring: z.object({
        includeRoles: z
          .enum(["true", "false"])
          .default("false")
          .transform((value) => value === "true"),
        type: z.nativeEnum(ProjectType).optional()
      }),
      response: {
        200: z.object({
          workspaces: projectWithEnv
            .extend({
              roles: ProjectRolesSchema.array().optional()
            })
            .array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.API_KEY, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const workspaces = await server.services.project.getProjects({
        includeRoles: req.query.includeRoles,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        type: req.query.type
      });
      return { workspaces };
    }
  });

  server.route({
    method: "GET",
    url: "/:workspaceId",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.Projects],
      description: "Get project",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        workspaceId: z.string().trim().describe(PROJECTS.GET.projectId)
      }),
      response: {
        200: z.object({
          workspace: projectWithEnv.optional()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.SERVICE_TOKEN, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const workspace = await server.services.project.getAProject({
        filter: {
          type: ProjectFilterType.ID,
          projectId: req.params.workspaceId
        },
        actorAuthMethod: req.permission.authMethod,
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId
      });
      return { workspace };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:workspaceId",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.Projects],
      description: "Delete project",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        workspaceId: z.string().trim().describe(PROJECTS.DELETE.projectId)
      }),
      response: {
        200: z.object({
          workspace: SanitizedProjectSchema.optional()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const workspace = await server.services.project.deleteProject({
        filter: {
          type: ProjectFilterType.ID,
          projectId: req.params.workspaceId
        },
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: req.params.workspaceId,
        event: {
          type: EventType.DELETE_PROJECT,
          metadata: workspace
        }
      });

      return { workspace };
    }
  });

  server.route({
    method: "PATCH",
    url: "/:workspaceId",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.Projects],
      description: "Update project",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        workspaceId: z.string().trim().describe(PROJECTS.UPDATE.projectId)
      }),
      body: z.object({
        name: z
          .string()
          .trim()
          .max(64, { message: "Name must be 64 or fewer characters" })
          .optional()
          .describe(PROJECTS.UPDATE.name),
        description: z
          .string()
          .trim()
          .max(256, { message: "Description must be 256 or fewer characters" })
          .optional()
          .describe(PROJECTS.UPDATE.projectDescription),
        autoCapitalization: z.boolean().optional().describe(PROJECTS.UPDATE.autoCapitalization),
        hasDeleteProtection: z.boolean().optional().describe(PROJECTS.UPDATE.hasDeleteProtection),
        slug: z
          .string()
          .trim()
          .max(64, { message: "Slug must be 64 characters or fewer" })
          .refine(re2Validator(/^[a-z0-9]+(?:[_-][a-z0-9]+)*$/), {
            message:
              "Project slug can only contain lowercase letters and numbers, with optional single hyphens (-) or underscores (_) between words. Cannot start or end with a hyphen or underscore."
          })
          .optional()
          .describe(PROJECTS.UPDATE.slug),
        secretSharing: z.boolean().optional().describe(PROJECTS.UPDATE.secretSharing),
        showSnapshotsLegacy: z.boolean().optional().describe(PROJECTS.UPDATE.showSnapshotsLegacy),
        defaultProduct: z.nativeEnum(ProjectType).optional().describe(PROJECTS.UPDATE.defaultProduct),
        secretDetectionIgnoreValues: z
          .array(z.string())
          .optional()
          .describe(PROJECTS.UPDATE.secretDetectionIgnoreValues)
      }),
      response: {
        200: z.object({
          workspace: SanitizedProjectSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const workspace = await server.services.project.updateProject({
        filter: {
          type: ProjectFilterType.ID,
          projectId: req.params.workspaceId
        },
        update: {
          name: req.body.name,
          description: req.body.description,
          autoCapitalization: req.body.autoCapitalization,
          defaultProduct: req.body.defaultProduct,
          hasDeleteProtection: req.body.hasDeleteProtection,
          slug: req.body.slug,
          secretSharing: req.body.secretSharing,
          showSnapshotsLegacy: req.body.showSnapshotsLegacy,
          secretDetectionIgnoreValues: req.body.secretDetectionIgnoreValues
        },
        actorAuthMethod: req.permission.authMethod,
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: req.params.workspaceId,
        event: {
          type: EventType.UPDATE_PROJECT,
          metadata: req.body
        }
      });

      return {
        workspace
      };
    }
  });

  server.route({
    method: "PUT",
    url: "/:workspaceSlug/audit-logs-retention",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      params: z.object({
        workspaceSlug: z.string().trim()
      }),
      body: z.object({
        auditLogsRetentionDays: z.number().min(0)
      }),
      response: {
        200: z.object({
          message: z.string(),
          workspace: SanitizedProjectSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const workspace = await server.services.project.updateAuditLogsRetention({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        filter: {
          type: ProjectFilterType.SLUG,
          slug: req.params.workspaceSlug,
          orgId: req.permission.orgId
        },
        auditLogsRetentionDays: req.body.auditLogsRetentionDays
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: workspace.id,
        event: {
          type: EventType.UPDATE_PROJECT,
          metadata: req.body
        }
      });

      return {
        message: "Successfully updated project's audit logs retention period",
        workspace
      };
    }
  });

  server.route({
    method: "GET",
    url: "/:workspaceId/integrations",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.Integrations],
      description: "List integrations for a project.",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        workspaceId: z.string().trim().describe(PROJECTS.LIST_INTEGRATION.projectId)
      }),
      response: {
        200: z.object({
          integrations: IntegrationsSchema.merge(
            z.object({
              environment: z.object({
                id: z.string(),
                name: z.string(),
                slug: z.string()
              })
            })
          ).array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const integrations = await server.services.integration.listIntegrationByProject({
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        projectId: req.params.workspaceId
      });
      return { integrations };
    }
  });

  server.route({
    method: "GET",
    url: "/:workspaceId/authorizations",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.Integrations],
      description: "List integration auth objects for a workspace.",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        workspaceId: z.string().trim().describe(PROJECTS.LIST_INTEGRATION_AUTHORIZATION.projectId)
      }),
      response: {
        200: z.object({
          authorizations: integrationAuthPubSchema.array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const authorizations = await server.services.integrationAuth.listIntegrationAuthByProjectId({
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        projectId: req.params.workspaceId
      });
      return { authorizations };
    }
  });

  server.route({
    method: "GET",
    url: "/:workspaceId/ssh-config",
    config: {
      rateLimit: readLimit
    },
    schema: {
      params: z.object({
        workspaceId: z.string().trim()
      }),
      response: {
        200: ProjectSshConfigsSchema.pick({
          id: true,
          createdAt: true,
          updatedAt: true,
          projectId: true,
          defaultUserSshCaId: true,
          defaultHostSshCaId: true
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const sshConfig = await server.services.project.getProjectSshConfig({
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        projectId: req.params.workspaceId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: sshConfig.projectId,
        event: {
          type: EventType.GET_PROJECT_SSH_CONFIG,
          metadata: {
            id: sshConfig.id,
            projectId: sshConfig.projectId
          }
        }
      });

      return sshConfig;
    }
  });

  server.route({
    method: "PATCH",
    url: "/:workspaceId/ssh-config",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      params: z.object({
        workspaceId: z.string().trim()
      }),
      body: z.object({
        defaultUserSshCaId: z.string().optional(),
        defaultHostSshCaId: z.string().optional()
      }),
      response: {
        200: ProjectSshConfigsSchema.pick({
          id: true,
          createdAt: true,
          updatedAt: true,
          projectId: true,
          defaultUserSshCaId: true,
          defaultHostSshCaId: true
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const sshConfig = await server.services.project.updateProjectSshConfig({
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        projectId: req.params.workspaceId,
        ...req.body
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: sshConfig.projectId,
        event: {
          type: EventType.UPDATE_PROJECT_SSH_CONFIG,
          metadata: {
            id: sshConfig.id,
            projectId: sshConfig.projectId,
            defaultUserSshCaId: sshConfig.defaultUserSshCaId,
            defaultHostSshCaId: sshConfig.defaultHostSshCaId
          }
        }
      });

      return sshConfig;
    }
  });

  server.route({
    method: "GET",
    url: "/:workspaceId/workflow-integration-config/:integration",
    config: {
      rateLimit: readLimit
    },
    schema: {
      params: z.object({
        workspaceId: z.string().trim(),
        integration: z.nativeEnum(WorkflowIntegration)
      }),
      response: {
        200: z.discriminatedUnion("integration", [
          ProjectSlackConfigsSchema.pick({
            id: true,
            isAccessRequestNotificationEnabled: true,
            accessRequestChannels: true,
            isSecretRequestNotificationEnabled: true,
            secretRequestChannels: true
          }).merge(
            z.object({
              integration: z.literal(WorkflowIntegration.SLACK),
              integrationId: z.string()
            })
          ),
          ProjectMicrosoftTeamsConfigsSchema.pick({
            id: true,
            isAccessRequestNotificationEnabled: true,
            accessRequestChannels: true,
            isSecretRequestNotificationEnabled: true,
            secretRequestChannels: true
          }).merge(
            z.object({
              integration: z.literal(WorkflowIntegration.MICROSOFT_TEAMS),
              integrationId: z.string()
            })
          )
        ])
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const config = await server.services.project.getProjectWorkflowIntegrationConfig({
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        projectId: req.params.workspaceId,
        integration: req.params.integration
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.params.workspaceId,
        event: {
          type: EventType.GET_PROJECT_WORKFLOW_INTEGRATION_CONFIG,
          metadata: {
            id: config.id,
            integration: config.integration
          }
        }
      });

      return config;
    }
  });

  server.route({
    method: "DELETE",
    url: "/:projectId/workflow-integration/:integration/:integrationId",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      params: z.object({
        projectId: z.string().trim(),
        integration: z.nativeEnum(WorkflowIntegration),
        integrationId: z.string()
      }),
      response: {
        200: z.object({
          integrationConfig: z.object({
            id: z.string()
          })
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const deletedIntegration = await server.services.project.deleteProjectWorkflowIntegration({
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        projectId: req.params.projectId,
        integration: req.params.integration,
        integrationId: req.params.integrationId
      });

      return {
        integrationConfig: deletedIntegration
      };
    }
  });

  server.route({
    method: "PUT",
    url: "/:workspaceId/workflow-integration",
    config: {
      rateLimit: readLimit
    },
    schema: {
      params: z.object({
        workspaceId: z.string().trim()
      }),

      body: z.discriminatedUnion("integration", [
        z.object({
          integration: z.literal(WorkflowIntegration.SLACK),
          integrationId: z.string(),
          accessRequestChannels: validateSlackChannelsField,
          secretRequestChannels: validateSlackChannelsField,
          secretSyncErrorChannels: validateSlackChannelsField,
          isAccessRequestNotificationEnabled: z.boolean(),
          isSecretRequestNotificationEnabled: z.boolean(),
          isSecretSyncErrorNotificationEnabled: z.boolean()
        }),
        z.object({
          integration: z.literal(WorkflowIntegration.MICROSOFT_TEAMS),
          integrationId: z.string(),
          accessRequestChannels: validateMicrosoftTeamsChannelsSchema,
          secretRequestChannels: validateMicrosoftTeamsChannelsSchema,
          isAccessRequestNotificationEnabled: z.boolean(),
          isSecretRequestNotificationEnabled: z.boolean()
        })
      ]),
      response: {
        200: z.discriminatedUnion("integration", [
          ProjectSlackConfigsSchema.pick({
            id: true,
            isAccessRequestNotificationEnabled: true,
            accessRequestChannels: true,
            isSecretRequestNotificationEnabled: true,
            secretRequestChannels: true,
            isSecretSyncErrorNotificationEnabled: true,
            secretSyncErrorChannels: true
          }).merge(
            z.object({
              integration: z.literal(WorkflowIntegration.SLACK),
              integrationId: z.string()
            })
          ),
          ProjectMicrosoftTeamsConfigsSchema.pick({
            id: true,
            isAccessRequestNotificationEnabled: true,
            isSecretRequestNotificationEnabled: true
          }).merge(
            z.object({
              integration: z.literal(WorkflowIntegration.MICROSOFT_TEAMS),
              integrationId: z.string(),
              accessRequestChannels: validateMicrosoftTeamsChannelsSchema,
              secretRequestChannels: validateMicrosoftTeamsChannelsSchema
            })
          )
        ])
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const workflowIntegrationConfig = await server.services.project.updateProjectWorkflowIntegration({
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        projectId: req.params.workspaceId,
        ...req.body
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.params.workspaceId,
        event: {
          type: EventType.UPDATE_PROJECT_WORKFLOW_INTEGRATION_CONFIG,
          metadata: {
            id: workflowIntegrationConfig.id,
            integrationId: workflowIntegrationConfig.integrationId,
            integration: workflowIntegrationConfig.integration,
            isAccessRequestNotificationEnabled: workflowIntegrationConfig.isAccessRequestNotificationEnabled,
            accessRequestChannels: workflowIntegrationConfig.accessRequestChannels,
            isSecretRequestNotificationEnabled: workflowIntegrationConfig.isSecretRequestNotificationEnabled,
            secretRequestChannels: workflowIntegrationConfig.secretRequestChannels
          }
        }
      });

      return workflowIntegrationConfig;
    }
  });

  server.route({
    method: "POST",
    url: "/search",
    config: {
      rateLimit: readLimit
    },
    schema: {
      body: z.object({
        limit: z.number().default(100),
        offset: z.number().default(0),
        type: z.nativeEnum(ProjectType).optional(),
        orderBy: z.nativeEnum(SearchProjectSortBy).optional().default(SearchProjectSortBy.NAME),
        orderDirection: z.nativeEnum(SortDirection).optional().default(SortDirection.ASC),
        name: z
          .string()
          .trim()
          .refine((val) => characterValidator([CharacterType.AlphaNumeric, CharacterType.Hyphen])(val), {
            message: "Invalid pattern: only alphanumeric characters, - are allowed."
          })
          .optional()
      }),
      response: {
        200: z.object({
          projects: SanitizedProjectSchema.extend({ isMember: z.boolean() }).array(),
          totalCount: z.number()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { docs: projects, totalCount } = await server.services.project.searchProjects({
        permission: req.permission,
        ...req.body
      });

      return { projects, totalCount };
    }
  });
};
