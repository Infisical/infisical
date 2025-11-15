import { z } from "zod";

import { writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerPamMcpRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/oauth/register",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      body: z.object({
        redirect_uris: z.array(z.string()),
        token_endpoint_auth_method: z.string(),
        grant_types: z.array(z.string()),
        response_types: z.array(z.string()),
        client_name: z.string(),
        client_uri: z.string()
      }),
      response: {
        200: z.object({
          client_id: z.string(),
          redirect_uris: z.array(z.string()),
          client_name: z.string(),
          client_uri: z.string(),
          grant_types: z.array(z.string()),
          response_types: z.array(z.string()),
          token_endpoint_auth_method: z.string(),
          client_id_issued_at: z.number()
        })
      }
    },
    handler: async (req) => {
      const payload = await server.services.pamMcp.oauthRegisterClient(req.body);
      return payload;
    }
  });

  // CORS preflight for OAuth client registration
  server.route({
    method: "GET",
    url: "/oauth/authorize",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      querystring: z.object({
        response_type: z.string(),
        client_id: z.string(),
        code_challenge: z.string(),
        code_challenge_method: z.enum(["S256"]),
        redirect_uri: z.string(),
        scope: z.string(),
        resource: z.string()
      })
    },
    handler: async (req, res) => {
      await server.services.pamMcp.oauthAuthorizeClient({ clientId: req.query.client_id });
      const query = new URLSearchParams(req.query).toString();
      void res.redirect(`/organization/mcp-scope?${query}`);
    }
  });

  server.route({
    method: "POST",
    url: "/oauth/select-mcp-scope",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      body: z.object({
        response_type: z.string(),
        client_id: z.string(),
        code_challenge: z.string(),
        code_challenge_method: z.enum(["S256"]),
        redirect_uri: z.string(),
        scope: z.string(),
        resource: z.string(),
        projectId: z.string(),
        state: z.string().optional()
      }),
      response: {
        200: z.object({
          callbackUrl: z.string()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const redirectUri = await server.services.pamMcp.oauthAuthorizeClientScope({
        clientId: req.body.client_id,
        codeChallenge: req.body.code_challenge,
        codeChallengeMethod: req.body.code_challenge_method,
        permission: req.permission,
        projectId: req.body.projectId,
        redirectUri: req.body.redirect_uri,
        resource: req.body.resource,
        responseType: req.body.response_type,
        scope: req.body.scope,
        state: req.body.state,
        tokenId: req.auth.authMode === AuthMode.JWT ? req.auth.tokenVersionId : ""
      });
      return { callbackUrl: redirectUri.toString() };
    }
  });

  server.route({
    method: "POST",
    url: "/oauth/token",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      body: z.union([
        z.object({
          grant_type: z.literal("authorization_code"),
          code: z.string(),
          redirect_uri: z.string().url(),
          code_verifier: z.string(),
          client_id: z.string()
        }),
        z.object({
          grant_type: z.literal("refresh_token"),
          refresh_token: z.string(),
          client_id: z.string()
        })
      ]),
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
    handler: async (req) => {
      const payload = await server.services.pamMcp.oauthTokenExchange(req.body);
      return payload;
    }
  });
};
