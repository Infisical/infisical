import { z } from "zod";

import { OauthClientsSchema } from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { BadRequestError } from "@app/lib/errors";
import { authRateLimit, readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { isAllowedRedirectUri, parseBasicAuthHeader } from "@app/services/oauth-client/oauth-client-fns";

const SanitizedOauthClientSchema = OauthClientsSchema.omit({ clientSecretHash: true });

const redirectUriSchema = z
  .string()
  .url()
  .refine(
    isAllowedRedirectUri,
    "Redirect URI must use https:// (http:// is only allowed for loopback addresses such as localhost)"
  );

export const registerOAuthRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/clients",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      operationId: "createOauthClient",
      body: z.object({
        name: z.string().trim().min(1).max(64),
        description: z.string().trim().max(256).optional(),
        redirectUris: redirectUriSchema.array().min(1),
        requirePkce: z.boolean().optional()
      }),
      response: {
        200: z.object({
          client: SanitizedOauthClientSchema,
          clientSecret: z.string()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { client, clientSecret } = await server.services.oauthClient.createOauthClient(req.body, req.permission);

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        event: {
          type: EventType.CREATE_OAUTH_CLIENT,
          metadata: {
            clientDbId: client.id,
            clientId: client.clientId,
            name: client.name
          }
        }
      });

      return { client, clientSecret };
    }
  });

  server.route({
    method: "GET",
    url: "/clients",
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listOauthClients",
      response: {
        200: z.object({
          clients: SanitizedOauthClientSchema.array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const clients = await server.services.oauthClient.listOauthClients(req.permission);
      return { clients };
    }
  });

  server.route({
    method: "GET",
    url: "/clients/:clientDbId",
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "getOauthClientById",
      params: z.object({
        clientDbId: z.string().uuid()
      }),
      response: {
        200: z.object({
          client: SanitizedOauthClientSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const client = await server.services.oauthClient.getOauthClientById(req.params.clientDbId, req.permission);
      return { client };
    }
  });

  server.route({
    method: "PATCH",
    url: "/clients/:clientDbId",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      operationId: "updateOauthClient",
      params: z.object({
        clientDbId: z.string().uuid()
      }),
      body: z.object({
        name: z.string().trim().min(1).max(64).optional(),
        description: z.string().trim().max(256).nullable().optional(),
        redirectUris: redirectUriSchema.array().min(1).optional(),
        requirePkce: z.boolean().optional()
      }),
      response: {
        200: z.object({
          client: SanitizedOauthClientSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const client = await server.services.oauthClient.updateOauthClient(
        { clientDbId: req.params.clientDbId, ...req.body },
        req.permission
      );

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        event: {
          type: EventType.UPDATE_OAUTH_CLIENT,
          metadata: {
            clientDbId: client.id,
            clientId: client.clientId,
            name: client.name
          }
        }
      });

      return { client };
    }
  });

  server.route({
    method: "POST",
    url: "/clients/:clientDbId/rotate-secret",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      operationId: "rotateOauthClientSecret",
      params: z.object({
        clientDbId: z.string().uuid()
      }),
      response: {
        200: z.object({
          client: SanitizedOauthClientSchema,
          clientSecret: z.string()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { client, clientSecret } = await server.services.oauthClient.rotateOauthClientSecret(
        req.params.clientDbId,
        req.permission
      );

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        event: {
          type: EventType.ROTATE_OAUTH_CLIENT_SECRET,
          metadata: {
            clientDbId: client.id,
            clientId: client.clientId,
            name: client.name
          }
        }
      });

      return { client, clientSecret };
    }
  });

  server.route({
    method: "DELETE",
    url: "/clients/:clientDbId",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      operationId: "deleteOauthClient",
      params: z.object({
        clientDbId: z.string().uuid()
      }),
      response: {
        200: z.object({
          client: SanitizedOauthClientSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const client = await server.services.oauthClient.deleteOauthClient(req.params.clientDbId, req.permission);

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        event: {
          type: EventType.DELETE_OAUTH_CLIENT,
          metadata: {
            clientDbId: client.id,
            clientId: client.clientId,
            name: client.name
          }
        }
      });

      return { client };
    }
  });

  server.route({
    method: "GET",
    url: "/authorize",
    config: {
      rateLimit: authRateLimit
    },
    schema: {
      querystring: z.object({
        response_type: z.literal("code"),
        client_id: z.string(),
        redirect_uri: z.string().url(),
        state: z.string().optional(),
        code_challenge: z.string().optional(),
        code_challenge_method: z.enum(["S256"]).optional(),
        scope: z.string().optional()
      })
    },
    handler: async (req, res) => {
      // Validates client + redirect URI before redirecting (never redirect to an
      // unregistered URI per RFC 6749 §3.1.2.4)
      const info = await server.services.oauthClient.getAuthorizeInfo({
        clientId: req.query.client_id,
        redirectUri: req.query.redirect_uri
      });

      // Surface the PKCE requirement up front rather than after the user has consented
      if (info.requirePkce && !req.query.code_challenge) {
        throw new BadRequestError({ message: "This OAuth client requires PKCE (code_challenge is missing)" });
      }

      const query = new URLSearchParams(
        Object.entries(req.query).filter(([, value]) => value !== undefined)
      ).toString();

      void res.redirect(`/organization/oauth-consent?${query}`);
    }
  });

  server.route({
    method: "GET",
    url: "/authorize/info",
    config: {
      rateLimit: readLimit
    },
    schema: {
      querystring: z.object({
        client_id: z.string(),
        redirect_uri: z.string().url(),
        scope: z.string().optional()
      }),
      response: {
        200: z.object({
          clientName: z.string(),
          clientDescription: z.string().nullable().optional(),
          requirePkce: z.boolean(),
          requestedScopes: z.object({ scope: z.string(), description: z.string() }).array()
        })
      }
    },
    handler: async (req) => {
      const info = await server.services.oauthClient.getAuthorizeInfo({
        clientId: req.query.client_id,
        redirectUri: req.query.redirect_uri,
        scope: req.query.scope
      });

      return {
        clientName: info.clientName,
        clientDescription: info.clientDescription,
        requirePkce: info.requirePkce,
        requestedScopes: info.requestedScopes
      };
    }
  });

  server.route({
    method: "POST",
    url: "/authorize/consent",
    config: {
      rateLimit: authRateLimit
    },
    schema: {
      body: z.object({
        client_id: z.string(),
        redirect_uri: z.string().url(),
        state: z.string().optional(),
        code_challenge: z.string().optional(),
        code_challenge_method: z.enum(["S256"]).optional(),
        scope: z.string().optional()
      }),
      response: {
        200: z.object({
          callbackUrl: z.string()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      if (req.auth.authMode !== AuthMode.JWT) throw new BadRequestError({ message: "Invalid auth mode" });

      const { callbackUrl, clientName, orgId } = await server.services.oauthClient.authorizeConsent({
        clientId: req.body.client_id,
        redirectUri: req.body.redirect_uri,
        state: req.body.state,
        codeChallenge: req.body.code_challenge,
        codeChallengeMethod: req.body.code_challenge_method,
        scope: req.body.scope,
        userId: req.auth.userId,
        authMethod: req.auth.authMethod,
        isMfaVerified: req.auth.isMfaVerified,
        mfaMethod: req.auth.mfaMethod,
        ip: req.realIp
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId,
        event: {
          type: EventType.OAUTH_CLIENT_AUTHORIZE,
          metadata: {
            clientId: req.body.client_id,
            clientName
          }
        }
      });

      return { callbackUrl };
    }
  });

  server.route({
    method: "POST",
    url: "/token",
    config: {
      rateLimit: authRateLimit
    },
    schema: {
      body: z.object({
        grant_type: z.enum(["authorization_code", "refresh_token"]),
        code: z.string().optional(),
        redirect_uri: z.string().optional(),
        code_verifier: z.string().optional(),
        refresh_token: z.string().optional(),
        client_id: z.string().optional(),
        client_secret: z.string().optional()
      }),
      response: {
        200: z.object({
          access_token: z.string(),
          token_type: z.string(),
          expires_in: z.number(),
          refresh_token: z.string(),
          scope: z.string()
        })
      }
    },
    handler: async (req, res) => {
      const basicAuth = parseBasicAuthHeader(req.headers.authorization);
      const clientId = basicAuth?.clientId ?? req.body.client_id;
      const clientSecret = basicAuth?.clientSecret ?? req.body.client_secret;

      void res.header("Cache-Control", "no-store");
      void res.header("Pragma", "no-cache");

      if (req.body.grant_type === "authorization_code") {
        if (!req.body.code) throw new BadRequestError({ message: "Missing authorization code" });

        return server.services.oauthClient.exchangeToken({
          grantType: "authorization_code",
          code: req.body.code,
          redirectUri: req.body.redirect_uri,
          codeVerifier: req.body.code_verifier,
          clientId,
          clientSecret
        });
      }

      if (!req.body.refresh_token) throw new BadRequestError({ message: "Missing refresh token" });

      return server.services.oauthClient.exchangeToken({
        grantType: "refresh_token",
        refreshToken: req.body.refresh_token,
        clientId,
        clientSecret
      });
    }
  });

  server.route({
    method: "GET",
    url: "/validate",
    config: {
      rateLimit: authRateLimit
    },
    schema: {
      response: {
        200: z.object({
          active: z.literal(true)
        })
      }
    },
    // Token introspection for OAuth clients: accepts the delegated OAuth access token. Reaching the
    // handler means injectIdentity already verified the signature and the underlying session.
    onRequest: verifyAuth([AuthMode.OAUTH]),
    handler: () => ({ active: true as const })
  });
};
