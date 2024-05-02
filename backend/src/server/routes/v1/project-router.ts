import { z } from "zod";

import {
  IntegrationsSchema,
  ProjectMembershipsSchema,
  ProjectsSchema,
  UserEncryptionKeysSchema,
  UsersSchema
} from "@app/db/schemas";
import { PROJECTS } from "@app/lib/api-docs";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { ProjectFilterType } from "@app/services/project/project-types";

import { integrationAuthPubSchema } from "../sanitizedSchemas";
import { sanitizedServiceTokenSchema } from "../v2/service-token-router";

const projectWithEnv = ProjectsSchema.merge(
  z.object({
    _id: z.string(),
    environments: z.object({ name: z.string(), slug: z.string(), id: z.string() }).array()
  })
);

export const registerProjectRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/:workspaceId/keys",
    config: {
      rateLimit: readLimit
    },
    schema: {
      params: z.object({
        workspaceId: z.string().trim()
      }),
      response: {
        200: z.object({
          publicKeys: z
            .object({
              publicKey: z.string().optional(),
              userId: z.string()
            })
            .array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const publicKeys = await server.services.projectKey.getProjectPublicKeys({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        projectId: req.params.workspaceId
      });
      return { publicKeys };
    }
  });

  server.route({
    method: "GET",
    url: "/:workspaceId/users",
    config: {
      rateLimit: readLimit
    },
    schema: {
      params: z.object({
        workspaceId: z.string().trim()
      }),
      querystring: z.object({
        includeGroupMembers: z
          .enum(["true", "false"])
          .default("false")
          .transform((value) => value === "true")
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
            }).merge(UserEncryptionKeysSchema.pick({ publicKey: true })),
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
      const users = await server.services.projectMembership.getProjectMemberships({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorAuthMethod: req.permission.authMethod,
        includeGroupMembers: req.query.includeGroupMembers,
        projectId: req.params.workspaceId,
        actorOrgId: req.permission.orgId
      });
      return { users };
    }
  });

  server.route({
    method: "GET",
    url: "/",
    config: {
      rateLimit: readLimit
    },
    schema: {
      response: {
        200: z.object({
          workspaces: projectWithEnv.array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.API_KEY]),
    handler: async (req) => {
      const workspaces = await server.services.project.getProjects(req.permission.id);
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
      description: "Get project",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        workspaceId: z.string().trim().describe(PROJECTS.GET.workspaceId)
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
      description: "Delete project",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        workspaceId: z.string().trim().describe(PROJECTS.DELETE.workspaceId)
      }),
      response: {
        200: z.object({
          workspace: ProjectsSchema.optional()
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
      return { workspace };
    }
  });

  server.route({
    url: "/:workspaceId/name",
    method: "POST",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      params: z.object({
        workspaceId: z.string().trim()
      }),
      body: z.object({
        name: z.string().trim()
      }),
      response: {
        200: z.object({
          message: z.string(),
          workspace: ProjectsSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const workspace = await server.services.project.updateName({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        projectId: req.params.workspaceId,
        name: req.body.name
      });
      return {
        message: "Successfully changed workspace name",
        workspace
      };
    }
  });

  server.route({
    method: "PATCH",
    url: "/:workspaceId",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      description: "Update project",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        workspaceId: z.string().trim().describe(PROJECTS.UPDATE.workspaceId)
      }),
      body: z.object({
        name: z
          .string()
          .trim()
          .max(64, { message: "Name must be 64 or fewer characters" })
          .optional()
          .describe(PROJECTS.UPDATE.name),
        autoCapitalization: z.boolean().optional().describe(PROJECTS.UPDATE.autoCapitalization)
      }),
      response: {
        200: z.object({
          workspace: ProjectsSchema
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
          autoCapitalization: req.body.autoCapitalization
        },
        actorAuthMethod: req.permission.authMethod,
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId
      });
      return {
        workspace
      };
    }
  });

  server.route({
    method: "POST",
    url: "/:workspaceId/auto-capitalization",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      params: z.object({
        workspaceId: z.string().trim()
      }),
      body: z.object({
        autoCapitalization: z.boolean()
      }),
      response: {
        200: z.object({
          message: z.string(),
          workspace: ProjectsSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const workspace = await server.services.project.toggleAutoCapitalization({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        projectId: req.params.workspaceId,
        autoCapitalization: req.body.autoCapitalization
      });
      return {
        message: "Successfully changed workspace settings",
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
      description: "List integrations for a project.",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        workspaceId: z.string().trim().describe(PROJECTS.LIST_INTEGRATION.workspaceId)
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
      description: "List integration auth objects for a workspace.",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        workspaceId: z.string().trim().describe(PROJECTS.LIST_INTEGRATION_AUTHORIZATION.workspaceId)
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
    url: "/:workspaceId/service-token-data",
    config: {
      rateLimit: readLimit
    },
    schema: {
      params: z.object({
        workspaceId: z.string().trim()
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
        projectId: req.params.workspaceId
      });
      return { serviceTokenData };
    }
  });
};
