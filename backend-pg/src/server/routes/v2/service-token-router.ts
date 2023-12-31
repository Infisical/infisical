import { z } from "zod";

import { ServiceTokensSchema } from "@app/db/schemas";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const sanitizedServiceTokenSchema = ServiceTokensSchema.omit({
  secretHash: true,
  encryptedKey: true,
  iv: true,
  tag: true
});

export const registerServiceTokenRouter = async (server: FastifyZodProvider) => {
  server.route({
    url: "/",
    method: "GET",
    onRequest: verifyAuth([AuthMode.JWT]),
    schema: {
      params: z.object({
        serviceTokenId: z.string().trim()
      }),
      response: {
        200: sanitizedServiceTokenSchema
      }
    },
    handler: async (req) => {
      const serviceTokenData = await server.services.serviceToken.getServiceToken({
        actorId: req.permission.id,
        actor: req.permission.type
      });
      return serviceTokenData;
    }
  });

  server.route({
    url: "/",
    method: "POST",
    onRequest: verifyAuth([AuthMode.JWT]),
    schema: {
      body: z.object({
        name: z.string().trim(),
        workspaceId: z.string().trim(),
        scopes: z
          .object({
            environment: z.string().trim(),
            secretPath: z.string().trim()
          })
          .array()
          .min(1),
        encryptedKey: z.string().trim(),
        iv: z.string().trim(),
        tag: z.string().trim(),
        expiresIn: z.number(),
        permissions: z.enum(["read", "write"]).array()
      }),
      response: {
        200: z.object({
          serviceToken: z.string(),
          serviceTokenData: sanitizedServiceTokenSchema
        })
      }
    },
    handler: async (req) => {
      const { serviceToken, token } = await server.services.serviceToken.createServiceToken({
        actorId: req.permission.id,
        actor: req.permission.type,
        ...req.body,
        projectId: req.body.workspaceId
      });
      return { serviceToken: token, serviceTokenData: serviceToken };
    }
  });

  server.route({
    url: "/:serviceTokenId",
    method: "DELETE",
    onRequest: verifyAuth([AuthMode.JWT]),
    schema: {
      params: z.object({
        serviceTokenId: z.string().trim()
      }),
      response: {
        200: z.object({
          serviceTokenData: sanitizedServiceTokenSchema
        })
      }
    },
    handler: async (req) => {
      const serviceTokenData = await server.services.serviceToken.deleteServiceToken({
        actorId: req.permission.id,
        actor: req.permission.type,
        id: req.params.serviceTokenId
      });
      return { serviceTokenData };
    }
  });
};
