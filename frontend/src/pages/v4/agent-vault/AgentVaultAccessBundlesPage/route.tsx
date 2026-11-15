import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";

import { agentVaultCreateIntentSearchParams } from "@app/hooks/useAgentVaultCreateIntent";

import { AgentVaultAccessBundlesPage } from "./AgentVaultAccessBundlesPage";

export const Route = createFileRoute(
  "/v4/organizations/$orgId/projects/agent-vault/$projectId/access-bundles/"
)({
  staticData: {
    readiness: "full"
  },
  component: AgentVaultAccessBundlesPage,
  validateSearch: zodValidator(agentVaultCreateIntentSearchParams),
  errorComponent: lazyRouteComponent(() => import("../../V4ErrorPage"), "V4ErrorPage")
});
