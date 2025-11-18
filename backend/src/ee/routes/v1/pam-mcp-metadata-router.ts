import { getConfig } from "@app/lib/config/env";
import { removeTrailingSlash } from "@app/lib/fn";
import { readLimit } from "@app/server/config/rateLimiter";

const getMcpUrls = (siteUrl: string) => {
  const resourceBaseUrl = `${siteUrl}/api/v1/ai/mcp`;
  const protectedResourceMetadataUrl = `${siteUrl}/.well-known/oauth-protected-resource`;
  const tokenEndpointUrl = `${resourceBaseUrl}/oauth/token`;
  const authorizeEndpointUrl = `${resourceBaseUrl}/oauth/authorize`;
  const registrationEndpointUrl = `${resourceBaseUrl}/oauth/register`;

  return {
    resourceBaseUrl,
    protectedResourceMetadataUrl,
    tokenEndpointUrl,
    authorizeEndpointUrl,
    registrationEndpointUrl
  };
};

export const registerPamMcpMetadataRouter = async (server: FastifyZodProvider) => {
  const appCfg = getConfig();
  const siteUrl = removeTrailingSlash(appCfg.SITE_URL || "");
  const siteHost = new URL(siteUrl).host;
  const scopeAccess = `https://${siteHost}/mcp:access`;

  // OAuth 2.1: Protected Resource metadata
  server.route({
    method: "GET",
    url: "/.well-known/oauth-protected-resource",
    config: {
      rateLimit: readLimit
    },
    handler: async (_req, reply) => {
      return reply.send({
        resource: siteUrl,
        authorization_servers: [siteUrl],
        scopes_supported: ["openid", scopeAccess],
        bearer_methods_supported: ["header"]
      });
    }
  });

  // OAuth 2.1: Authorization Server metadata
  server.route({
    method: "GET",
    url: "/.well-known/oauth-authorization-server",
    config: {
      rateLimit: readLimit
    },
    handler: async (req, reply) => {
      const { authorizeEndpointUrl, tokenEndpointUrl, registrationEndpointUrl } = getMcpUrls(siteUrl);

      return reply.send({
        issuer: siteUrl,
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
