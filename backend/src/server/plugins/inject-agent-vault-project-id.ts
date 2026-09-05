import { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";

const AGENT_VAULT_PREFIX = "/api/v1/agent-vault/";

export const injectAgentVaultProjectId: FastifyPluginAsync = fp(async (server) => {
  server.decorateRequest("internalAgentVaultProjectId", "");

  server.addHook("preValidation", async (req) => {
    if (!req.permission?.orgId) return;

    const routePath = req.routeOptions.url ?? "";
    if (!routePath.startsWith(AGENT_VAULT_PREFIX)) return;

    req.internalAgentVaultProjectId = await server.services.agentVaultProjectResolver.resolve(req.permission.orgId);
  });
});
