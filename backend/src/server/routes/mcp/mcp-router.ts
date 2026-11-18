import { createMcpHandler } from "@modelcontextprotocol/server";
import { FastifyRequest } from "fastify";
import jwt from "jsonwebtoken";
import { z } from "zod";

import { UnauthorizedError } from "@app/lib/errors";
import { publicJwksLimit, secretsLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { getMcpOauthUrls, MCP_ENDPOINT_PATH } from "@app/services/oauth-client/oauth-client-fns";
import { OauthScope } from "@app/services/oauth-client/oauth-scope";

import { createMcpServer } from "./mcp-tools";

const toWebRequest = (req: FastifyRequest, url: string) => {
  const headers = new Headers();
  Object.entries(req.headers).forEach(([name, value]) => {
    // The body is handed over already parsed, so its framing headers no longer describe anything.
    if (name === "content-length" || name === "transfer-encoding") return;
    [value ?? []].flat().forEach((item) => headers.append(name, item));
  });

  return new Request(url, { method: req.method, headers });
};

// RFC 9728 metadata naming the server that issues tokens for the MCP endpoint. Registered at the root: clients look
// for it there by putting the well-known path in front of the endpoint's path, without waiting for a 401 to point to it.
export const registerMcpResourceMetadataRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: MCP_ENDPOINT_PATH,
    config: {
      rateLimit: publicJwksLimit
    },
    schema: {
      operationId: "getMcpProtectedResourceMetadata",
      hide: true,
      response: {
        200: z.object({
          resource: z.string(),
          authorization_servers: z.string().array(),
          scopes_supported: z.string().array(),
          bearer_methods_supported: z.string().array()
        })
      }
    },
    handler: () => {
      const { issuer, mcpResource } = getMcpOauthUrls();
      return {
        resource: mcpResource,
        authorization_servers: [issuer],
        scopes_supported: Object.values(OauthScope),
        bearer_methods_supported: ["header"]
      };
    }
  });
};

// The MCP endpoint (Streamable HTTP), shaped by the MCP spec rather than REST: every message is a JSON-RPC POST to one
// URL and the SDK validates it. Each request is served by a fresh server, so any instance can answer any request.
export const registerMcpRouter = async (server: FastifyZodProvider) => {
  server.route({
    // GET and DELETE are the old protocol's session operations; the SDK answers them with 405.
    method: ["GET", "POST", "DELETE"],
    url: "/",
    config: {
      rateLimit: secretsLimit
    },
    schema: {
      operationId: "mcpEndpoint",
      hide: true
    },
    // MCP clients sign in again on a 401 (RFC 6750), so an expired or malformed token is reported as one here rather
    // than as the 403 the rest of the API returns for it.
    errorHandler: (error) => {
      if (error instanceof jwt.JsonWebTokenError) {
        throw new UnauthorizedError({ message: "The access token is invalid or has expired.", error });
      }
      throw error;
    },
    // Tells a client where to sign in (RFC 9728), whichever check refused the request.
    onSend: async (_req, res, payload) => {
      if (res.statusCode === 401) {
        void res.header("WWW-Authenticate", `Bearer resource_metadata="${getMcpOauthUrls().mcpResourceMetadata}"`);
      }
      return payload;
    },
    onRequest: verifyAuth([AuthMode.OAUTH, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req, res) => {
      const { mcpResource } = getMcpOauthUrls();
      if (req.auth.authMode === AuthMode.OAUTH && req.auth.token.aud !== mcpResource) {
        throw new UnauthorizedError({
          message: "This token was not issued for the Infisical MCP server. Reconnect your MCP client to sign in again."
        });
      }

      const mcpHandler = createMcpHandler(() => createMcpServer(server, req), { responseMode: "json" });
      try {
        const response = await mcpHandler.fetch(toWebRequest(req, mcpResource), { parsedBody: req.body });
        response.headers.forEach((value, name) => {
          void res.header(name, value);
        });
        return await res.status(response.status).send(await response.text());
      } finally {
        await mcpHandler.close();
      }
    }
  });
};
