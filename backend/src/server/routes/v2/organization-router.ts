import { z } from "zod";

import {
  OrgMembershipsSchema,
  OrgMembershipStatus,
  ProjectMembershipsSchema,
  ProjectsSchema,
  UserEncryptionKeysSchema,
  UsersSchema
} from "@app/db/schemas";
import { ApiDocsTags, ORGANIZATIONS } from "@app/lib/api-docs";
import { getConfig } from "@app/lib/config/env";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { addAuthOriginDomainCookie } from "@app/server/lib/cookie";
import { GenericResourceNameSchema } from "@app/server/lib/schemas";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { ActorType, AuthMode } from "@app/services/auth/auth-type";
import { sanitizedOrganizationSchema } from "@app/services/org/org-schema";

export const registerOrgRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/:organizationId/memberships",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      operationId: "listOrgMemberships",
      tags: [ApiDocsTags.Organizations],
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
      return { users: users.map((el) => ({ ...el, status: el.status || OrgMembershipStatus.Accepted })) };
    }
  });

  server.route({
    method: "GET",
    url: "/:organizationId/workspaces",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      operationId: "listOrgProjects",
      tags: [ApiDocsTags.Organizations],
      description: "Return projects in organization that user is apart of",
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
      operationId: "getOrgMembership",
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
          membership: OrgMembershipsSchema.extend({
            customRoleSlug: z.string().nullish(),
            metadata: z
              .object({
                key: z.string().trim().min(1),
                id: z.string().trim().min(1),
                value: z.string().trim().min(1)
              })
              .array()
              .optional(),
            user: UsersSchema.pick({
              username: true,
              email: true,
              isEmailVerified: true,
              firstName: true,
              lastName: true,
              id: true
            }).extend({ publicKey: z.string().nullish() })
          }).omit({ createdAt: true, updatedAt: true })
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
      return { membership: { ...membership, status: membership.status || OrgMembershipStatus.Accepted } };
    }
  });

  server.route({
    method: "PATCH",
    url: "/:organizationId/memberships/:membershipId",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      operationId: "updateOrgMembership",
      tags: [ApiDocsTags.Organizations],
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
        isActive: z.boolean().optional().describe(ORGANIZATIONS.UPDATE_USER_MEMBERSHIP.isActive),
        metadata: z
          .object({
            key: z.string().trim().min(1).describe(ORGANIZATIONS.UPDATE_USER_MEMBERSHIP.metadata.key),
            value: z.string().trim().min(1).describe(ORGANIZATIONS.UPDATE_USER_MEMBERSHIP.metadata.value)
          })
          .array()
          .optional()
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
      return {
        membership: {
          ...membership,
          role: req.body.role || "",
          orgId: req.params.organizationId,
          status: membership.status || OrgMembershipStatus.Accepted
        }
      };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:organizationId/memberships/:membershipId",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      operationId: "deleteOrgMembership",
      tags: [ApiDocsTags.Organizations],
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
      return {
        membership: {
          ...membership,
          status: membership.status || OrgMembershipStatus.Accepted,
          role: "",
          orgId: req.params.organizationId
        }
      };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:organizationId/memberships",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      operationId: "bulkDeleteOrgMemberships",
      tags: [ApiDocsTags.Organizations],
      description: "Bulk delete organization user memberships",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        organizationId: z.string().trim().describe(ORGANIZATIONS.BULK_DELETE_USER_MEMBERSHIPS.organizationId)
      }),
      body: z.object({
        membershipIds: z.string().trim().array().describe(ORGANIZATIONS.BULK_DELETE_USER_MEMBERSHIPS.membershipIds)
      }),
      response: {
        200: z.object({
          memberships: OrgMembershipsSchema.array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.API_KEY, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      if (req.auth.actor !== ActorType.USER) return;

      const memberships = await server.services.org.bulkDeleteOrgMemberships({
        userId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        orgId: req.params.organizationId,
        membershipIds: req.body.membershipIds,
        actorOrgId: req.permission.orgId
      });
      return {
        memberships: memberships.map((el) => ({
          ...el,
          status: el?.status || OrgMembershipStatus.Accepted,
          role: "",
          orgId: req.params.organizationId
        }))
      };
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
      operationId: "listProjectMembershipsByOrgMembership",
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
            project: ProjectsSchema.pick({ name: true, id: true, type: true }),
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
      operationId: "createOrganization",
      body: z.object({
        name: GenericResourceNameSchema
      }),
      response: {
        200: z.object({
          organization: sanitizedOrganizationSchema
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
      operationId: "deleteOrganization",
      params: z.object({
        organizationId: z.string().trim()
      }),
      response: {
        200: z.object({
          organization: sanitizedOrganizationSchema,
          accessToken: z.string()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.API_KEY]),
    handler: async (req, res) => {
      if (req.auth.actor !== ActorType.USER) return;

      const cfg = getConfig();

      const { organization, tokens } = await server.services.org.deleteOrganizationById({
        userId: req.permission.id,
        orgId: req.params.organizationId,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        authorizationHeader: req.headers.authorization,
        userAgentHeader: req.headers["user-agent"],
        ipAddress: req.realIp
      });

      void res.setCookie("jid", tokens.refreshToken, {
        httpOnly: true,
        path: "/",
        sameSite: "strict",
        secure: cfg.HTTPS_ENABLED
      });

      addAuthOriginDomainCookie(res);

      return { organization, accessToken: tokens.accessToken };
    }
  });

  server.route({
    method: "POST",
    url: "/privilege-system-upgrade",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      operationId: "upgradePrivilegeSystem",
      response: {
        200: z.object({
          organization: sanitizedOrganizationSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const organization = await server.services.org.upgradePrivilegeSystem({
        actorId: req.permission.id,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        orgId: req.permission.orgId
      });

      return { organization };
    }
  });
};
