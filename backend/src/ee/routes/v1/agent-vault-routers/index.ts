import { registerAgentVaultAccessBundleRouter } from "./agent-vault-access-bundle-router";
import { registerAgentVaultProjectRouter } from "./agent-vault-project-router";
import { registerAgentVaultSessionRouter } from "./agent-vault-session-router";

export const registerAgentVaultRouters = async (server: FastifyZodProvider) => {
  await server.register(registerAgentVaultProjectRouter, { prefix: "/project" });
  await server.register(registerAgentVaultAccessBundleRouter, { prefix: "/access-bundles" });
  await server.register(registerAgentVaultSessionRouter, { prefix: "/sessions" });
};
