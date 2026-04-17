import slugify from "@sindresorhus/slugify";
import { z } from "zod";

import {
  CertificatesSchema,
  IntegrationsSchema,
  PkiAlertsSchema,
  PkiCollectionsSchema,
  ProjectEnvironmentsSchema,
  ProjectMembershipsSchema,
  ProjectRolesSchema,
  ProjectSlackConfigsSchema,
  ProjectSshConfigsSchema,
  ProjectType,
  SecretFoldersSchema,
  SortDirection
} from "@app/db/schemas";
import { ProjectMicrosoftTeamsConfigsSchema } from "@app/db/schemas/project-microsoft-teams-configs";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { InfisicalProjectTemplate } from "@app/ee/services/project-template/project-template-types";
import { sanitizedSshCa } from "@app/ee/services/ssh/ssh-certificate-authority-schema";
import { sanitizedSshCertificate } from "@app/ee/services/ssh-certificate/ssh-certificate-schema";
import { sanitizedSshCertificateTemplate } from "@app/ee/services/ssh-certificate-template/ssh-certificate-template-schema";
import { loginMappingSchema, sanitizedSshHost } from "@app/ee/services/ssh-host/ssh-host-schema";
import { LoginMappingSource } from "@app/ee/services/ssh-host/ssh-host-types";
import { sanitizedSshHostGroup } from "@app/ee/services/ssh-host-group/ssh-host-group-schema";
import { ApiDocsTags, PROJECTS } from "@app/lib/api-docs";
import { CharacterType, characterValidator } from "@app/lib/validator/validate-string";
import { re2Validator } from "@app/lib/zod";
import { projectCreationLimit, readLimit, requestAccessLimit, writeLimit } from "@app/server/config/rateLimiter";
import { slugSchema } from "@app/server/lib/schemas";
import { getTelemetryDistinctId } from "@app/server/lib/telemetry";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { ActorType, AuthMode } from "@app/services/auth/auth-type";
import { CaStatus } from "@app/services/certificate-authority/certificate-authority-enums";
import { sanitizedCertificateTemplate } from "@app/services/certificate-template/certificate-template-schema";
import { validateMicrosoftTeamsChannelsSchema } from "@app/services/microsoft-teams/microsoft-teams-fns";
import { sanitizedPkiSubscriber } from "@app/services/pki-subscriber/pki-subscriber-schema";
import { ProjectFilterType, SearchProjectSortBy } from "@app/services/project/project-types";
import { validateSlackChannelsField } from "@app/services/slack/slack-auth-validators";
import { PostHogEventTypes } from "@app/services/telemetry/telemetry-types";
import { WorkflowIntegration } from "@app/services/workflow-integration/workflow-integration-types";

import {
  integrationAuthPubSchema,
  InternalCertificateAuthorityResponseSchema,
  SanitizedProjectSchema,
  SanitizedUserSchema
} from "../sanitizedSchemas";
import { sanitizedServiceTokenSchema } from "../v2/service-token-router";

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
      operationId: "listProjectUsers",
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
            user: SanitizedUserSchema.pick({
              email: true,
              username: true,
              firstName: true,
              lastName: true,
              id: true
            }).extend({
              publicKey: z.string().optional().nullable(),
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
      rateLimit: projectCreationLimit
    },
    schema: {
      hide: false,
      operationId: "createProject",
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
        shouldCreateDefaultEnvs: z.boolean().optional().default(true),
        hasDeleteProtection: z.boolean().optional().default(false)
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
        projectName: req.body.projectName,
        projectDescription: req.body.projectDescription,
        slug: req.body.slug,
        kmsKeyId: req.body.kmsKeyId,
        template: req.body.template,
        type: req.body.type,
        createDefaultEnvs: req.body.shouldCreateDefaultEnvs,
        hasDeleteProtection: req.body.hasDeleteProtection
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
      hide: false,
      operationId: "listProjects",
      tags: [ApiDocsTags.Projects],
      description: "List projects",
      security: [
        {
          bearerAuth: []
        }
      ],
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
      operationId: "getProjectById",
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

  server.route({
    method: "GET",
    url: "/slug/:slug",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      operationId: "getProjectBySlug",
      tags: [ApiDocsTags.Projects],
      description: "Get project details by slug",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        slug: slugSchema({ max: 64 }).describe("The slug of the project to get.")
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
      operationId: "deleteProject",
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

  server.route({
    method: "PATCH",
    url: "/:projectId",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      operationId: "updateProject",
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
        enforceEncryptedSecretManagerSecretMetadata: z
          .boolean()
          .optional()
          .describe(PROJECTS.UPDATE.enforceEncryptedSecretManagerSecretMetadata),
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
        secretDetectionIgnoreValues: z
          .array(z.string())
          .optional()
          .describe(PROJECTS.UPDATE.secretDetectionIgnoreValues),
        pitVersionLimit: z.number().min(1).max(100).optional()
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
          hasDeleteProtection: req.body.hasDeleteProtection,
          slug: req.body.slug,
          secretSharing: req.body.secretSharing,
          showSnapshotsLegacy: req.body.showSnapshotsLegacy,
          secretDetectionIgnoreValues: req.body.secretDetectionIgnoreValues,
          pitVersionLimit: req.body.pitVersionLimit,
          enforceEncryptedSecretManagerSecretMetadata: req.body.enforceEncryptedSecretManagerSecretMetadata
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
    method: "PUT",
    url: "/:projectId/audit-logs-retention",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      operationId: "updateProjectAuditLogsRetention",
      params: z.object({
        projectId: z.string().trim()
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
        auditLogsRetentionDays: req.body.auditLogsRetentionDays,
        filter: {
          projectId: req.params.projectId,
          type: ProjectFilterType.ID
        }
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
      operationId: "listProjectIntegrations",
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
      operationId: "listProjectIntegrationAuthorizations",
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
      operationId: "listProjectServiceTokens",
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
      operationId: "getProjectSshConfig",
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
      operationId: "updateProjectSshConfig",
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
      operationId: "getProjectWorkflowIntegrationConfig",
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
      operationId: "deleteProjectWorkflowIntegration",
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
      operationId: "updateProjectWorkflowIntegration",
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
          isSecretRequestNotificationEnabled: z.boolean(),
          secretSyncErrorChannels: validateSlackChannelsField,
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
      operationId: "getProjectEnvironmentFolderTree",
      params: z.object({
        projectId: z.string().trim()
      }),
      response: {
        200: z.record(
          ProjectEnvironmentsSchema.extend({ folders: SecretFoldersSchema.extend({ path: z.string() }).array() })
        )
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
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
      operationId: "searchProjects",
      body: z.object({
        limit: z.number().default(100),
        offset: z.number().default(0),
        type: z.nativeEnum(ProjectType).optional(),
        orderBy: z.nativeEnum(SearchProjectSortBy).optional().default(SearchProjectSortBy.NAME),
        orderDirection: z.nativeEnum(SortDirection).optional().default(SortDirection.ASC),
        projectIds: z.string().trim().array().optional(),
        name: z.string().trim().min(1).max(256).optional()
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
      operationId: "requestProjectAccess",
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
      operationId: "upgradeProject",
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
      operationId: "getProjectUpgradeStatus",
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

  server.route({
    method: "GET",
    url: "/:projectId/cas",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      operationId: "listProjectCertificateAuthorities",
      tags: [ApiDocsTags.PkiCertificateAuthorities],
      params: z.object({
        projectId: z.string().trim()
      }),
      querystring: z.object({
        status: z.enum([CaStatus.ACTIVE, CaStatus.PENDING_CERTIFICATE]).optional().describe(PROJECTS.LIST_CAS.status),
        friendlyName: z.string().optional().describe(PROJECTS.LIST_CAS.friendlyName),
        commonName: z.string().optional().describe(PROJECTS.LIST_CAS.commonName),
        offset: z.coerce.number().min(0).max(100).default(0).describe(PROJECTS.LIST_CAS.offset),
        limit: z.coerce.number().min(1).max(100).default(25).describe(PROJECTS.LIST_CAS.limit)
      }),
      response: {
        200: z.object({
          cas: z.array(InternalCertificateAuthorityResponseSchema)
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const cas = await server.services.project.listProjectCas({
        filter: {
          projectId: req.params.projectId,
          type: ProjectFilterType.ID
        },
        actorId: req.permission.id,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        actor: req.permission.type,
        ...req.query
      });
      return { cas };
    }
  });

  server.route({
    method: "GET",
    url: "/:projectId/certificates",
    config: {
      rateLimit: readLimit
    },
    schema: {
      deprecated: true,
      description: "Deprecated: Use POST /:projectId/certificates/search instead.",
      hide: true,
      operationId: "listProjectCertificates",
      tags: [ApiDocsTags.PkiCertificates],
      params: z.object({
        projectId: z.string().trim()
      }),
      querystring: z.object({
        friendlyName: z.string().optional().describe(PROJECTS.LIST_CERTIFICATES.friendlyName),
        commonName: z.string().optional().describe(PROJECTS.LIST_CERTIFICATES.commonName),
        offset: z.coerce.number().min(0).default(0).describe(PROJECTS.LIST_CERTIFICATES.offset),
        limit: z.coerce.number().min(1).max(100).default(25).describe(PROJECTS.LIST_CERTIFICATES.limit),
        forPkiSync: z.coerce
          .boolean()
          .default(false)
          .optional()
          .describe("Retrieve only certificates available for PKI sync"),
        search: z.string().trim().optional().describe("Search by SAN, CN, certificate ID, or serial number"),
        status: z.string().optional().describe("Filter by certificate status"),
        profileIds: z
          .union([z.string().uuid(), z.array(z.string().uuid())])
          .transform((val) => (Array.isArray(val) ? val : [val]))
          .optional()
          .describe("Filter by profile IDs"),
        fromDate: z.coerce.date().optional().describe("Filter certificates created from this date"),
        toDate: z.coerce.date().optional().describe("Filter certificates created until this date")
      }),
      response: {
        200: z.object({
          certificates: z.array(CertificatesSchema.extend({ hasPrivateKey: z.boolean() })),
          totalCount: z.number()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { certificates, totalCount } = await server.services.project.listProjectCertificates({
        filter: {
          projectId: req.params.projectId,
          type: ProjectFilterType.ID
        },
        actorId: req.permission.id,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        actor: req.permission.type,
        ...req.query
      });
      return { certificates, totalCount };
    }
  });

  server.route({
    method: "POST",
    url: "/:projectId/certificates/search",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      operationId: "searchProjectCertificates",
      tags: [ApiDocsTags.PkiCertificates],
      description: "Search and filter certificates within a project.",
      params: z.object({
        projectId: z.string().trim()
      }),
      body: z.object({
        friendlyName: z.string().optional().describe(PROJECTS.SEARCH_CERTIFICATES.friendlyName),
        commonName: z.string().optional().describe(PROJECTS.SEARCH_CERTIFICATES.commonName),
        offset: z.number().min(0).default(0).describe(PROJECTS.SEARCH_CERTIFICATES.offset),
        limit: z.number().min(1).max(100).default(25).describe(PROJECTS.SEARCH_CERTIFICATES.limit),
        forPkiSync: z.boolean().default(false).optional().describe(PROJECTS.SEARCH_CERTIFICATES.forPkiSync),
        search: z.string().trim().optional().describe(PROJECTS.SEARCH_CERTIFICATES.search),
        status: z.string().optional().describe(PROJECTS.SEARCH_CERTIFICATES.status),
        profileIds: z.array(z.string().uuid()).optional().describe(PROJECTS.SEARCH_CERTIFICATES.profileIds),
        fromDate: z.coerce.date().optional().describe(PROJECTS.SEARCH_CERTIFICATES.fromDate),
        toDate: z.coerce.date().optional().describe(PROJECTS.SEARCH_CERTIFICATES.toDate),
        metadata: z
          .array(
            z.object({
              key: z.string().trim().min(1).max(255),
              value: z.string().trim().max(1020).optional()
            })
          )
          .optional()
          .describe(PROJECTS.SEARCH_CERTIFICATES.metadata),
        extendedKeyUsage: z.string().trim().optional().describe(PROJECTS.SEARCH_CERTIFICATES.extendedKeyUsage),
        keyAlgorithm: z
          .union([z.string().trim(), z.array(z.string().trim())])
          .optional()
          .describe(PROJECTS.SEARCH_CERTIFICATES.keyAlgorithm),
        signatureAlgorithm: z.string().trim().optional().describe(PROJECTS.SEARCH_CERTIFICATES.signatureAlgorithm),
        keySizes: z.array(z.number()).optional().describe(PROJECTS.SEARCH_CERTIFICATES.keySizes),
        caIds: z.array(z.string().uuid()).optional().describe(PROJECTS.SEARCH_CERTIFICATES.caIds),
        enrollmentTypes: z.array(z.string().trim()).optional().describe(PROJECTS.SEARCH_CERTIFICATES.enrollmentTypes),
        source: z
          .union([z.string().trim(), z.array(z.string().trim())])
          .optional()
          .describe(PROJECTS.SEARCH_CERTIFICATES.source),
        notAfterFrom: z.coerce.date().optional().describe(PROJECTS.SEARCH_CERTIFICATES.notAfterFrom),
        notAfterTo: z.coerce.date().optional().describe(PROJECTS.SEARCH_CERTIFICATES.notAfterTo),
        notBeforeFrom: z.coerce.date().optional().describe(PROJECTS.SEARCH_CERTIFICATES.notBeforeFrom),
        notBeforeTo: z.coerce.date().optional().describe(PROJECTS.SEARCH_CERTIFICATES.notBeforeTo),
        sortBy: z
          .enum(["notAfter", "notBefore", "createdAt", "commonName", "keyAlgorithm", "status"])
          .optional()
          .describe(PROJECTS.SEARCH_CERTIFICATES.sortBy),
        sortOrder: z.enum(["asc", "desc"]).optional().describe(PROJECTS.SEARCH_CERTIFICATES.sortOrder)
      }),
      response: {
        200: z.object({
          certificates: z.array(
            CertificatesSchema.extend({
              hasPrivateKey: z.boolean(),
              caName: z.string().nullable().optional(),
              profileName: z.string().nullable().optional(),
              enrollmentType: z.string().nullable().optional()
            })
          ),
          totalCount: z.number()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { metadata, sortBy, sortOrder, ...filters } = req.body;
      const { certificates, totalCount } = await server.services.project.listProjectCertificates({
        filter: {
          projectId: req.params.projectId,
          type: ProjectFilterType.ID
        },
        actorId: req.permission.id,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        actor: req.permission.type,
        ...filters,
        metadataFilter: metadata,
        sortBy,
        sortOrder
      });
      return { certificates, totalCount };
    }
  });

  server.route({
    method: "GET",
    url: "/:projectId/certificates/dashboard-stats",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: true,
      operationId: "getCertificateDashboardStats",
      tags: [ApiDocsTags.PkiCertificates],
      description: "Get aggregated dashboard statistics for certificates in a project.",
      params: z.object({
        projectId: z.string().trim()
      }),
      response: {
        200: z.object({
          totals: z.object({
            total: z.number(),
            active: z.number(),
            expiringSoon: z.number(),
            expired: z.number(),
            revoked: z.number()
          }),
          expiringSoonNoAutoRenewal: z.number(),
          expiredNotRenewed: z.number(),
          distributions: z.object({
            byEnrollmentMethod: z.array(z.object({ label: z.string(), count: z.number() })),
            byAlgorithm: z.array(z.object({ label: z.string(), count: z.number() })),
            byCA: z.array(z.object({ id: z.string(), label: z.string(), count: z.number() })),
            byStatus: z.array(z.object({ label: z.string(), count: z.number() }))
          }),
          expirationBuckets: z.array(z.object({ bucket: z.string(), count: z.number() })),
          validityBuckets: z.array(z.object({ bucket: z.string(), count: z.number() }))
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      return server.services.project.getDashboardStats({
        filter: {
          projectId: req.params.projectId,
          type: ProjectFilterType.ID
        },
        actorId: req.permission.id,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        actor: req.permission.type
      });
    }
  });

  server.route({
    method: "GET",
    url: "/:projectId/certificates/activity-trend",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: true,
      operationId: "getCertificateActivityTrend",
      tags: [ApiDocsTags.PkiCertificates],
      description: "Get certificate lifecycle activity trend over time.",
      params: z.object({
        projectId: z.string().trim()
      }),
      querystring: z.object({
        range: z.enum(["7d", "30d", "6m"]).optional().default("30d")
      }),
      response: {
        200: z.object({
          periods: z.array(
            z.object({
              period: z.string(),
              issued: z.number(),
              expired: z.number(),
              revoked: z.number(),
              renewed: z.number()
            })
          )
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      return server.services.project.getActivityTrend({
        filter: {
          projectId: req.params.projectId,
          type: ProjectFilterType.ID
        },
        range: req.query.range,
        actorId: req.permission.id,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        actor: req.permission.type
      });
    }
  });

  server.route({
    method: "GET",
    url: "/:projectId/pki-alerts",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      operationId: "listProjectPkiAlerts",
      tags: [ApiDocsTags.PkiAlerting],
      params: z.object({
        projectId: z.string().trim()
      }),
      response: {
        200: z.object({
          alerts: z.array(PkiAlertsSchema)
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { alerts } = await server.services.project.listProjectAlerts({
        projectId: req.params.projectId,
        actorId: req.permission.id,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        actor: req.permission.type
      });

      return { alerts };
    }
  });

  server.route({
    method: "GET",
    url: "/:projectId/pki-collections",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      operationId: "listProjectPkiCollections",
      tags: [ApiDocsTags.PkiCertificateCollections],
      params: z.object({
        projectId: z.string().trim()
      }),
      response: {
        200: z.object({
          collections: z.array(PkiCollectionsSchema)
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { pkiCollections } = await server.services.project.listProjectPkiCollections({
        projectId: req.params.projectId,
        actorId: req.permission.id,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        actor: req.permission.type
      });

      return { collections: pkiCollections };
    }
  });

  server.route({
    method: "GET",
    url: "/:projectId/pki-subscribers",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      operationId: "listProjectPkiSubscribers",
      tags: [ApiDocsTags.PkiSubscribers],
      params: z.object({
        projectId: z.string().trim().describe(PROJECTS.LIST_PKI_SUBSCRIBERS.projectId)
      }),
      response: {
        200: z.object({
          subscribers: z.array(sanitizedPkiSubscriber)
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const subscribers = await server.services.project.listProjectPkiSubscribers({
        actorId: req.permission.id,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        actor: req.permission.type,
        projectId: req.params.projectId
      });

      return { subscribers };
    }
  });

  server.route({
    method: "GET",
    url: "/:projectId/certificate-templates",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      operationId: "listProjectCertificateTemplates",
      tags: [ApiDocsTags.PkiCertificateTemplates],
      params: z.object({
        projectId: z.string().trim()
      }),
      response: {
        200: z.object({
          certificateTemplates: sanitizedCertificateTemplate.array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { certificateTemplates } = await server.services.project.listProjectCertificateTemplates({
        projectId: req.params.projectId,
        actorId: req.permission.id,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        actor: req.permission.type
      });

      return { certificateTemplates };
    }
  });

  server.route({
    method: "GET",
    url: "/:projectId/ssh-certificates",
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listProjectSshCertificates",
      params: z.object({
        projectId: z.string().trim().describe(PROJECTS.LIST_SSH_CAS.projectId)
      }),
      querystring: z.object({
        offset: z.coerce.number().default(0).describe(PROJECTS.LIST_SSH_CERTIFICATES.offset),
        limit: z.coerce.number().default(25).describe(PROJECTS.LIST_SSH_CERTIFICATES.limit)
      }),
      response: {
        200: z.object({
          certificates: z.array(sanitizedSshCertificate),
          totalCount: z.number()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { certificates, totalCount } = await server.services.project.listProjectSshCertificates({
        actorId: req.permission.id,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        actor: req.permission.type,
        projectId: req.params.projectId,
        offset: req.query.offset,
        limit: req.query.limit
      });

      return { certificates, totalCount };
    }
  });

  server.route({
    method: "GET",
    url: "/:projectId/ssh-certificate-templates",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      operationId: "listProjectSshCertificateTemplates",
      tags: [ApiDocsTags.SshCertificateTemplates],
      params: z.object({
        projectId: z.string().trim().describe(PROJECTS.LIST_SSH_CERTIFICATE_TEMPLATES.projectId)
      }),
      response: {
        200: z.object({
          certificateTemplates: z.array(sanitizedSshCertificateTemplate)
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { certificateTemplates } = await server.services.project.listProjectSshCertificateTemplates({
        actorId: req.permission.id,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        actor: req.permission.type,
        projectId: req.params.projectId
      });

      return { certificateTemplates };
    }
  });

  server.route({
    method: "GET",
    url: "/:projectId/ssh-cas",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      operationId: "listProjectSshCertificateAuthorities",
      tags: [ApiDocsTags.SshCertificateAuthorities],
      params: z.object({
        projectId: z.string().trim().describe(PROJECTS.LIST_SSH_CAS.projectId)
      }),
      response: {
        200: z.object({
          cas: z.array(sanitizedSshCa)
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const cas = await server.services.project.listProjectSshCas({
        actorId: req.permission.id,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        actor: req.permission.type,
        projectId: req.params.projectId
      });

      return { cas };
    }
  });

  server.route({
    method: "GET",
    url: "/:projectId/ssh-hosts",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      operationId: "listProjectSshHosts",
      tags: [ApiDocsTags.SshHosts],
      params: z.object({
        projectId: z.string().trim().describe(PROJECTS.LIST_SSH_HOSTS.projectId)
      }),
      response: {
        200: z.object({
          hosts: z.array(
            sanitizedSshHost.extend({
              loginMappings: loginMappingSchema
                .extend({
                  source: z.nativeEnum(LoginMappingSource)
                })
                .array()
            })
          )
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const hosts = await server.services.project.listProjectSshHosts({
        actorId: req.permission.id,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        actor: req.permission.type,
        projectId: req.params.projectId
      });

      return { hosts };
    }
  });

  server.route({
    method: "GET",
    url: "/:projectId/ssh-host-groups",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      operationId: "listProjectSshHostGroups",
      tags: [ApiDocsTags.SshHostGroups],
      params: z.object({
        projectId: z.string().trim().describe(PROJECTS.LIST_SSH_HOST_GROUPS.projectId)
      }),
      response: {
        200: z.object({
          groups: z.array(
            sanitizedSshHostGroup.extend({
              loginMappings: loginMappingSchema.array(),
              hostCount: z.number()
            })
          )
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const groups = await server.services.project.listProjectSshHostGroups({
        actorId: req.permission.id,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        actor: req.permission.type,
        projectId: req.params.projectId
      });

      return { groups };
    }
  });
};
