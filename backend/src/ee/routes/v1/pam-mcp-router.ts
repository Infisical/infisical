import { FastifyReply, FastifyRequest, HookHandlerDoneFunction } from "fastify";
import { z } from "zod";

import { getConfig } from "@app/lib/config/env";
import { logger } from "@app/lib/logger";
import { writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

const sendWwwAuthenticate = (reply: FastifyReply, description?: string) => {
  const appCfg = getConfig();
  const protectedResourceMetadataUrl = `${appCfg.SITE_URL}/.well-known/oauth-protected-resource`;
  let header = `Bearer resource_metadata="${protectedResourceMetadataUrl}", scope="openid"`;
  if (description) header = `${header}, error_description="${description}"`;
  void reply.header("WWW-Authenticate", header);
};

// Custom onRequest hook to enforce auth while returning proper WWW-Authenticate hint for MCP clients
const requireMcpAuthHook = (req: FastifyRequest, reply: FastifyReply, done: HookHandlerDoneFunction) => {
  const { auth } = req;
  if (!auth) {
    sendWwwAuthenticate(reply, "Missing authorization header");
    void reply.status(401).send();
    return;
  }

  const allowed = auth.authMode === AuthMode.JWT;
  if (!allowed) {
    void reply.status(403).send();
    return;
  }

  if (auth.authMode === AuthMode.JWT && !req.permission.orgId) {
    void reply.status(401).send({ message: "Unauthorized: organization context required" });
    return;
  }

  done();
};

export const registerPamMcpRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    config: {
      rateLimit: writeLimit
    },
    url: "/",
    onRequest: requireMcpAuthHook,
    handler: async (req, res) => {
      await res.hijack(); // allow manual control of the underlying res

      const { server: mcpServer, transport } = await server.services.pamMcp.interactWithMcp();

      // Close transport when client disconnects
      res.raw.on("close", () => {
        void transport.close().catch((err) => {
          logger.error(err, "Failed to close transport for pam mcp");
        });
      });

      await mcpServer.connect(transport);
      await transport.handleRequest(req.raw, res.raw, req.body);
    }
  });

  server.route({
    method: ["GET", "DELETE"],
    config: {
      rateLimit: writeLimit
    },
    url: "/",
    onRequest: requireMcpAuthHook,
    handler: async (_req, res) => {
      void res
        .status(405)
        .header("Allow", "POST")
        .send({
          jsonrpc: "2.0",
          error: {
            code: -32000,
            message: "Method not allowed"
          },
          id: null
        });
    }
  });

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
