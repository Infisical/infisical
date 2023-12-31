import { z } from "zod";

import { IdentitiesSchema, OrgMembershipRole } from "@app/db/schemas";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerIdentityRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/",
    onRequest: verifyAuth([AuthMode.JWT]),
    schema: {
      body: z.object({
        name: z.string().trim(),
        organizationId: z.string().trim(),
        role: z.string().trim().min(1).default(OrgMembershipRole.NoAccess)
      }),
      response: {
        200: z.object({
          identity: IdentitiesSchema
        })
      }
    },
    handler: async (req) => {
      const identity = await server.services.identity.createIdentity({
        actor: req.permission.type,
        actorId: req.permission.id,
        ...req.body,
        orgId: req.body.organizationId
      });
      return { identity };
    }
  });

  server.route({
    method: "PATCH",
    url: "/:identityId",
    onRequest: verifyAuth([AuthMode.JWT]),
    schema: {
      params: z.object({
        identityId: z.string()
      }),
      body: z.object({
        name: z.string().trim().optional(),
        role: z.string().trim().min(1).optional()
      }),
      response: {
        200: z.object({
          identity: IdentitiesSchema
        })
      }
    },
    handler: async (req) => {
      const identity = await server.services.identity.updateIdentity({
        actor: req.permission.type,
        actorId: req.permission.id,
        id: req.params.identityId,
        ...req.body
      });
      return { identity };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:identityId",
    onRequest: verifyAuth([AuthMode.JWT]),
    schema: {
      params: z.object({
        identityId: z.string()
      }),
      response: {
        200: z.object({
          identity: IdentitiesSchema
        })
      }
    },
    handler: async (req) => {
      const identity = await server.services.identity.deleteIdentity({
        actor: req.permission.type,
        actorId: req.permission.id,
        id: req.params.identityId
      });
      return { identity };
    }
  });
};
