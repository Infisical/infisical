import { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";

import { ActorType } from "@app/services/auth/auth-type";

const AGENT_VAULT_PREFIX = "/api/v1/agent-vault/";

export const injectAgentVaultProjectId: FastifyPluginAsync = fp(async (server) => {
  server.decorateRequest("internalAgentVaultProjectId", "");

  server.addHook("preValidation", async (req) => {
    if (!req.permission?.orgId) return;

    // The proxy's own routes sit under this prefix but take their project from the proxy row or the
    // session, so resolving it here would be a Redis GET per heartbeat and per session resolve for a
    // value no handler reads. A proxy route that ever needs it has to resolve it itself.
    if (req.auth?.actor === ActorType.AGENT_VAULT_PROXY) return;

    const routePath = req.routeOptions.url ?? "";
    if (!routePath.startsWith(AGENT_VAULT_PREFIX)) return;

    req.internalAgentVaultProjectId = await server.services.agentVaultProjectResolver.resolve(req.permission.orgId);
  });
});
