import { registerAgentVaultAccessBundleRouter } from "./agent-vault-access-bundle-router";
import { registerAgentVaultAppConnectionRouter } from "./agent-vault-app-connection-router";
import { registerAgentVaultMembershipRouter } from "./agent-vault-membership-router";
import { registerAgentVaultProjectRouter } from "./agent-vault-project-router";
import { registerAgentVaultProxyAgentRouter } from "./agent-vault-proxy-agent-router";
import { registerAgentVaultProxyRouter } from "./agent-vault-proxy-router";
import { registerAgentVaultSessionLogRouter } from "./agent-vault-session-log-router";
import { registerAgentVaultSessionRouter } from "./agent-vault-session-router";
import { registerAgentVaultSettingsRouter } from "./agent-vault-settings-router";

export const registerAgentVaultRouters = async (server: FastifyZodProvider) => {
  await server.register(registerAgentVaultProjectRouter, { prefix: "/project" });
  await server.register(registerAgentVaultAccessBundleRouter, { prefix: "/access-bundles" });
  await server.register(
    async (sessionServer) => {
      await sessionServer.register(registerAgentVaultSessionRouter);
      await sessionServer.register(registerAgentVaultSessionLogRouter);
    },
    { prefix: "/sessions" }
  );
  await server.register(registerAgentVaultSettingsRouter, { prefix: "/settings" });
  await server.register(registerAgentVaultAppConnectionRouter, { prefix: "/app-connections/aws" });
  await server.register(registerAgentVaultProxyRouter, { prefix: "/proxies" });
  await server.register(registerAgentVaultMembershipRouter, { prefix: "/members" });
  // Separate prefix so the preValidation project hook still matches while these routes authenticate as the proxy.
  await server.register(registerAgentVaultProxyAgentRouter, { prefix: "/proxy" });
};
