import { registerAgentVaultAccessBundleRouter } from "./agent-vault-access-bundle-router";
import { registerAgentVaultActivityConfigRouter } from "./agent-vault-activity-config-router";
import { registerAgentVaultActivityRouter } from "./agent-vault-activity-router";
import { registerAgentVaultMembershipRouter } from "./agent-vault-membership-router";
import { registerAgentVaultProjectRouter } from "./agent-vault-project-router";
import { registerAgentVaultProxyAgentRouter } from "./agent-vault-proxy-agent-router";
import { registerAgentVaultProxyRouter } from "./agent-vault-proxy-router";
import { registerAgentVaultSessionRouter } from "./agent-vault-session-router";

export const registerAgentVaultRouters = async (server: FastifyZodProvider) => {
  await server.register(registerAgentVaultProjectRouter, { prefix: "/project" });
  await server.register(registerAgentVaultAccessBundleRouter, { prefix: "/access-bundles" });
  await server.register(registerAgentVaultSessionRouter, { prefix: "/sessions" });
  // A second plugin on the same prefix. The session router declares no hooks and no conflicting route,
  // so this keeps activity out of a file that is already long without inventing a new URL shape.
  await server.register(registerAgentVaultActivityRouter, { prefix: "/sessions" });
  await server.register(registerAgentVaultActivityConfigRouter, { prefix: "/activity" });
  await server.register(registerAgentVaultProxyRouter, { prefix: "/proxies" });
  await server.register(registerAgentVaultMembershipRouter, { prefix: "/members" });
  // Separate prefix so the preValidation project hook still matches while these routes authenticate as the proxy.
  await server.register(registerAgentVaultProxyAgentRouter, { prefix: "/proxy" });
};
