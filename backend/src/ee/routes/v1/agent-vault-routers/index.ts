import { registerAgentVaultAccessBundleRouter } from "./agent-vault-access-bundle-router";
import { registerAgentVaultDelegationRouter } from "./agent-vault-delegation-router";
import { registerAgentVaultMembershipRouter } from "./agent-vault-membership-router";
import { registerAgentVaultOauthRouter } from "./agent-vault-oauth-router";
import { registerAgentVaultProxyAgentRouter } from "./agent-vault-proxy-agent-router";
import { registerAgentVaultProxyRouter } from "./agent-vault-proxy-router";
import { recordBodyProjectId } from "./agent-vault-router-fns";
import { registerAgentVaultSessionLogRouter } from "./agent-vault-session-log-router";
import { registerAgentVaultSessionRouter } from "./agent-vault-session-router";
import { registerAgentVaultSessionTokenRouter } from "./agent-vault-session-token-router";
import { registerAgentVaultSettingsRouter } from "./agent-vault-settings-router";
import { registerAgentVaultSkillRouter } from "./agent-vault-skill-router";
import { registerAgentVaultVariableRouter } from "./agent-vault-variable-router";

export const registerAgentVaultRouters = async (server: FastifyZodProvider) => {
  server.addHook("preValidation", async (req) => {
    recordBodyProjectId(req);
  });

  await server.register(registerAgentVaultAccessBundleRouter, { prefix: "/access-bundles" });
  await server.register(registerAgentVaultVariableRouter, { prefix: "/variables" });
  await server.register(registerAgentVaultSkillRouter, { prefix: "/skills" });
  await server.register(
    async (sessionServer) => {
      await sessionServer.register(registerAgentVaultSessionRouter);
      await sessionServer.register(registerAgentVaultSessionLogRouter);
    },
    { prefix: "/sessions" }
  );
  await server.register(registerAgentVaultSessionTokenRouter, { prefix: "/session" });
  await server.register(registerAgentVaultSettingsRouter, { prefix: "/settings" });
  await server.register(registerAgentVaultProxyRouter, { prefix: "/proxies" });
  await server.register(registerAgentVaultMembershipRouter, { prefix: "/members" });
  await server.register(registerAgentVaultDelegationRouter, { prefix: "/delegations" });
  await server.register(registerAgentVaultOauthRouter, { prefix: "/oauth" });
  await server.register(registerAgentVaultProxyAgentRouter, { prefix: "/proxy" });
};
