import { registerAgentVaultAccessBundleRouter } from "./agent-vault-access-bundle-router";
import { registerAgentVaultMembershipRouter } from "./agent-vault-membership-router";
import { registerAgentVaultProjectRouter } from "./agent-vault-project-router";
import { registerAgentVaultProxyAgentRouter } from "./agent-vault-proxy-agent-router";
import { registerAgentVaultProxyRouter } from "./agent-vault-proxy-router";
import { registerAgentVaultSessionRouter } from "./agent-vault-session-router";

export const registerAgentVaultRouters = async (server: FastifyZodProvider) => {
  await server.register(registerAgentVaultProjectRouter, { prefix: "/project" });
  await server.register(registerAgentVaultAccessBundleRouter, { prefix: "/access-bundles" });
  await server.register(registerAgentVaultSessionRouter, { prefix: "/sessions" });
  await server.register(registerAgentVaultProxyRouter, { prefix: "/proxies" });
  await server.register(registerAgentVaultMembershipRouter, { prefix: "/memberships" });
  // Separate prefix so the preValidation project hook still matches while these routes authenticate as the proxy.
  await server.register(registerAgentVaultProxyAgentRouter, { prefix: "/proxy" });
};
