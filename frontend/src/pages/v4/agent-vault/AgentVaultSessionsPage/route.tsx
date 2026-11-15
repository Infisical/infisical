import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";

import { agentVaultCreateIntentSearchParams } from "@app/hooks/useAgentVaultCreateIntent";
import { agentVaultSheetSearchParams } from "@app/hooks/useAgentVaultSheetState";

import { AgentVaultSessionsPage } from "./AgentVaultSessionsPage";

export const Route = createFileRoute(
  "/v4/organizations/$orgId/projects/agent-vault/$projectId/sessions"
)({
  staticData: {
    readiness: "partial",
    missing: [
      "Session logs",
      "Personal values setup from Create session",
      "Create machine identity from Create session"
    ]
  },
  component: AgentVaultSessionsPage,
  validateSearch: zodValidator(
    agentVaultSheetSearchParams.merge(agentVaultCreateIntentSearchParams)
  ),
  errorComponent: lazyRouteComponent(() => import("../../V4ErrorPage"), "V4ErrorPage")
});
