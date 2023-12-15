import { z } from "zod";

import {
  ProjectKeysSchema,
  ProjectMembershipsSchema,
  ProjectsSchema,
  UserEncryptionKeysSchema,
  UsersSchema
} from "@app/db/schemas";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerProjectRouter = (server: FastifyZodProvider) => {
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
        projectId: req.params.workspaceId
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
          workspaces: ProjectsSchema.merge(
            z.object({ environments: z.object({ name: z.string(), slug: z.string() }).array() })
          ).array()
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
          workspace: ProjectsSchema.merge(
            z.object({ environments: z.object({ name: z.string(), slug: z.string() }).array() })
          ).optional()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const workspace = await server.services.project.getAProject({
        actorId: req.permission.id,
        actor: req.permission.type,
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
          workspace: ProjectsSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const workspace = await server.services.project.createProject({
        actorId: req.permission.id,
        actor: req.permission.type,
        orgId: req.body.organizationId,
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
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const workspace = await server.services.project.deleteProject({
        actorId: req.permission.id,
        actor: req.permission.type,
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
          latestKey: ProjectKeysSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { invitee, latestKey } = await server.services.projectMembership.inviteUserToProject({
        actorId: req.permission.id,
        actor: req.permission.type,
        projectId: req.params.workspaceId,
        email: req.body.email
      });
      return { invitee, latestKey };
    }
  });
};
