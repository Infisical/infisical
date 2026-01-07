import { z } from "zod";

import { GroupsSchema, IdentitiesSchema, OrgMembershipRole, ProjectsSchema, UsersSchema } from "@app/db/schemas";
import {
  FilterMemberType,
  FilterReturnedMachineIdentities,
  FilterReturnedProjects,
  FilterReturnedUsers,
  GroupMembersOrderBy,
  GroupProjectsOrderBy
} from "@app/ee/services/group/group-types";
import { ApiDocsTags, GROUPS } from "@app/lib/api-docs";
import { OrderByDirection } from "@app/lib/types";
import { CharacterType, characterValidator } from "@app/lib/validator/validate-string";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { slugSchema } from "@app/server/lib/schemas";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

const GroupIdentityResponseSchema = IdentitiesSchema.pick({
  id: true,
  name: true
});

const GroupWithRoleSchema = GroupsSchema.extend({
  role: z.string(),
  roleId: z.string().nullish()
});

export const registerGroupRouter = async (server: FastifyZodProvider) => {
  server.route({
    url: "/",
    method: "POST",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.Groups],
      body: z.object({
        name: z.string().trim().min(1).max(50).describe(GROUPS.CREATE.name),
        slug: slugSchema({ min: 5, max: 36 }).optional().describe(GROUPS.CREATE.slug),
        role: z.string().trim().min(1).default(OrgMembershipRole.NoAccess).describe(GROUPS.CREATE.role)
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
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.Groups],
      params: z.object({
        id: z.string().trim().describe(GROUPS.GET_BY_ID.id)
      }),
      response: {
        200: GroupWithRoleSchema.extend({
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
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.Groups],
      response: {
        200: GroupWithRoleSchema.array()
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
    config: {
      rateLimit: writeLimit
    },
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
          role: z.string().trim().min(1).describe(GROUPS.UPDATE.role)
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
    config: {
      rateLimit: writeLimit
    },
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
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.Groups],
      params: z.object({
        id: z.string().trim().describe(GROUPS.LIST_USERS.id)
      }),
      querystring: z.object({
        offset: z.coerce.number().min(0).default(0).describe(GROUPS.LIST_USERS.offset),
        limit: z.coerce.number().min(1).max(100).default(10).describe(GROUPS.LIST_USERS.limit),
        username: z.string().trim().optional().describe(GROUPS.LIST_USERS.username),
        search: z
          .string()
          .trim()
          .refine((val) => characterValidator([CharacterType.AlphaNumeric, CharacterType.Hyphen])(val), {
            message: "Invalid pattern: only alphanumeric characters, - are allowed."
          })
          .optional()
          .describe(GROUPS.LIST_USERS.search),
        filter: z.nativeEnum(FilterReturnedUsers).optional().describe(GROUPS.LIST_USERS.filterUsers)
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
            .extend({
              isPartOfGroup: z.boolean(),
              joinedGroupAt: z.date().nullable()
            })
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
    method: "GET",
    url: "/:id/machine-identities",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.Groups],
      params: z.object({
        id: z.string().trim().describe(GROUPS.LIST_MACHINE_IDENTITIES.id)
      }),
      querystring: z.object({
        offset: z.coerce.number().min(0).default(0).describe(GROUPS.LIST_MACHINE_IDENTITIES.offset),
        limit: z.coerce.number().min(1).max(100).default(10).describe(GROUPS.LIST_MACHINE_IDENTITIES.limit),
        search: z
          .string()
          .trim()
          .refine((val) => characterValidator([CharacterType.AlphaNumeric, CharacterType.Hyphen])(val), {
            message: "Invalid pattern: only alphanumeric characters, - are allowed."
          })
          .optional()
          .describe(GROUPS.LIST_MACHINE_IDENTITIES.search),
        filter: z
          .nativeEnum(FilterReturnedMachineIdentities)
          .optional()
          .describe(GROUPS.LIST_MACHINE_IDENTITIES.filterMachineIdentities)
      }),
      response: {
        200: z.object({
          machineIdentities: GroupIdentityResponseSchema.extend({
            isPartOfGroup: z.boolean(),
            joinedGroupAt: z.date().nullable()
          }).array(),
          totalCount: z.number()
        })
      }
    },
    handler: async (req) => {
      const { machineIdentities, totalCount } = await server.services.group.listGroupMachineIdentities({
        id: req.params.id,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        ...req.query
      });

      return { machineIdentities, totalCount };
    }
  });

  server.route({
    method: "GET",
    url: "/:id/members",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.Groups],
      params: z.object({
        id: z.string().trim().describe(GROUPS.LIST_MEMBERS.id)
      }),
      querystring: z.object({
        offset: z.coerce.number().min(0).default(0).describe(GROUPS.LIST_MEMBERS.offset),
        limit: z.coerce.number().min(1).max(100).default(10).describe(GROUPS.LIST_MEMBERS.limit),
        search: z
          .string()
          .trim()
          .refine((val) => characterValidator([CharacterType.AlphaNumeric, CharacterType.Hyphen])(val), {
            message: "Invalid pattern: only alphanumeric characters, - are allowed."
          })
          .optional()
          .describe(GROUPS.LIST_MEMBERS.search),
        orderBy: z
          .nativeEnum(GroupMembersOrderBy)
          .default(GroupMembersOrderBy.Name)
          .optional()
          .describe(GROUPS.LIST_MEMBERS.orderBy),
        orderDirection: z.nativeEnum(OrderByDirection).optional().describe(GROUPS.LIST_MEMBERS.orderDirection),
        memberTypeFilter: z
          .union([z.nativeEnum(FilterMemberType), z.array(z.nativeEnum(FilterMemberType))])
          .optional()
          .describe(GROUPS.LIST_MEMBERS.memberTypeFilter)
          .transform((val) => {
            if (!val) return undefined;
            return Array.isArray(val) ? val : [val];
          })
      }),
      response: {
        200: z.object({
          members: z
            .discriminatedUnion("type", [
              z.object({
                id: z.string(),
                joinedGroupAt: z.date().nullable(),
                type: z.literal("user"),
                user: UsersSchema.pick({ id: true, firstName: true, lastName: true, email: true, username: true })
              }),
              z.object({
                id: z.string(),
                joinedGroupAt: z.date().nullable(),
                type: z.literal("machineIdentity"),
                machineIdentity: GroupIdentityResponseSchema
              })
            ])
            .array(),
          totalCount: z.number()
        })
      }
    },
    handler: async (req) => {
      const { members, totalCount } = await server.services.group.listGroupMembers({
        id: req.params.id,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        ...req.query
      });

      return { members, totalCount };
    }
  });

  server.route({
    method: "GET",
    url: "/:id/projects",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.Groups],
      params: z.object({
        id: z.string().trim().describe(GROUPS.LIST_PROJECTS.id)
      }),
      querystring: z.object({
        offset: z.coerce.number().min(0).default(0).describe(GROUPS.LIST_PROJECTS.offset),
        limit: z.coerce.number().min(1).max(100).default(10).describe(GROUPS.LIST_PROJECTS.limit),
        search: z
          .string()
          .trim()
          .refine((val) => characterValidator([CharacterType.AlphaNumeric, CharacterType.Hyphen])(val), {
            message: "Invalid pattern: only alphanumeric characters, - are allowed."
          })
          .optional()
          .describe(GROUPS.LIST_PROJECTS.search),
        filter: z.nativeEnum(FilterReturnedProjects).optional().describe(GROUPS.LIST_PROJECTS.filterProjects),
        orderBy: z
          .nativeEnum(GroupProjectsOrderBy)
          .default(GroupProjectsOrderBy.Name)
          .describe(GROUPS.LIST_PROJECTS.orderBy),
        orderDirection: z
          .nativeEnum(OrderByDirection)
          .default(OrderByDirection.ASC)
          .describe(GROUPS.LIST_PROJECTS.orderDirection)
      }),
      response: {
        200: z.object({
          projects: ProjectsSchema.pick({
            id: true,
            name: true,
            slug: true,
            description: true,
            type: true
          })
            .extend({
              joinedGroupAt: z.date().nullable()
            })
            .array(),
          totalCount: z.number()
        })
      }
    },
    handler: async (req) => {
      const { projects, totalCount } = await server.services.group.listGroupProjects({
        id: req.params.id,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        ...req.query
      });

      return { projects, totalCount };
    }
  });

  server.route({
    method: "POST",
    url: "/:id/users/:username",
    config: {
      rateLimit: writeLimit
    },
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
    method: "POST",
    url: "/:id/machine-identities/:machineIdentityId",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.Groups],
      params: z.object({
        id: z.string().trim().describe(GROUPS.ADD_MACHINE_IDENTITY.id),
        machineIdentityId: z.string().trim().describe(GROUPS.ADD_MACHINE_IDENTITY.machineIdentityId)
      }),
      response: {
        200: z.object({
          id: z.string()
        })
      }
    },
    handler: async (req) => {
      const machineIdentity = await server.services.group.addMachineIdentityToGroup({
        id: req.params.id,
        identityId: req.params.machineIdentityId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      return machineIdentity;
    }
  });

  server.route({
    method: "DELETE",
    url: "/:id/users/:username",
    config: {
      rateLimit: writeLimit
    },
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
    method: "DELETE",
    url: "/:id/machine-identities/:machineIdentityId",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.Groups],
      params: z.object({
        id: z.string().trim().describe(GROUPS.DELETE_MACHINE_IDENTITY.id),
        machineIdentityId: z.string().trim().describe(GROUPS.DELETE_MACHINE_IDENTITY.machineIdentityId)
      }),
      response: {
        200: z.object({
          id: z.string()
        })
      }
    },
    handler: async (req) => {
      const machineIdentity = await server.services.group.removeMachineIdentityFromGroup({
        id: req.params.id,
        identityId: req.params.machineIdentityId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      return machineIdentity;
    }
  });
};
