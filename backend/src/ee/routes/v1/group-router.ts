import slugify from "@sindresorhus/slugify";
import { z } from "zod";

import { GroupsSchema, OrgMembershipRole, UsersSchema } from "@app/db/schemas";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerGroupRouter = async (server: FastifyZodProvider) => {
  server.route({
    url: "/",
    method: "POST",
    onRequest: verifyAuth([AuthMode.JWT]),
    schema: {
      body: z.object({
        organizationId: z.string().trim(),
        name: z.string().trim().min(1),
        slug: z
          .string()
          .min(5)
          .max(36)
          .refine((v) => slugify(v) === v, {
            message: "Slug must be a valid slug"
          })
          .optional(),
        role: z.string().trim().min(1).default(OrgMembershipRole.NoAccess)
      }),
      response: {
        200: GroupsSchema
      }
    },
    handler: async (req) => {
      const group = await server.services.group.createGroup({
        actor: req.permission.type,
        actorId: req.permission.id,
        orgId: req.body.organizationId,
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
        currentSlug: z.string().trim()
      }),
      body: z
        .object({
          name: z.string().trim().min(1),
          slug: z
            .string()
            .min(5)
            .max(36)
            .refine((v) => slugify(v) === v, {
              message: "Slug must be a valid slug"
            }),
          role: z.string().trim().min(1)
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
        orgId: req.permission.orgId, // note
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        ...req.body
      });

      return group;
    }
  });

  server.route({
    url: "/:groupSlug",
    method: "DELETE",
    onRequest: verifyAuth([AuthMode.JWT]),
    schema: {
      params: z.object({
        groupSlug: z.string().trim()
      }),
      response: {
        200: GroupsSchema
      }
    },
    handler: async (req) => {
      const group = await server.services.group.deleteGroup({
        groupSlug: req.params.groupSlug,
        actor: req.permission.type,
        actorId: req.permission.id,
        orgId: req.permission.orgId, // note
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
        slug: z.string().trim()
      }),
      response: {
        200: UsersSchema.pick({
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
          .array()
      }
    },
    handler: async (req) => {
      const users = await server.services.group.listGroupUsers({
        groupSlug: req.params.slug,
        actor: req.permission.type,
        actorId: req.permission.id,
        orgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });
      return users;
    }
  });

  server.route({
    method: "POST",
    url: "/:slug/users/:username",
    onRequest: verifyAuth([AuthMode.JWT]),
    schema: {
      params: z.object({
        slug: z.string().trim(),
        username: z.string().trim()
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
        orgId: req.permission.orgId,
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
        slug: z.string().trim(),
        username: z.string().trim()
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
        orgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      return user;
    }
  });
};
