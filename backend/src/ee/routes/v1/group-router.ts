import { z } from "zod";

import { GroupsSchema, OrgMembershipRole } from "@app/db/schemas";
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
        slug: z.string().trim().min(1),
        role: z.string().trim().min(1).default(OrgMembershipRole.NoAccess) // TODO: add describe
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
          slug: z.string().trim().min(1),
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
        orgId: req.permission.orgId as string, // note
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
        slug: z.string().trim()
      }),
      response: {
        200: GroupsSchema
      }
    },
    handler: async (req) => {
      const group = await server.services.group.deleteGroup({
        slug: req.params.slug,
        actor: req.permission.type,
        actorId: req.permission.id,
        orgId: req.permission.orgId as string, // note
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      return group;
    }
  });
};
