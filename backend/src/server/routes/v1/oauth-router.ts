import { z } from "zod";

import { OauthClientsSchema } from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { BadRequestError } from "@app/lib/errors";
import { authRateLimit, readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { isAllowedRedirectUri, parseBasicAuthHeader } from "@app/services/oauth-client/oauth-client-fns";
import {
  ACCEPTED_SUBJECT_TOKEN_TYPES,
  DEFAULT_OAUTH_ACCESS_TOKEN_TTL_SECONDS,
  DEFAULT_OAUTH_GRANT_TYPES,
  MAX_OAUTH_ACCESS_TOKEN_TTL_SECONDS,
  MIN_OAUTH_ACCESS_TOKEN_TTL_SECONDS,
  OauthGrantType,
  OauthTokenType
} from "@app/services/oauth-client/oauth-client-types";
import { OauthTokenError, OauthTokenErrorCode, toOauthTokenError } from "@app/services/oauth-client/oauth-token-error";

const SanitizedOauthClientSchema = OauthClientsSchema.omit({ clientSecretHash: true });

const redirectUriSchema = z
  .string()
  .url()
  .refine(
    isAllowedRedirectUri,
    "Redirect URI must use https:// (http:// is only allowed for loopback addresses such as localhost)"
  );

const grantTypesSchema = z
  .nativeEnum(OauthGrantType)
  .array()
  .min(1)
  .max(32)
  .refine((grantTypes) => new Set(grantTypes).size === grantTypes.length, {
    message: "Grant types must not contain duplicate values"
  })
  .describe(
    "The OAuth grant types this application may use. An application uses either the redirect flow (authorization_code, optionally with refresh_token) or the token-exchange grant. Redirect URIs apply only to authorization_code; the token exchange audience applies only to the token-exchange grant."
  );

const tokenExchangeAudienceSchema = z
  .string()
  .trim()
  .min(1)
  .max(255)
  .describe("The expected 'aud' claim of subject tokens presented to the token exchange grant.");

const accessTokenTtlSchema = z
  .number()
  .int()
  .min(MIN_OAUTH_ACCESS_TOKEN_TTL_SECONDS)
  .max(MAX_OAUTH_ACCESS_TOKEN_TTL_SECONDS)
  .describe(
    "How long, in seconds, the access tokens this application issues stay valid. Cannot exceed the instance's login session lifetime. The organization's session length still applies on top, so the issued token's 'expires_in' is the shorter of the two."
  );

const tokenExchangeIdpSatisfiesMfaSchema = z
  .boolean()
  .describe(
    "Declares that authentication at the identity provider satisfies this organization's MFA requirement. Required for token exchange in an organization that enforces MFA."
  );

// The zod validator compiler hands Fastify the raw ZodError, whose `message` is the whole issue list
// stringified as JSON. Summarise it instead, so error_description names the offending fields.
const describeValidationError = (error: Error) => {
  if (!(error instanceof z.ZodError)) return error.message;

  return error.issues
    .map((issue) => (issue.path.length ? `${issue.path.join(".")}: ${issue.message}` : issue.message))
    .join("; ");
};

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
        grantTypes: grantTypesSchema.default([...DEFAULT_OAUTH_GRANT_TYPES]),
        redirectUris: redirectUriSchema.array().max(32).default([]),
        requirePkce: z.boolean().optional(),
        accessTokenTTL: accessTokenTtlSchema.default(DEFAULT_OAUTH_ACCESS_TOKEN_TTL_SECONDS),
        tokenExchangeAudience: tokenExchangeAudienceSchema.optional(),
        tokenExchangeIdpSatisfiesMfa: tokenExchangeIdpSatisfiesMfaSchema.optional()
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
            name: client.name,
            grantTypes: client.grantTypes,
            accessTokenTTL: client.accessTokenTTL,
            tokenExchangeAudience: client.tokenExchangeAudience,
            tokenExchangeIdpSatisfiesMfa: client.tokenExchangeIdpSatisfiesMfa
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
        grantTypes: grantTypesSchema.optional(),
        redirectUris: redirectUriSchema.array().max(32).optional(),
        requirePkce: z.boolean().optional(),
        accessTokenTTL: accessTokenTtlSchema.optional(),
        tokenExchangeAudience: tokenExchangeAudienceSchema.nullable().optional(),
        tokenExchangeIdpSatisfiesMfa: tokenExchangeIdpSatisfiesMfaSchema.optional()
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
            name: client.name,
            grantTypes: client.grantTypes,
            accessTokenTTL: client.accessTokenTTL,
            tokenExchangeAudience: client.tokenExchangeAudience,
            tokenExchangeIdpSatisfiesMfa: client.tokenExchangeIdpSatisfiesMfa
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
    attachValidation: true,
    schema: {
      body: z.object({
        grant_type: z.nativeEnum(OauthGrantType),
        code: z.string().max(256).optional(),
        redirect_uri: z.string().max(2048).optional(),
        code_verifier: z.string().max(256).optional(),
        refresh_token: z.string().max(8192).optional(),
        client_id: z.string().max(256).optional(),
        client_secret: z.string().max(256).optional(),
        subject_token: z.string().max(8192).optional(),
        subject_token_type: z.nativeEnum(OauthTokenType).optional(),
        requested_token_type: z.nativeEnum(OauthTokenType).optional(),
        actor_token: z.string().max(8192).optional(),
        actor_token_type: z.string().max(255).optional(),
        audience: z.string().max(255).optional(),
        resource: z.string().max(2048).optional(),
        scope: z.string().max(2048).optional()
      }),
      response: {
        200: z.object({
          access_token: z.string(),
          token_type: z.string(),
          expires_in: z.number(),
          refresh_token: z.string().optional(),
          scope: z.string().optional(),
          issued_token_type: z.nativeEnum(OauthTokenType).optional()
        })
      }
    },
    handler: async (req, res) => {
      void res.header("Cache-Control", "no-store");
      void res.header("Pragma", "no-cache");

      if (req.validationError) {
        const grantType = (req.body as { grant_type?: unknown } | undefined)?.grant_type;
        const isKnownGrantType =
          typeof grantType === "string" && Object.values(OauthGrantType).includes(grantType as OauthGrantType);

        throw new OauthTokenError({
          code: isKnownGrantType ? OauthTokenErrorCode.InvalidRequest : OauthTokenErrorCode.UnsupportedGrantType,
          message: isKnownGrantType
            ? describeValidationError(req.validationError)
            : `Unsupported 'grant_type'. Supported values are: ${Object.values(OauthGrantType).join(", ")}`
        });
      }

      const basicAuth = parseBasicAuthHeader(req.headers.authorization);
      const clientId = basicAuth?.clientId ?? req.body.client_id;
      const clientSecret = basicAuth?.clientSecret ?? req.body.client_secret;

      try {
        if (req.body.grant_type === OauthGrantType.AuthorizationCode) {
          if (!req.body.code) throw new BadRequestError({ message: "Missing authorization code" });

          return await server.services.oauthClient.exchangeToken({
            grantType: OauthGrantType.AuthorizationCode,
            code: req.body.code,
            redirectUri: req.body.redirect_uri,
            codeVerifier: req.body.code_verifier,
            clientId,
            clientSecret
          });
        }

        if (req.body.grant_type === OauthGrantType.TokenExchange) {
          if (!req.body.subject_token) {
            throw new BadRequestError({ message: "Missing 'subject_token'" });
          }

          if (!req.body.subject_token_type) {
            throw new BadRequestError({ message: "Missing 'subject_token_type'" });
          }

          if (!ACCEPTED_SUBJECT_TOKEN_TYPES.includes(req.body.subject_token_type)) {
            throw new BadRequestError({
              message: `Unsupported 'subject_token_type'. Supported values are: ${ACCEPTED_SUBJECT_TOKEN_TYPES.join(", ")}`
            });
          }

          if (req.body.requested_token_type && req.body.requested_token_type !== OauthTokenType.AccessToken) {
            throw new BadRequestError({
              message: `Unsupported 'requested_token_type'. Only '${OauthTokenType.AccessToken}' can be issued.`
            });
          }

          if (req.body.actor_token || req.body.actor_token_type) {
            throw new BadRequestError({
              message:
                "The 'actor_token' and 'actor_token_type' parameters are not supported. This grant issues a token that acts as the user in the subject token, and does not record the application as a separate acting party."
            });
          }

          if (req.body.scope) {
            throw new OauthTokenError({
              code: OauthTokenErrorCode.InvalidScope,
              message:
                "The 'scope' parameter is not supported on the token exchange grant. The issued token carries the user's own permissions."
            });
          }

          if (req.body.audience || req.body.resource) {
            throw new OauthTokenError({
              code: OauthTokenErrorCode.InvalidTarget,
              message:
                "The 'audience' and 'resource' parameters are not supported. The expected subject token audience is configured on the application."
            });
          }

          return await server.services.oauthClient.exchangeToken({
            grantType: OauthGrantType.TokenExchange,
            subjectToken: req.body.subject_token,
            clientId,
            clientSecret,
            ip: req.realIp,
            userAgent: req.headers["user-agent"]
          });
        }

        if (!req.body.refresh_token) throw new BadRequestError({ message: "Missing refresh token" });

        return await server.services.oauthClient.exchangeToken({
          grantType: OauthGrantType.RefreshToken,
          refreshToken: req.body.refresh_token,
          clientId,
          clientSecret
        });
      } catch (error) {
        const tokenError = toOauthTokenError(error, req.body.grant_type);
        if (tokenError !== error && tokenError.oauthErrorCode === OauthTokenErrorCode.ServerError) {
          req.log.error(error, "OAuth token request failed unexpectedly");
        }

        throw tokenError;
      }
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
