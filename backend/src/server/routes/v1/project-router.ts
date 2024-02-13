import { z } from "zod";

import {
  IntegrationsSchema,
  ProjectKeysSchema,
  ProjectMembershipsSchema,
  ProjectsSchema,
  UserEncryptionKeysSchema,
  UsersSchema
} from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

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
          users: ProjectMembershipsSchema.merge(
            z.object({
              user: UsersSchema.pick({
                email: true,
                firstName: true,
                lastName: true,
                id: true
              }).merge(UserEncryptionKeysSchema.pick({ publicKey: true }))
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
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const workspace = await server.services.project.getAProject({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        projectId: req.params.workspaceId
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
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.API_KEY, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const workspace = await server.services.project.deleteProject({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        projectId: req.params.workspaceId
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

  // Is this actually used..?
  server.route({
    url: "/:workspaceId/invite-signup",
    method: "POST",
    schema: {
      params: z.object({
        workspaceId: z.string().trim()
      }),
      body: z.object({
        email: z.string().trim()
      }),
      response: {
        200: z.object({
          invitee: UsersSchema,
          latestKey: ProjectKeysSchema.optional()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { invitees, latestKey } = await server.services.projectMembership.inviteUserToProject({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        projectId: req.params.workspaceId,
        emails: [req.body.email]
      });

      const invitee = invitees[0];

      // eslint-disable-next-line no-await-in-loop
      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.params.workspaceId,
        event: {
          type: EventType.ADD_WORKSPACE_MEMBER,
          metadata: {
            userId: invitee.id,
            email: invitee.email
          }
        }
      });
      return { invitee, latestKey };
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
