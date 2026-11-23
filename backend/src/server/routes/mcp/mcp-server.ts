import { McpServer } from "@modelcontextprotocol/server";
import { FastifyRequest } from "fastify";

import { OauthScope } from "@app/services/oauth-client/oauth-scope";

import { createMcpToolContext, TMcpToolContext } from "./mcp-tool-fns";
import { registerSecretManagerTools } from "./tools/secret-manager";

// Each product registers its tools in its own file under tools/. They are registered only when the connection was
// granted one of the product's scopes, so a client lists only the tools the user consented to.
const PRODUCT_TOOLS: { scopes: OauthScope[]; register: (ctx: TMcpToolContext) => void }[] = [
  {
    scopes: [OauthScope.SecretsDescribe, OauthScope.SecretsRead, OauthScope.SecretsWrite],
    register: registerSecretManagerTools
  }
];

// One server per request, holding the caller's identity.
export const createMcpServer = (server: FastifyZodProvider, req: FastifyRequest, scopes: string[]) => {
  const mcpServer = new McpServer(
    { name: "infisical", version: "1.0.0" },
    {
      instructions: "Call list-projects first to find project IDs and environment slugs.",
      // A token's tools never change, so clients have no list changes to subscribe to.
      capabilities: { tools: { listChanged: false } }
    }
  );

  const ctx = createMcpToolContext(server, req, mcpServer, scopes);
  PRODUCT_TOOLS.filter((product) => product.scopes.some((scope) => scopes.includes(scope))).forEach((product) =>
    product.register(ctx)
  );

  return mcpServer;
};
