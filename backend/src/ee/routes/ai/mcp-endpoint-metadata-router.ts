import { z } from "zod";

import { getConfig } from "@app/lib/config/env";
import { removeTrailingSlash } from "@app/lib/fn";
import { readLimit } from "@app/server/config/rateLimiter";

const getMcpUrls = (siteUrl: string, endpointId: string) => {
  // The MCP resource/connect URL
  const resourceUrl = `${siteUrl}/api/v1/ai/mcp-endpoints/${endpointId}/connect`;
  // The authorization server issuer (RFC 8414: metadata at /.well-known/oauth-authorization-server/{path})
  const authServerIssuer = `${siteUrl}/mcp-endpoints/${endpointId}`;

  // OAuth endpoint URLs
  const apiBaseUrl = `${siteUrl}/api/v1/ai/mcp-endpoints/${endpointId}`;
  const tokenEndpointUrl = `${apiBaseUrl}/oauth/token`;
  const authorizeEndpointUrl = `${apiBaseUrl}/oauth/authorize`;
  const registrationEndpointUrl = `${apiBaseUrl}/oauth/register`;

  return {
    resourceUrl,
    authServerIssuer,
    tokenEndpointUrl,
    authorizeEndpointUrl,
    registrationEndpointUrl
  };
};

export const registerMcpEndpointMetadataRouter = async (server: FastifyZodProvider) => {
  const appCfg = getConfig();
  const siteUrl = removeTrailingSlash(appCfg.SITE_URL || "");
  if (!siteUrl) {
    return; // SITE_URL not configured, skip MCP endpoint metadata registration
  }

  const siteHost = new URL(siteUrl).host;
  const scopeAccess = `https://${siteHost}/mcp:access`;

  // OAuth 2.1: Protected Resource metadata
  // GET /mcp-endpoints/:endpointId/.well-known/oauth-protected-resource
  server.route({
    method: "GET",
    url: "/:endpointId/.well-known/oauth-protected-resource",
    config: {
      rateLimit: readLimit
    },
    schema: {
      params: z.object({
        endpointId: z.string().trim().min(1)
      })
    },
    handler: async (req, reply) => {
      const { resourceUrl, authServerIssuer } = getMcpUrls(siteUrl, req.params.endpointId);
      return reply.send({
        resource: resourceUrl,
        authorization_servers: [authServerIssuer],
        scopes_supported: ["openid", scopeAccess],
        bearer_methods_supported: ["header"]
      });
    }
  });
};

// RFC 8414 compliant OAuth Authorization Server metadata
// GET /.well-known/oauth-authorization-server/mcp-endpoints/:endpointId
export const registerMcpEndpointAuthServerMetadataRouter = async (server: FastifyZodProvider) => {
  const appCfg = getConfig();
  const siteUrl = removeTrailingSlash(appCfg.SITE_URL || "");
  if (!siteUrl) {
    return; // SITE_URL not configured, skip MCP auth server metadata registration
  }
  const siteHost = new URL(siteUrl).host;
  const scopeAccess = `https://${siteHost}/mcp:access`;

  server.route({
    method: "GET",
    url: "/mcp-endpoints/:endpointId",
    schema: {
      params: z.object({
        endpointId: z.string().trim().min(1)
      })
    },
    config: {
      rateLimit: readLimit
    },
    handler: async (req, reply) => {
      const { authServerIssuer, authorizeEndpointUrl, tokenEndpointUrl, registrationEndpointUrl } = getMcpUrls(
        siteUrl,
        req.params.endpointId
      );

      return reply.send({
        issuer: authServerIssuer,
        authorization_endpoint: authorizeEndpointUrl,
        token_endpoint: tokenEndpointUrl,
        registration_endpoint: registrationEndpointUrl,
        response_types_supported: ["code"],
        grant_types_supported: ["authorization_code"],
        code_challenge_methods_supported: ["S256"],
        token_endpoint_auth_methods_supported: ["none"],
        scopes_supported: ["openid", scopeAccess]
      });
    }
  });
};
