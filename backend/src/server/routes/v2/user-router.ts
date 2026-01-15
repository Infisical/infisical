import { z } from "zod";

import { AuthTokenSessionsSchema, UserEncryptionKeysSchema, UsersSchema } from "@app/db/schemas";
import { ApiKeysSchema } from "@app/db/schemas/api-keys";
import { readLimit, smtpRateLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMethod, AuthMode, MfaMethod } from "@app/services/auth/auth-type";
import { sanitizedOrganizationSchema } from "@app/services/org/org-schema";

export const registerUserRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/me/emails/code",
    config: {
      rateLimit: smtpRateLimit({
        keyGenerator: (req) => (req.body as { username?: string })?.username?.trim().substring(0, 100) || req.realIp
      })
    },
    schema: {
      operationId: "sendEmailVerificationCode",
      body: z.object({
        token: z.string().trim()
      }),
      response: {
        200: z.object({})
      }
    },
    handler: async (req) => {
      await server.services.user.sendEmailVerificationCode(req.body.token);
      return {};
    }
  });

  server.route({
    method: "POST",
    url: "/me/emails/verify",
    config: {
      rateLimit: smtpRateLimit({
        keyGenerator: (req) => (req.body as { username?: string })?.username?.trim().substring(0, 100) || req.realIp
      })
    },
    schema: {
      operationId: "verifyEmailVerificationCode",
      body: z.object({
        username: z.string().trim(),
        code: z.string().trim()
      }),
      response: {
        200: z.object({})
      }
    },
    handler: async (req) => {
      await server.services.user.verifyEmailVerificationCode(req.body.username, req.body.code);
      return {};
    }
  });

  server.route({
    method: "PATCH",
    url: "/me/mfa",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      operationId: "updateUserMfa",
      body: z.object({
        isMfaEnabled: z.boolean().optional(),
        selectedMfaMethod: z.nativeEnum(MfaMethod).optional()
      }),
      response: {
        200: z.object({
          user: UsersSchema
        })
      }
    },
    preHandler: verifyAuth([AuthMode.JWT, AuthMode.API_KEY]),
    handler: async (req) => {
      const user = await server.services.user.updateUserMfa({
        userId: req.permission.id,
        isMfaEnabled: req.body.isMfaEnabled,
        selectedMfaMethod: req.body.selectedMfaMethod
      });

      return { user };
    }
  });

  server.route({
    method: "PATCH",
    url: "/me/name",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      operationId: "updateUserName",
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
      const user = await server.services.user.updateUserName(req.permission.id, req.body.firstName, req.body.lastName);
      return { user };
    }
  });

  server.route({
    method: "PUT",
    url: "/me/auth-methods",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      operationId: "updateUserAuthMethods",
      body: z.object({
        authMethods: z.nativeEnum(AuthMethod).array().min(1)
      }),
      response: {
        200: z.object({
          user: UsersSchema
        })
      }
    },
    preHandler: verifyAuth([AuthMode.JWT, AuthMode.API_KEY], { requireOrg: false }),
    handler: async (req) => {
      const user = await server.services.user.updateAuthMethods(req.permission.id, req.body.authMethods);
      return { user };
    }
  });

  server.route({
    method: "POST",
    url: "/me/email-change/otp",
    config: {
      rateLimit: smtpRateLimit({
        keyGenerator: (req) => req.permission.id
      })
    },
    schema: {
      operationId: "requestEmailChangeOtp",
      body: z.object({
        newEmail: z.string().email().trim()
      }),
      response: {
        200: z.object({
          success: z.boolean(),
          message: z.string()
        })
      }
    },
    preHandler: verifyAuth([AuthMode.JWT], { requireOrg: false }),
    handler: async (req) => {
      const result = await server.services.user.requestEmailChangeOTP({
        userId: req.permission.id,
        newEmail: req.body.newEmail
      });
      return result;
    }
  });

  server.route({
    method: "PATCH",
    url: "/me/email",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      operationId: "updateUserEmail",
      body: z.object({
        newEmail: z.string().email().trim(),
        otpCode: z.string().trim().length(6)
      }),
      response: {
        200: z.object({
          user: UsersSchema
        })
      }
    },
    preHandler: verifyAuth([AuthMode.JWT], { requireOrg: false }),
    handler: async (req) => {
      const user = await server.services.user.updateUserEmail({
        userId: req.permission.id,
        newEmail: req.body.newEmail,
        otpCode: req.body.otpCode
      });
      return { user };
    }
  });

  server.route({
    method: "GET",
    url: "/me/organizations",
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listUserOrganizations",
      description: "Return organizations that current user is part of",
      response: {
        200: z.object({
          organizations: sanitizedOrganizationSchema.array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.API_KEY]),
    handler: async (req) => {
      const organizations = await server.services.org.findAllOrganizationOfUser(req.permission.id);
      return { organizations };
    }
  });

  server.route({
    method: "GET",
    url: "/me/api-keys",
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listUserApiKeys",
      response: {
        200: ApiKeysSchema.omit({ secretHash: true }).array()
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const apiKeys = await server.services.apiKey.getMyApiKeys(req.permission.id);
      return apiKeys;
    }
  });

  server.route({
    method: "POST",
    url: "/me/api-keys",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      operationId: "createUserApiKey",
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
      const apiKeys = await server.services.apiKey.createApiKey(req.permission.id, req.body.name, req.body.expiresIn);
      return apiKeys;
    }
  });

  server.route({
    method: "DELETE",
    url: "/me/api-keys/:apiKeyDataId",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      operationId: "deleteUserApiKey",
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
      const apiKeyData = await server.services.apiKey.deleteApiKey(req.permission.id, req.params.apiKeyDataId);
      return { apiKeyData };
    }
  });

  server.route({
    method: "GET",
    url: "/me/sessions",
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listUserSessions",
      response: {
        200: AuthTokenSessionsSchema.array()
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const sessions = await server.services.authToken.getTokenSessionByUser(req.permission.id);
      return sessions;
    }
  });

  server.route({
    method: "DELETE",
    url: "/me/sessions",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      operationId: "revokeAllUserSessions",
      response: {
        200: z.object({
          message: z.string()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      await server.services.authToken.revokeAllMySessions(req.permission.id);
      return {
        message: "Successfully revoked all sessions"
      };
    }
  });

  server.route({
    method: "DELETE",
    url: "/me/sessions/:sessionId",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      operationId: "revokeUserSession",
      params: z.object({
        sessionId: z.string().trim()
      }),
      response: {
        200: z.object({
          message: z.string()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      await server.services.authToken.revokeMySessionById(req.permission.id, req.params.sessionId);
      return {
        message: "Successfully revoked session"
      };
    }
  });

  server.route({
    method: "GET",
    url: "/me",
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "getCurrentUser",
      description: "Retrieve the current user on the request",
      response: {
        200: z.object({
          user: UsersSchema.merge(
            UserEncryptionKeysSchema.pick({
              clientPublicKey: true,
              serverPrivateKey: true,
              encryptionVersion: true,
              protectedKey: true,
              protectedKeyIV: true,
              protectedKeyTag: true,
              publicKey: true,
              encryptedPrivateKey: true,
              iv: true,
              tag: true,
              salt: true,
              verifier: true,
              userId: true
            })
          )
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.API_KEY]),
    handler: async (req) => {
      const user = await server.services.user.getMe(req.permission.id);
      return { user };
    }
  });

  server.route({
    method: "DELETE",
    url: "/me",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      operationId: "deleteUser",
      response: {
        200: z.object({
          user: UsersSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const user = await server.services.user.deleteUser(req.permission.id);
      return { user };
    }
  });
};
