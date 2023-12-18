import { z } from "zod";

import {
  AuthTokenSessionsSchema,
  OrganizationsSchema,
  UserEncryptionKeysSchema,
  UsersSchema
} from "@app/db/schemas";
import { ApiKeysSchema } from "@app/db/schemas/api-keys";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMethod, AuthMode } from "@app/services/auth/auth-type";

export const registerUserRouter = async (server: FastifyZodProvider) => {
  server.route({
    url: "/me/mfa",
    method: "PATCH",
    schema: {
      body: z.object({
        isMfaEnabled: z.boolean()
      }),
      response: {
        200: z.object({
          user: UsersSchema
        })
      }
    },
    preHandler: verifyAuth([AuthMode.JWT, AuthMode.API_KEY]),
    handler: async (req) => {
      const user = await server.services.user.toggleUserMfa(req.auth.userId, req.body.isMfaEnabled);
      return { user };
    }
  });

  server.route({
    url: "/me/name",
    method: "PATCH",
    schema: {
      body: z.object({
        firstName: z.string().trim(),
        lastName: z.string().trim()
      }),
      response: {
        200: z.object({
          user: UsersSchema
        })
      }
    },
    preHandler: verifyAuth([AuthMode.JWT, AuthMode.API_KEY]),
    handler: async (req) => {
      const user = await server.services.user.updateUserName(
        req.auth.userId,
        req.body.firstName,
        req.body.lastName
      );
      return { user };
    }
  });

  server.route({
    url: "/me/auth-methods",
    method: "PUT",
    schema: {
      body: z.object({
        authMethods: z.nativeEnum(AuthMethod).array().min(1)
      }),
      response: {
        200: z.object({
          user: UsersSchema
        })
      }
    },
    preHandler: verifyAuth([AuthMode.JWT, AuthMode.API_KEY]),
    handler: async (req) => {
      const user = await server.services.user.updateAuthMethods(
        req.auth.userId,
        req.body.authMethods
      );
      return { user };
    }
  });

  server.route({
    method: "GET",
    url: "/me/organizations",
    schema: {
      response: {
        200: z.object({
          organizations: OrganizationsSchema.array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.API_KEY]),
    handler: async (req) => {
      const organizations = await server.services.org.findAllOrganizationOfUser(req.auth.userId);
      return { organizations };
    }
  });

  server.route({
    method: "GET",
    url: "/me/api-keys",
    schema: {
      response: {
        200: ApiKeysSchema.omit({ secretHash: true }).array()
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const apiKeys = await server.services.apiKey.getMyApiKeys(req.auth.userId);
      return apiKeys;
    }
  });

  server.route({
    method: "POST",
    url: "/me/api-keys",
    schema: {
      body: z.object({
        name: z.string().trim(),
        expiresIn: z.number()
      }),
      response: {
        200: z.object({
          apiKey: z.string(),
          apiKeyData: ApiKeysSchema.omit({ secretHash: true })
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const apiKeys = await server.services.apiKey.createApiKey(
        req.auth.userId,
        req.body.name,
        req.body.expiresIn
      );
      return apiKeys;
    }
  });

  server.route({
    method: "DELETE",
    url: "/me/api-keys/:apiKeyDataId",
    schema: {
      params: z.object({
        apiKeyDataId: z.string().trim()
      }),
      response: {
        200: z.object({
          apiKeyData: ApiKeysSchema.omit({ secretHash: true })
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const apiKeyData = await server.services.apiKey.deleteApiKey(
        req.auth.userId,
        req.params.apiKeyDataId
      );
      return { apiKeyData };
    }
  });

  server.route({
    method: "GET",
    url: "/me/sessions",
    schema: {
      response: {
        200: AuthTokenSessionsSchema.array()
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const sessions = await server.services.authToken.getTokenSessionByUser(req.auth.userId);
      return sessions;
    }
  });

  server.route({
    method: "DELETE",
    url: "/me/sessions",
    schema: {
      response: {
        200: z.object({
          message: z.string()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      await server.services.authToken.revokeAllMySessions(req.auth.userId);
      return {
        message: "Successfully revoked all sessions"
      };
    }
  });

  server.route({
    method: "GET",
    url: "/me",
    schema: {
      response: {
        200: z.object({
          user: UsersSchema.merge(UserEncryptionKeysSchema.omit({ verifier: true }))
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const user = await server.services.user.getMe(req.auth.userId);
      return { user };
    }
  });

  server.route({
    method: "DELETE",
    url: "/me",
    schema: {
      response: {
        200: z.object({
          user: UsersSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const user = await server.services.user.deleteMe(req.auth.userId);
      return { user };
    }
  });
};
