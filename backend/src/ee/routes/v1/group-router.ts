import { z } from "zod";

import { GroupsSchema, GroupType, IdentitiesSchema, OrgMembershipRole, UsersSchema } from "@app/db/schemas";
import { EFilterReturnedIdentities, EFilterReturnedUsers } from "@app/ee/services/group/group-types";
import { ApiDocsTags, GROUPS } from "@app/lib/api-docs";
import { slugSchema } from "@app/server/lib/schemas";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerGroupRouter = async (server: FastifyZodProvider) => {
  server.route({
    url: "/",
    method: "POST",
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.Groups],
      body: z.object({
        name: z.string().trim().min(1).max(50).describe(GROUPS.CREATE.name),
        slug: slugSchema({ min: 5, max: 36 }).optional().describe(GROUPS.CREATE.slug),
        role: z.string().trim().min(1).default(OrgMembershipRole.NoAccess).describe(GROUPS.CREATE.role),
        type: z.nativeEnum(GroupType).default(GroupType.Users).describe(GROUPS.CREATE.type)
      }),
      response: {
        200: GroupsSchema
      }
    },
    handler: async (req) => {
      const group = await server.services.group.createGroup({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        ...req.body
      });

      return group;
    }
  });

  server.route({
    url: "/:id",
    method: "GET",
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.Groups],
      params: z.object({
        id: z.string().trim().describe(GROUPS.GET_BY_ID.id)
      }),
      response: {
        200: GroupsSchema.extend({
          customRoleSlug: z.string().nullable()
        })
      }
    },
    handler: async (req) => {
      const group = await server.services.group.getGroupById({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        id: req.params.id
      });

      return group;
    }
  });

  server.route({
    url: "/",
    method: "GET",
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.Groups],
      response: {
        200: GroupsSchema.array()
      }
    },
    handler: async (req) => {
      const groups = await server.services.org.getOrgGroups({
        actor: req.permission.type,
        actorId: req.permission.id,
        orgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      return groups;
    }
  });

  server.route({
    url: "/:id",
    method: "PATCH",
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.Groups],
      params: z.object({
        id: z.string().trim().describe(GROUPS.UPDATE.id)
      }),
      body: z
        .object({
          name: z.string().trim().min(1).describe(GROUPS.UPDATE.name),
          slug: slugSchema({ min: 5, max: 36 }).describe(GROUPS.UPDATE.slug),
          role: z.string().trim().min(1).describe(GROUPS.UPDATE.role),
          type: z.nativeEnum(GroupType).describe(GROUPS.UPDATE.type)
        })
        .partial(),
      response: {
        200: GroupsSchema
      }
    },
    handler: async (req) => {
      const group = await server.services.group.updateGroup({
        id: req.params.id,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        ...req.body
      });

      return group;
    }
  });

  server.route({
    url: "/:id",
    method: "DELETE",
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.Groups],
      params: z.object({
        id: z.string().trim().describe(GROUPS.DELETE.id)
      }),
      response: {
        200: GroupsSchema
      }
    },
    handler: async (req) => {
      const group = await server.services.group.deleteGroup({
        id: req.params.id,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      return group;
    }
  });

  server.route({
    method: "GET",
    url: "/:id/users",
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.Groups],
      params: z.object({
        id: z.string().trim().describe(GROUPS.LIST_USERS.id)
      }),
      querystring: z.object({
        offset: z.coerce.number().min(0).max(100).default(0).describe(GROUPS.LIST_USERS.offset),
        limit: z.coerce.number().min(1).max(100).default(10).describe(GROUPS.LIST_USERS.limit),
        username: z.string().trim().optional().describe(GROUPS.LIST_USERS.username),
        search: z.string().trim().optional().describe(GROUPS.LIST_USERS.search),
        filter: z.nativeEnum(EFilterReturnedUsers).optional().describe(GROUPS.LIST_USERS.filterUsers)
      }),
      response: {
        200: z.object({
          users: UsersSchema.pick({
            email: true,
            username: true,
            firstName: true,
            lastName: true,
            id: true
          })
            .merge(
              z.object({
                isPartOfGroup: z.boolean(),
                joinedGroupAt: z.date().nullable()
              })
            )
            .array(),
          totalCount: z.number()
        })
      }
    },
    handler: async (req) => {
      const { users, totalCount } = await server.services.group.listGroupUsers({
        id: req.params.id,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        ...req.query
      });

      return { users, totalCount };
    }
  });

  server.route({
    method: "POST",
    url: "/:id/users/:username",
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.Groups],
      params: z.object({
        id: z.string().trim().describe(GROUPS.ADD_USER.id),
        username: z.string().trim().describe(GROUPS.ADD_USER.username)
      }),
      response: {
        200: UsersSchema.pick({
          email: true,
          username: true,
          firstName: true,
          lastName: true,
          id: true
        })
      }
    },
    handler: async (req) => {
      const user = await server.services.group.addUserToGroup({
        id: req.params.id,
        username: req.params.username,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      return user;
    }
  });

  server.route({
    method: "DELETE",
    url: "/:id/users/:username",
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.Groups],
      params: z.object({
        id: z.string().trim().describe(GROUPS.DELETE_USER.id),
        username: z.string().trim().describe(GROUPS.DELETE_USER.username)
      }),
      response: {
        200: UsersSchema.pick({
          email: true,
          username: true,
          firstName: true,
          lastName: true,
          id: true
        })
      }
    },
    handler: async (req) => {
      const user = await server.services.group.removeUserFromGroup({
        id: req.params.id,
        username: req.params.username,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      return user;
    }
  });

  server.route({
    method: "GET",
    url: "/:id/identities",
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.Groups],
      params: z.object({
        id: z
          .string()
          .trim()
          .describe(GROUPS.LIST_IDENTITIES.id as unknown as string)
      }),
      querystring: z.object({
        offset: z.coerce
          .number()
          .min(0)
          .max(100)
          .default(0)
          .describe(GROUPS.LIST_IDENTITIES.offset as unknown as string),
        limit: z.coerce
          .number()
          .min(1)
          .max(100)
          .default(10)
          .describe(GROUPS.LIST_IDENTITIES.limit as unknown as string),
        search: z
          .string()
          .trim()
          .optional()
          .describe(GROUPS.LIST_IDENTITIES.search as unknown as string),
        filter: z
          .nativeEnum(EFilterReturnedIdentities)
          .optional()
          .describe(GROUPS.LIST_IDENTITIES.filterIdentities as unknown as string)
      }),
      response: {
        200: z.object({
          identities: IdentitiesSchema.pick({
            name: true,
            id: true
          })
            .merge(
              z.object({
                isPartOfGroup: z.boolean(),
                joinedGroupAt: z.date().nullable()
              })
            )
            .array(),
          totalCount: z.number()
        })
      }
    },
    handler: async (req) => {
      const params = req.params as { id: string };
      const query = req.query as {
        offset: number;
        limit: number;
        search?: string;
        filter?: EFilterReturnedIdentities;
      };

      const { identities, totalCount } = await server.services.group.listGroupIdentities({
        id: params.id,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        ...query
      });

      return { identities, totalCount };
    }
  });

  server.route({
    method: "POST",
    url: "/:id/identities/:identityId",
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.Groups],
      params: z.object({
        id: z
          .string()
          .trim()
          .describe(GROUPS.ADD_IDENTITY.id as unknown as string),
        identityId: z
          .string()
          .trim()
          .describe(GROUPS.ADD_IDENTITY.identityId as unknown as string)
      }),
      response: {
        200: IdentitiesSchema.pick({
          name: true,
          id: true
        })
      }
    },
    handler: async (req) => {
      const params = req.params as { id: string; identityId: string };
      const identity = await server.services.group.addIdentityToGroup({
        id: params.id,
        identityId: params.identityId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      return identity;
    }
  });

  server.route({
    method: "DELETE",
    url: "/:id/identities/:identityId",
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.Groups],
      params: z.object({
        id: z
          .string()
          .trim()
          .describe(GROUPS.DELETE_IDENTITY.id as unknown as string),
        identityId: z
          .string()
          .trim()
          .describe(GROUPS.DELETE_IDENTITY.identityId as unknown as string)
      }),
      response: {
        200: IdentitiesSchema.pick({
          name: true,
          id: true
        })
      }
    },
    handler: async (req) => {
      const params = req.params as { id: string; identityId: string };
      const identity = await server.services.group.removeIdentityFromGroup({
        id: params.id,
        identityId: params.identityId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      return identity;
    }
  });
};
