import { z } from "zod";

import { OrganizationsSchema, OrgMembershipsSchema, UserEncryptionKeysSchema, UsersSchema } from "@app/db/schemas";
import { ORGANIZATIONS } from "@app/lib/api-docs";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { ActorType, AuthMode } from "@app/services/auth/auth-type";

export const registerOrgRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/:organizationId/memberships",
    schema: {
      description: "Return organization user memberships",
      security: [
        {
          bearerAuth: [],
          apiKeyAuth: []
        }
      ],
      params: z.object({
        organizationId: z.string().trim().describe(ORGANIZATIONS.LIST_USER_MEMBERSHIPS.organizationId)
      }),
      response: {
        200: z.object({
          users: OrgMembershipsSchema.merge(
            z.object({
              user: UsersSchema.pick({
                username: true,
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
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.API_KEY, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      if (req.auth.actor !== ActorType.USER) return;

      const users = await server.services.org.findAllOrgMembers(
        req.permission.id,
        req.params.organizationId,
        req.permission.orgId
      );
      return { users };
    }
  });

  server.route({
    method: "GET",
    url: "/:organizationId/workspaces",
    schema: {
      description: "Return projects in organization that user is part of",
      security: [
        {
          bearerAuth: [],
          apiKeyAuth: []
        }
      ],
      params: z.object({
        organizationId: z.string().trim().describe(ORGANIZATIONS.GET_PROJECTS.organizationId)
      }),
      response: {
        200: z.object({
          workspaces: z
            .object({
              id: z.string(),
              name: z.string(),
              organization: z.string(),
              environments: z
                .object({
                  name: z.string(),
                  slug: z.string()
                })
                .array()
            })
            .array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.API_KEY, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const workspaces = await server.services.org.findAllWorkspaces({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorOrgId: req.permission.orgId,
        orgId: req.params.organizationId
      });

      return { workspaces };
    }
  });

  server.route({
    method: "PATCH",
    url: "/:organizationId/memberships/:membershipId",
    schema: {
      description: "Update organization user memberships",
      security: [
        {
          bearerAuth: [],
          apiKeyAuth: []
        }
      ],
      params: z.object({
        organizationId: z.string().trim().describe(ORGANIZATIONS.UPDATE_USER_MEMBERSHIP.organizationId),
        membershipId: z.string().trim().describe(ORGANIZATIONS.UPDATE_USER_MEMBERSHIP.membershipId)
      }),
      body: z.object({
        role: z.string().trim().describe(ORGANIZATIONS.UPDATE_USER_MEMBERSHIP.role)
      }),
      response: {
        200: z.object({
          membership: OrgMembershipsSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.API_KEY, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      if (req.auth.actor !== ActorType.USER) return;

      const membership = await server.services.org.updateOrgMembership({
        userId: req.permission.id,
        role: req.body.role,
        orgId: req.params.organizationId,
        membershipId: req.params.membershipId,
        actorOrgId: req.permission.orgId
      });
      return { membership };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:organizationId/memberships/:membershipId",
    schema: {
      description: "Delete organization user memberships",
      security: [
        {
          bearerAuth: [],
          apiKeyAuth: []
        }
      ],
      params: z.object({
        organizationId: z.string().trim().describe(ORGANIZATIONS.DELETE_USER_MEMBERSHIP.organizationId),
        membershipId: z.string().trim().describe(ORGANIZATIONS.DELETE_USER_MEMBERSHIP.membershipId)
      }),
      response: {
        200: z.object({
          membership: OrgMembershipsSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.API_KEY, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      if (req.auth.actor !== ActorType.USER) return;

      const membership = await server.services.org.deleteOrgMembership({
        userId: req.permission.id,
        orgId: req.params.organizationId,
        membershipId: req.params.membershipId,
        actorOrgId: req.permission.orgId
      });
      return { membership };
    }
  });

  server.route({
    method: "POST",
    url: "/",
    schema: {
      body: z.object({
        name: z.string().trim()
      }),
      response: {
        200: z.object({
          organization: OrganizationsSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.API_KEY]),
    handler: async (req) => {
      if (req.auth.actor !== ActorType.USER) return;

      const organization = await server.services.org.createOrganization({
        userId: req.permission.id,
        userEmail: req.auth.user.email,
        orgName: req.body.name
      });

      return { organization };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:organizationId",
    schema: {
      params: z.object({
        organizationId: z.string().trim()
      }),
      response: {
        200: z.object({
          organization: OrganizationsSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.API_KEY]),
    handler: async (req) => {
      if (req.auth.actor !== ActorType.USER) return;

      const organization = await server.services.org.deleteOrganizationById(
        req.permission.id,
        req.params.organizationId,
        req.permission.orgId
      );
      return { organization };
    }
  });
};
