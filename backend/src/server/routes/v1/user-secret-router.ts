import { z } from "zod";

import { UserSecretSchema } from "@app/db/schemas";
import { UserSecretType } from "@app/lib/types";
import { readLimit, secretsLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerUserSecretRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/",
    config: {
      rateLimit: readLimit
    },
    schema: {
      querystring: z.object({
        offset: z.coerce.number().min(0).max(100).default(0),
        limit: z.coerce.number().min(1).max(100).default(25)
      }),
      response: {
        200: z.object({
          secrets: z.array(UserSecretSchema),
          totalCount: z.number()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { secrets, totalCount } = await req.server.services.userSecret.getUserSecrets({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        ...req.query
      });

      return {
        secrets,
        totalCount
      };
    }
  });

  server.route({
    method: "POST",
    url: "/",
    config: {
      rateLimit: secretsLimit
    },
    schema: {
      body: z.object({
        name: z.string().max(50).optional(),
        encryptedValue: z.string(),
        hashedHex: z.string(),
        iv: z.string(),
        secretType: z.string().default(UserSecretType.Login)
      }),
      response: {
        200: z.object({
          id: z.string().uuid()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const userSecret = await req.server.services.userSecret.createUserSecret({
        actor: req.permission.type,
        actorId: req.permission.id,
        orgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        ...req.body,
        secretType: req.body.secretType as UserSecretType
      });
      return { id: userSecret.id };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:userSecretId",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      params: z.object({
        userSecretId: z.string().uuid()
      }),
      response: {
        200: UserSecretSchema
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { userSecretId } = req.params;
      const deletedUserSecret = await req.server.services.userSecret.deleteUserSecretById({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        userSecretId
      });

      return { ...deletedUserSecret };
    }
  });
};
