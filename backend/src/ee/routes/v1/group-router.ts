import slugify from "@sindresorhus/slugify";
import { z } from "zod";

import { GroupsSchema, OrgMembershipRole, UsersSchema } from "@app/db/schemas";
import { GROUPS } from "@app/lib/api-docs";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerGroupRouter = async (server: FastifyZodProvider) => {
  server.route({
    url: "/",
    method: "POST",
    onRequest: verifyAuth([AuthMode.JWT]),
    schema: {
      body: z.object({
        name: z.string().trim().min(1).describe(GROUPS.CREATE.name),
        slug: z
          .string()
          .min(5)
          .max(36)
          .refine((v) => slugify(v) === v, {
            message: "Slug must be a valid slug"
          })
          .optional()
          .describe(GROUPS.CREATE.slug),
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
    url: "/:currentSlug",
    method: "PATCH",
    onRequest: verifyAuth([AuthMode.JWT]),
    schema: {
      params: z.object({
        currentSlug: z.string().trim().describe(GROUPS.UPDATE.currentSlug)
      }),
      body: z
        .object({
          name: z.string().trim().min(1).describe(GROUPS.UPDATE.name),
          slug: z
            .string()
            .min(5)
            .max(36)
            .refine((v) => slugify(v) === v, {
              message: "Slug must be a valid slug"
            })
            .describe(GROUPS.UPDATE.slug),
          role: z.string().trim().min(1).describe(GROUPS.UPDATE.role)
        })
        .partial(),
      response: {
        200: GroupsSchema
      }
    },
    handler: async (req) => {
      const group = await server.services.group.updateGroup({
        currentSlug: req.params.currentSlug,
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
    url: "/:slug",
    method: "DELETE",
    onRequest: verifyAuth([AuthMode.JWT]),
    schema: {
      params: z.object({
        slug: z.string().trim().describe(GROUPS.DELETE.slug)
      }),
      response: {
        200: GroupsSchema
      }
    },
    handler: async (req) => {
      const group = await server.services.group.deleteGroup({
        groupSlug: req.params.slug,
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
    url: "/:slug/users",
    onRequest: verifyAuth([AuthMode.JWT]),
    schema: {
      params: z.object({
        slug: z.string().trim().describe(GROUPS.LIST_USERS.slug)
      }),
      querystring: z.object({
        offset: z.coerce.number().min(0).max(100).default(0).describe(GROUPS.LIST_USERS.offset),
        limit: z.coerce.number().min(1).max(100).default(10).describe(GROUPS.LIST_USERS.limit),
        username: z.string().optional().describe(GROUPS.LIST_USERS.username)
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
                isPartOfGroup: z.boolean()
              })
            )
            .array(),
          totalCount: z.number()
        })
      }
    },
    handler: async (req) => {
      const { users, totalCount } = await server.services.group.listGroupUsers({
        groupSlug: req.params.slug,
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
    url: "/:slug/users/:username",
    onRequest: verifyAuth([AuthMode.JWT]),
    schema: {
      params: z.object({
        slug: z.string().trim().describe(GROUPS.ADD_USER.slug),
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
        groupSlug: req.params.slug,
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
    url: "/:slug/users/:username",
    onRequest: verifyAuth([AuthMode.JWT]),
    schema: {
      params: z.object({
        slug: z.string().trim().describe(GROUPS.DELETE_USER.slug),
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
        groupSlug: req.params.slug,
        username: req.params.username,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      return user;
    }
  });
};
