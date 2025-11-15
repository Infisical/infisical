import { z } from "zod";

import { getConfig } from "@app/lib/config/env";
import { removeTrailingSlash } from "@app/lib/fn";
import { readLimit } from "@app/server/config/rateLimiter";

const getMcpUrls = (siteUrl: string, projectId: string) => {
  const resourceBaseUrl = `${siteUrl}/api/v1/ai/mcp/${projectId}`;
  const protectedResourceMetadataUrl = `${resourceBaseUrl}/.well-known/oauth-protected-resource`;
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

export const registerPamMcpRouter = async (server: FastifyZodProvider) => {
  const appCfg = getConfig();
  const siteUrl = removeTrailingSlash(appCfg.SITE_URL || "");
  const siteHost = new URL(siteUrl).host;
  const scopeAccess = `https://${siteHost}/mcp:access`;

  // CORS preflight for OAuth client registration
  server.route({
    method: "POST",
    url: "/oauth/register",
    config: {
      cors: false
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
};
