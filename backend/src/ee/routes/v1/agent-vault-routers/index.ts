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
  // Singular: these are the proxy's own calls, not administration of proxies. Separate prefix so the
  // preValidation project hook (which matches /api/v1/agent-vault/) still resolves, while the routes
  // themselves authenticate as the proxy rather than as a person.
  await server.register(registerAgentVaultProxyAgentRouter, { prefix: "/proxy" });
};
