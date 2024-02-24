import { z } from "zod";

import {
  IntegrationsSchema,
  ProjectMembershipsSchema,
  ProjectsSchema,
  UserEncryptionKeysSchema,
  UsersSchema
} from "@app/db/schemas";
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
    url: "/:workspaceId/keys",
    method: "GET",
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
        actorOrgId: req.permission.orgId,
        projectId: req.params.workspaceId
      });
      return { publicKeys };
    }
  });

  server.route({
    url: "/:workspaceId/users",
    method: "GET",
    schema: {
      params: z.object({
        workspaceId: z.string().trim()
      }),
      response: {
        200: z.object({
          users: ProjectMembershipsSchema.omit({ role: true })
            .merge(
              z.object({
                user: UsersSchema.pick({
                  username: true,
                  email: true,
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
            )
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
        projectId: req.params.workspaceId,
        actorOrgId: req.permission.orgId
      });
      return { users };
    }
  });

  server.route({
    url: "/",
    method: "GET",
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
    url: "/:workspaceId",
    method: "GET",
    schema: {
      params: z.object({
        workspaceId: z.string().trim()
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
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId
      });
      return { workspace };
    }
  });

  server.route({
    url: "/",
    method: "POST",
    schema: {
      body: z.object({
        workspaceName: z.string().trim(),
        organizationId: z.string().trim()
      }),
      response: {
        200: z.object({
          workspace: projectWithEnv
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const workspace = await server.services.project.createProject({
        actorId: req.permission.id,
        actor: req.permission.type,
        orgId: req.body.organizationId,
        actorOrgId: req.permission.orgId,
        workspaceName: req.body.workspaceName
      });
      return { workspace };
    }
  });

  server.route({
    url: "/:workspaceId",
    method: "DELETE",
    schema: {
      params: z.object({
        workspaceId: z.string().trim()
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
        actor: req.permission.type,
        actorOrgId: req.permission.orgId
      });
      return { workspace };
    }
  });

  server.route({
    url: "/:workspaceId/name",
    method: "POST",
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
    url: "/:workspaceId",
    method: "PATCH",
    schema: {
      params: z.object({
        workspaceId: z.string().trim()
      }),
      body: z.object({
        name: z.string().trim().max(64, { message: "Name must be 64 or fewer characters" }).optional(),
        autoCapitalization: z.boolean().optional()
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
    url: "/:workspaceId/auto-capitalization",
    method: "POST",
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
    url: "/:workspaceId/integrations",
    method: "GET",
    schema: {
      params: z.object({
        workspaceId: z.string().trim()
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
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const integrations = await server.services.integration.listIntegrationByProject({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        projectId: req.params.workspaceId
      });
      return { integrations };
    }
  });

  server.route({
    url: "/:workspaceId/authorizations",
    method: "GET",
    schema: {
      params: z.object({
        workspaceId: z.string().trim()
      }),
      response: {
        200: z.object({
          authorizations: integrationAuthPubSchema.array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const authorizations = await server.services.integrationAuth.listIntegrationAuthByProjectId({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        projectId: req.params.workspaceId
      });
      return { authorizations };
    }
  });

  server.route({
    url: "/:workspaceId/service-token-data",
    method: "GET",
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
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        projectId: req.params.workspaceId
      });
      return { serviceTokenData };
    }
  });
};
