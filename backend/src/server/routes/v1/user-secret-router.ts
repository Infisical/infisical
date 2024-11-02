import { z } from "zod";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { readLimit } from "@app/server/config/rateLimiter";
import { UserSecretsSchema } from "@app/db/schemas";
import { TUserSecretType } from "@app/lib/types";
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
        limit: z.coerce.number().min(1).max(100).default(25),
        type: z.string().optional(),
        searchQuery: z.string().optional()
      }),
      params: z.object({}),
      response: {
        200: z.object({
          secrets: z.array(
            UserSecretsSchema.extend({
              username: z.string().nullable().optional(),
              password: z.string().nullable().optional(),
              website: z.string().nullable().optional(),
              webLogin_iv: z.string().nullable().optional(),
              webLogin_tag: z.string().nullable().optional(),
              cvv: z.string().nullable().optional(),
              expiryDate: z.string().nullable().optional(),
              cardNumber: z.string().nullable().optional(),
              cardholderName: z.string().nullable().optional(),
              content: z.string().nullable().optional(),
              title: z.string().nullable().optional()
            })
          ),
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
        offset: req.query.offset,
        limit: req.query.limit,
        secretType: req.query.type as TUserSecretType | undefined,
        searchQuery: req.query.searchQuery
      });

      return { secrets, totalCount };
    }
  });

  server.route({
    method: "POST",
    url: "/",
    schema: {
      body: z.object({
        name: z.string(),
        description: z.string().optional(),
        userName: z.string().optional(),
        password: z.string().optional(),
        website: z.string().optional(),
        secretType: z.nativeEnum(TUserSecretType),
        cvv: z.string().optional(),
        expiryDate: z.string().optional(),
        cardNumber: z.string().optional(),
        cardholderName: z.string().optional(),
        content: z.string().optional(),
        title: z.string().optional()
      })
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { id } = await req.server.services.userSecret.createUserSecret({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorOrgId: req.permission.orgId,
        orgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        ...req.body
      });
      return { id };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:secretId",
    schema: {
      params: z.object({
        secretId: z.string().min(1)
      })
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      await req.server.services.userSecret.deleteUserSecretById({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorOrgId: req.permission.orgId,
        orgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        secretId: req.params.secretId
      });
    }
  });

  server.route({
    method: "PATCH",
    url: "/:secretId",
    schema: {
      body: z.object({
        name: z.string(),
        description: z.string().optional(),
        userName: z.string().optional(),
        password: z.string().optional(),
        website: z.string().optional(),
        secretType: z.nativeEnum(TUserSecretType),
        cvv: z.string().optional(),
        expiryDate: z.string().optional(),
        cardNumber: z.string().optional(),
        cardholderName: z.string().optional(),
        content: z.string().optional(),
        title: z.string().optional()
      }),
      params: z.object({
        secretId: z.string().min(1)
      })
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      await req.server.services.userSecret.updateUserSecret({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorOrgId: req.permission.orgId,
        orgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        ...req.body,
        secretId: req.params.secretId
      });
    }
  });
};
