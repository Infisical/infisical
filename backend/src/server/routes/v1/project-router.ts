import slugify from "@sindresorhus/slugify";
import { z } from "zod";

import {
  IntegrationsSchema,
  ProjectEnvironmentsSchema,
  ProjectMembershipsSchema,
  ProjectRolesSchema,
  ProjectSlackConfigsSchema,
  ProjectSshConfigsSchema,
  ProjectType,
  SecretFoldersSchema,
  SortDirection,
  UserEncryptionKeysSchema,
  UsersSchema
} from "@app/db/schemas";
import { ProjectMicrosoftTeamsConfigsSchema } from "@app/db/schemas/project-microsoft-teams-configs";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ApiDocsTags, PROJECTS } from "@app/lib/api-docs";
import { CharacterType, characterValidator } from "@app/lib/validator/validate-string";
import { re2Validator } from "@app/lib/zod";
import { readLimit, requestAccessLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { ActorType, AuthMode } from "@app/services/auth/auth-type";
import { validateMicrosoftTeamsChannelsSchema } from "@app/services/microsoft-teams/microsoft-teams-fns";
import { ProjectFilterType, SearchProjectSortBy } from "@app/services/project/project-types";
import { validateSlackChannelsField } from "@app/services/slack/slack-auth-validators";
import { WorkflowIntegration } from "@app/services/workflow-integration/workflow-integration-types";

import { integrationAuthPubSchema, SanitizedProjectSchema } from "../sanitizedSchemas";
import { sanitizedServiceTokenSchema } from "../v2/service-token-router";
import { slugSchema } from "@app/server/lib/schemas";

const projectWithEnv = SanitizedProjectSchema.merge(
  z.object({
    _id: z.string(),
    environments: z.object({ name: z.string(), slug: z.string(), id: z.string() }).array()
  })
);

export const registerProjectRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/:projectId/users",
    config: {
      rateLimit: readLimit
    },
    schema: {
      querystring: z.object({
        includeGroupMembers: z
          .enum(["true", "false"])
          .default("false")
          .transform((value) => value === "true"),
        roles: z
          .string()
          .trim()
          .transform(decodeURIComponent)
          .refine((value) => {
            if (!value) return true;
            const slugs = value.split(",");
            return slugs.every((slug) => slugify(slug.trim(), { lowercase: true }) === slug.trim());
          })
          .optional()
      }),
      params: z.object({
        projectId: z.string().trim()
      }),
      response: {
        200: z.object({
          users: ProjectMembershipsSchema.extend({
            isGroupMember: z.boolean(),
            user: UsersSchema.pick({
              email: true,
              username: true,
              firstName: true,
              lastName: true,
              id: true
            })
              .merge(UserEncryptionKeysSchema.pick({ publicKey: true }))
              .extend({
                isOrgMembershipActive: z.boolean()
              }),
            project: SanitizedProjectSchema.pick({ name: true, id: true }),
            roles: z.array(
              z.object({
                id: z.string(),
                role: z.string(),
                customRoleId: z.string().optional().nullable(),
                customRoleName: z.string().optional().nullable(),
                customRoleSlug: z.string().optional().nullable(),
                isTemporary: z.boolean(),
                temporaryMode: z.string().optional().nullable(),
                temporaryRange: z.string().nullable().optional(),
                temporaryAccessStartTime: z.date().nullable().optional(),
                temporaryAccessEndTime: z.date().nullable().optional()
              })
            )
          })
            .omit({ createdAt: true, updatedAt: true })
            .array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const roles = (req.query.roles?.split(",") || []).filter(Boolean);
      const users = await server.services.projectMembership.getProjectMemberships({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorAuthMethod: req.permission.authMethod,
        includeGroupMembers: req.query.includeGroupMembers,
        projectId: req.params.projectId,
        actorOrgId: req.permission.orgId,
        roles
      });

      return { users };
    }
  });

  server.route({
    method: "POST",
    url: "/",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.Projects],
      description: "Create a new project",
      security: [
        {
          bearerAuth: []
        }
      ],
      body: z.object({
        projectName: z.string().trim().describe(PROJECTS.CREATE.projectName),
        projectDescription: z.string().trim().optional().describe(PROJECTS.CREATE.projectDescription),
        slug: slugSchema({ min: 5, max: 36 }).optional().describe(PROJECTS.CREATE.slug),
        kmsKeyId: z.string().optional(),
        template: slugSchema({ field: "Template Name", max: 64 })
          .optional()
          .default(InfisicalProjectTemplate.Default)
          .describe(PROJECTS.CREATE.template),
        type: z.nativeEnum(ProjectType).default(ProjectType.SecretManager),
        shouldCreateDefaultEnvs: z.boolean().optional().default(true)
      }),
      response: {
        200: z.object({
          project: projectWithEnv
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const project = await server.services.project.createProject({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        workspaceName: req.body.projectName,
        workspaceDescription: req.body.projectDescription,
        slug: req.body.slug,
        kmsKeyId: req.body.kmsKeyId,
        template: req.body.template,
        type: req.body.type,
        createDefaultEnvs: req.body.shouldCreateDefaultEnvs
      });

      await server.services.telemetry.sendPostHogEvents({
        event: PostHogEventTypes.ProjectCreated,
        distinctId: getTelemetryDistinctId(req),
        organizationId: req.permission.orgId,
        properties: {
          orgId: project.orgId,
          name: project.name,
          ...req.auditLogInfo
        }
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: project.id,
        event: {
          type: EventType.CREATE_PROJECT,
          metadata: {
            ...req.body,
            name: req.body.projectName
          }
        }
      });

      return { project };
    }
  });

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
          projects: projectWithEnv
            .extend({
              roles: ProjectRolesSchema.array().optional()
            })
            .array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.API_KEY, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const projects = await server.services.project.getProjects({
        includeRoles: req.query.includeRoles,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        type: req.query.type
      });
      return { projects };
    }
  });

  server.route({
    method: "GET",
    url: "/:projectId",
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
        projectId: z.string().trim().describe(PROJECTS.GET.projectId)
      }),
      response: {
        200: z.object({
          project: projectWithEnv.optional()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.SERVICE_TOKEN, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const project = await server.services.project.getAProject({
        filter: {
          type: ProjectFilterType.ID,
          projectId: req.params.projectId
        },
        actorAuthMethod: req.permission.authMethod,
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId
      });
      return { project };
    }
  });

  // TODO(depri): confirm with the team
  server.route({
    method: "GET",
    url: "/slug/:slug",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.Projects],
      description: "Get project details by slug",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        slug: slugSchema({ max: 36 }).describe("The slug of the project to get.")
      }),
      response: {
        200: projectWithEnv
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const project = await server.services.project.getAProject({
        filter: {
          slug: req.params.slug,
          orgId: req.permission.orgId,
          type: ProjectFilterType.SLUG
        },
        actorId: req.permission.id,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        actor: req.permission.type
      });

      return project;
    }
  });

  server.route({
    method: "DELETE",
    url: "/:projectId",
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
        projectId: z.string().trim().describe(PROJECTS.DELETE.projectId)
      }),
      response: {
        200: z.object({
          project: SanitizedProjectSchema.optional()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const project = await server.services.project.deleteProject({
        filter: {
          type: ProjectFilterType.ID,
          projectId: req.params.projectId
        },
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: req.params.projectId,
        event: {
          type: EventType.DELETE_PROJECT,
          metadata: project
        }
      });

      return { project };
    }
  });

  /* Delete a project by slug */
  server.route({
    method: "DELETE",
    url: "/slug/:slug",
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
        slug: slugSchema({ min: 5, max: 36 }).describe("The slug of the project to delete.")
      }),
      response: {
        200: SanitizedProjectSchema
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),

    handler: async (req) => {
      const project = await server.services.project.deleteProject({
        filter: {
          type: ProjectFilterType.SLUG,
          slug: req.params.slug,
          orgId: req.permission.orgId
        },
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        actor: req.permission.type
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: project.id,
        event: {
          type: EventType.DELETE_PROJECT,
          metadata: project
        }
      });

      return project;
    }
  });

  server.route({
    method: "PATCH",
    url: "/:projectId",
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
        projectId: z.string().trim().describe(PROJECTS.UPDATE.projectId)
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
          project: SanitizedProjectSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const project = await server.services.project.updateProject({
        filter: {
          type: ProjectFilterType.ID,
          projectId: req.params.projectId
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
        projectId: req.params.projectId,
        event: {
          type: EventType.UPDATE_PROJECT,
          metadata: req.body
        }
      });

      return {
        project
      };
    }
  });

  server.route({
    method: "POST",
    url: "/:projectId/auto-capitalization",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      params: z.object({
        projectId: z.string().trim()
      }),
      body: z.object({
        autoCapitalization: z.boolean()
      }),
      response: {
        200: z.object({
          message: z.string(),
          project: SanitizedProjectSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const project = await server.services.project.toggleAutoCapitalization({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        projectId: req.params.projectId,
        autoCapitalization: req.body.autoCapitalization
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: req.params.projectId,
        event: {
          type: EventType.UPDATE_PROJECT,
          metadata: req.body
        }
      });

      return {
        message: "Successfully changed project settings",
        project
      };
    }
  });

  server.route({
    method: "POST",
    url: "/:projectId/delete-protection",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      params: z.object({
        projectId: z.string().trim()
      }),
      body: z.object({
        hasDeleteProtection: z.boolean()
      }),
      response: {
        200: z.object({
          message: z.string(),
          project: SanitizedProjectSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const project = await server.services.project.toggleDeleteProtection({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        projectId: req.params.projectId,
        hasDeleteProtection: req.body.hasDeleteProtection
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: req.params.projectId,
        event: {
          type: EventType.UPDATE_PROJECT,
          metadata: req.body
        }
      });

      return {
        message: "Successfully changed project settings",
        project
      };
    }
  });

  server.route({
    method: "PUT",
    url: "/:workspaceSlug/version-limit",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      params: z.object({
        workspaceSlug: z.string().trim()
      }),
      body: z.object({
        pitVersionLimit: z.number().min(1).max(100)
      }),
      response: {
        200: z.object({
          message: z.string(),
          project: SanitizedProjectSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const project = await server.services.project.updateVersionLimit({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        pitVersionLimit: req.body.pitVersionLimit,
        workspaceSlug: req.params.workspaceSlug
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: project.id,
        event: {
          type: EventType.UPDATE_PROJECT,
          metadata: req.body
        }
      });

      return {
        message: "Successfully changed project version limit",
        project
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
          project: SanitizedProjectSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const project = await server.services.project.updateAuditLogsRetention({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        workspaceSlug: req.params.workspaceSlug,
        auditLogsRetentionDays: req.body.auditLogsRetentionDays
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: project.id,
        event: {
          type: EventType.UPDATE_PROJECT,
          metadata: req.body
        }
      });

      return {
        message: "Successfully updated project's audit logs retention period",
        project
      };
    }
  });

  server.route({
    method: "GET",
    url: "/:projectId/integrations",
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
        projectId: z.string().trim().describe(PROJECTS.LIST_INTEGRATION.projectId)
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
        projectId: req.params.projectId
      });
      return { integrations };
    }
  });

  server.route({
    method: "GET",
    url: "/:projectId/authorizations",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.Integrations],
      description: "List integration auth objects for a project.",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        projectId: z.string().trim().describe(PROJECTS.LIST_INTEGRATION_AUTHORIZATION.projectId)
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
        projectId: req.params.projectId
      });
      return { authorizations };
    }
  });

  server.route({
    method: "GET",
    url: "/:projectId/service-token-data",
    config: {
      rateLimit: readLimit
    },
    schema: {
      params: z.object({
        projectId: z.string().trim()
      }),
      response: {
        200: z.object({
          serviceTokenData: sanitizedServiceTokenSchema.array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const serviceTokenData = await server.services.serviceToken.getProjectServiceTokens({
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        projectId: req.params.projectId
      });
      return { serviceTokenData };
    }
  });

  server.route({
    method: "GET",
    url: "/:projectId/ssh-config",
    config: {
      rateLimit: readLimit
    },
    schema: {
      params: z.object({
        projectId: z.string().trim()
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
        projectId: req.params.projectId
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
    url: "/:projectId/ssh-config",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      params: z.object({
        projectId: z.string().trim()
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
        projectId: req.params.projectId,
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
    url: "/:projectId/workflow-integration-config/:integration",
    config: {
      rateLimit: readLimit
    },
    schema: {
      params: z.object({
        projectId: z.string().trim(),
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
        projectId: req.params.projectId,
        integration: req.params.integration
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.params.projectId,
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
    url: "/:projectId/workflow-integration",
    config: {
      rateLimit: readLimit
    },
    schema: {
      params: z.object({
        projectId: z.string().trim()
      }),
      body: z.discriminatedUnion("integration", [
        z.object({
          integration: z.literal(WorkflowIntegration.SLACK),
          integrationId: z.string(),
          accessRequestChannels: validateSlackChannelsField,
          secretRequestChannels: validateSlackChannelsField,
          isAccessRequestNotificationEnabled: z.boolean(),
          isSecretRequestNotificationEnabled: z.boolean()
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
        projectId: req.params.projectId,
        ...req.body
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.params.projectId,
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
    method: "GET",
    url: "/:projectId/environment-folder-tree",
    config: {
      rateLimit: readLimit
    },
    schema: {
      params: z.object({
        projectId: z.string().trim()
      }),
      response: {
        200: z.record(
          ProjectEnvironmentsSchema.extend({ folders: SecretFoldersSchema.extend({ path: z.string() }).array() })
        )
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const environmentsFolders = await server.services.folder.getProjectEnvironmentsFolders(
        req.params.projectId,
        req.permission
      );

      return environmentsFolders;
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

  server.route({
    method: "POST",
    url: "/:projectId/project-access",
    config: {
      rateLimit: requestAccessLimit
    },
    schema: {
      params: z.object({
        projectId: z.string().trim()
      }),
      body: z.object({
        comment: z
          .string()
          .trim()
          .max(2500)
          .refine(
            (val) =>
              characterValidator([
                CharacterType.AlphaNumeric,
                CharacterType.Hyphen,
                CharacterType.Comma,
                CharacterType.Fullstop,
                CharacterType.Spaces,
                CharacterType.Exclamation
              ])(val),
            {
              message: "Invalid pattern: only alphanumeric characters, spaces, -.!, are allowed."
            }
          )
          .optional()
      }),
      response: {
        200: z.object({
          message: z.string()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      await server.services.project.requestProjectAccess({
        permission: req.permission,
        comment: req.body.comment,
        projectId: req.params.projectId
      });

      if (req.auth.actor === ActorType.USER) {
        await server.services.auditLog.createAuditLog({
          ...req.auditLogInfo,
          projectId: req.params.projectId,
          event: {
            type: EventType.PROJECT_ACCESS_REQUEST,
            metadata: {
              projectId: req.params.projectId,
              requesterEmail: req.auth.user.email || req.auth.user.username,
              requesterId: req.auth.userId
            }
          }
        });
      }

      return { message: "Project access request has been send to project admins" };
    }
  });

  /* Start upgrade of a project */
  server.route({
    method: "POST",
    url: "/:projectId/upgrade",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      params: z.object({
        projectId: z.string().trim()
      }),
      body: z.object({
        userPrivateKey: z.string().trim()
      }),
      response: {
        200: z.void()
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      await server.services.project.upgradeProject({
        actorId: req.permission.id,
        actorOrgId: req.permission.orgId,
        actor: req.permission.type,
        actorAuthMethod: req.permission.authMethod,
        projectId: req.params.projectId,
        userPrivateKey: req.body.userPrivateKey
      });
    }
  });

  /* Get upgrade status of project */
  server.route({
    url: "/:projectId/upgrade/status",
    method: "GET",
    config: {
      rateLimit: readLimit
    },
    schema: {
      params: z.object({
        projectId: z.string().trim()
      }),
      response: {
        200: z.object({
          status: z.string().nullable()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const status = await server.services.project.getProjectUpgradeStatus({
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        projectId: req.params.projectId,
        actor: req.permission.type,
        actorId: req.permission.id
      });

      return { status };
    }
  });
};
