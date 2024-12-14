import { z } from "zod";

import { DecryptedUserSecretSchema, UserSecretsSchema } from "@app/db/schemas";
import {
  publicEndpointLimit,
  readLimit,
  writeLimit,
} from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerUserSecretsRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/",
    config: {
      rateLimit: readLimit
    },
    schema: {
      response: {
        200: z.object({
          secrets: z.array(DecryptedUserSecretSchema),
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { secrets } = await req.server.services.userSecrets.getUserSecrets({
        actor: req.permission.type,
        actorId: req.permission.id,
        orgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
      });

      return {
        secrets,
      };
    }
  });

  server.route({
    method: "POST",
    url: "/",
    config: {
      rateLimit: publicEndpointLimit
    },
    schema: {
      body: z.object({
        title: z.string().optional(),
        content: z.string().optional(),
        username: z.string().optional(),
        password: z.string().optional(),
        cardNumber: z.string().optional(),
        expiryDate: z.string().optional(),
        cvv: z.string().optional()
      }),
      response: {
        200: z.object({
          id: z.string()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const userSecret = await req.server.services.userSecrets.createUserSecrets({
        actor: req.permission.type,
        actorId: req.permission.id,
        orgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        ...req.body
      });

      return { id: userSecret.id };
    }
  });

  server.route({
    method: "PATCH",
    url: "/:userSecretId",
    config: {
      rateLimit: publicEndpointLimit
    },
    schema: {
      params: z.object({
        userSecretId: z.string()
      }),
      body: z.object({
        title: z.string().optional(),
        content: z.string().optional(),
        username: z.string().optional(),
        password: z.string().optional(),
        cardNumber: z.string().optional(),
        expiryDate: z.string().optional(),
        cvv: z.string().optional()
      }),
      response: {
        200: z.object({
          id: z.string()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { userSecretId } = req.params;
      const userSecret = await req.server.services.userSecrets.updateUserSecretById({
        actor: req.permission.type,
        actorId: req.permission.id,
        orgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        userSecretId,
        ...req.body
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
        userSecretId: z.string()
      }),
      response: {
        200: UserSecretsSchema
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { userSecretId } = req.params;
      const deletedUserSecret = await req.server.services.userSecrets.deleteUserSecretById({
        actor: req.permission.type,
        actorId: req.permission.id,
        orgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        userSecretId
      });

      return { ...deletedUserSecret };
    }
  });

};
