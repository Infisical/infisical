import { z } from "zod";

import {
  OrganizationsSchema,
  OrgMembershipsSchema,
  ProjectMembershipsSchema,
  ProjectsSchema,
  UserEncryptionKeysSchema,
  UsersSchema
} from "@app/db/schemas";
import { ORGANIZATIONS } from "@app/lib/api-docs";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { ActorType, AuthMode } from "@app/services/auth/auth-type";

export const registerOrgRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/:organizationId/memberships",
    config: {
      rateLimit: readLimit
    },
    schema: {
      description: "Return organization user memberships",
      security: [
        {
          bearerAuth: []
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
                isEmailVerified: true,
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
        req.permission.authMethod,
        req.permission.orgId
      );
      return { users };
    }
  });

  server.route({
    method: "GET",
    url: "/:organizationId/workspaces",
    config: {
      rateLimit: readLimit
    },
    schema: {
      description: "Return projects in organization that user is part of",
      security: [
        {
          bearerAuth: []
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
              slug: z.string(),
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
        actorAuthMethod: req.permission.authMethod,
        orgId: req.params.organizationId
      });

      return { workspaces };
    }
  });

  server.route({
    method: "GET",
    url: "/:organizationId/memberships/:membershipId",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      description: "Get organization user membership",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        organizationId: z.string().trim().describe(ORGANIZATIONS.GET_USER_MEMBERSHIP.organizationId),
        membershipId: z.string().trim().describe(ORGANIZATIONS.GET_USER_MEMBERSHIP.membershipId)
      }),
      response: {
        200: z.object({
          membership: OrgMembershipsSchema.merge(
            z.object({
              user: UsersSchema.pick({
                username: true,
                email: true,
                isEmailVerified: true,
                firstName: true,
                lastName: true,
                id: true
              }).merge(z.object({ publicKey: z.string().nullable() }))
            })
          ).omit({ createdAt: true, updatedAt: true })
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.API_KEY, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const membership = await server.services.org.getOrgMembership({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        orgId: req.params.organizationId,
        membershipId: req.params.membershipId
      });
      return { membership };
    }
  });

  server.route({
    method: "PATCH",
    url: "/:organizationId/memberships/:membershipId",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      description: "Update organization user memberships",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        organizationId: z.string().trim().describe(ORGANIZATIONS.UPDATE_USER_MEMBERSHIP.organizationId),
        membershipId: z.string().trim().describe(ORGANIZATIONS.UPDATE_USER_MEMBERSHIP.membershipId)
      }),
      body: z.object({
        role: z.string().trim().optional().describe(ORGANIZATIONS.UPDATE_USER_MEMBERSHIP.role),
        isActive: z.boolean().optional().describe(ORGANIZATIONS.UPDATE_USER_MEMBERSHIP.isActive)
      }),
      response: {
        200: z.object({
          membership: OrgMembershipsSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      if (req.auth.actor !== ActorType.USER) return;

      const membership = await server.services.org.updateOrgMembership({
        userId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        orgId: req.params.organizationId,
        membershipId: req.params.membershipId,
        actorOrgId: req.permission.orgId,
        ...req.body
      });
      return { membership };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:organizationId/memberships/:membershipId",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      description: "Delete organization user memberships",
      security: [
        {
          bearerAuth: []
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
        actorAuthMethod: req.permission.authMethod,
        orgId: req.params.organizationId,
        membershipId: req.params.membershipId,
        actorOrgId: req.permission.orgId
      });
      return { membership };
    }
  });

  server.route({
    // TODO: re-think endpoint structure in future so users only need to pass in membershipId bc organizationId is redundant
    method: "GET",
    url: "/:organizationId/memberships/:membershipId/project-memberships",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      description: "Get project memberships given organization membership",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        organizationId: z.string().trim().describe(ORGANIZATIONS.DELETE_USER_MEMBERSHIP.organizationId),
        membershipId: z.string().trim().describe(ORGANIZATIONS.DELETE_USER_MEMBERSHIP.membershipId)
      }),
      response: {
        200: z.object({
          memberships: ProjectMembershipsSchema.extend({
            user: UsersSchema.pick({
              email: true,
              username: true,
              firstName: true,
              lastName: true,
              id: true
            }).merge(UserEncryptionKeysSchema.pick({ publicKey: true })),
            project: ProjectsSchema.pick({ name: true, id: true }),
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
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const memberships = await server.services.org.listProjectMembershipsByOrgMembershipId({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        orgId: req.params.organizationId,
        orgMembershipId: req.params.membershipId
      });
      return { memberships };
    }
  });

  server.route({
    method: "POST",
    url: "/",
    config: {
      rateLimit: writeLimit
    },
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
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.API_KEY], { requireOrg: false }),
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
    config: {
      rateLimit: writeLimit
    },
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
        req.permission.authMethod,
        req.permission.orgId
      );
      return { organization };
    }
  });
};
