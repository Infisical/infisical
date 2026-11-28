import { McpServer } from "@modelcontextprotocol/server";
import { FastifyRequest } from "fastify";

import { OauthScope } from "@app/services/oauth-client/oauth-scope";

import { createMcpToolContext, TMcpToolContext } from "./mcp-tool-fns";
import { registerSecretManagerTools } from "./tools/secret-manager";

// Each product registers its tools in its own file under tools/. They are registered only when the connection was
// granted one of the product's scopes, so a client lists only the tools the user consented to.
const PRODUCT_TOOLS: { scopes: OauthScope[]; instructions: string; register: (ctx: TMcpToolContext) => void }[] = [
  {
    scopes: [OauthScope.SecretsDescribe, OauthScope.SecretsRead, OauthScope.SecretsWrite],
    instructions:
      "Secrets Management: call list-projects first to find project IDs and environment slugs. Its access levels are Describe Only (secrets:describe, names without values), Read Only (secrets:read, adds values) and Full Access (secrets:write, adds changes).",
    register: registerSecretManagerTools
  }
];

const $getInstructions = (scopes: string[], productInstructions: string[]) =>
  [
    `This connection was granted these scopes: ${scopes.join(", ")}.`,
    ...productInstructions,
    "Only create, change or delete something when the user asked for it.",
    "If a tool is refused for lack of permission, tell the user why. Either this connection's access level doesn't cover the action, and they can reconnect and choose a broader one, or their Infisical role doesn't allow it, and an admin has to grant it."
  ].join("\n");

// One server per request, holding the caller's identity.
export const createMcpServer = (server: FastifyZodProvider, req: FastifyRequest, scopes: string[]) => {
  const products = PRODUCT_TOOLS.filter((product) => product.scopes.some((scope) => scopes.includes(scope)));

  const mcpServer = new McpServer(
    { name: "infisical", version: "1.0.0" },
    {
      instructions: $getInstructions(
        scopes,
        products.map((product) => product.instructions)
      ),
      // A token's tools never change, so clients have no list changes to subscribe to.
      capabilities: { tools: { listChanged: false } }
    }
  );

  const ctx = createMcpToolContext(server, req, mcpServer, scopes);
  products.forEach((product) => product.register(ctx));

  return mcpServer;
};
