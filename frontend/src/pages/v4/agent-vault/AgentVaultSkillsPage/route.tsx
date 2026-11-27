import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";

import { agentVaultCreateIntentSearchParams } from "@app/hooks/useAgentVaultCreateIntent";
import { agentVaultSkillSheetSearchParams } from "@app/hooks/useAgentVaultSheetState";

import { AgentVaultSkillsPage } from "./AgentVaultSkillsPage";

export const Route = createFileRoute(
  "/v4/organizations/$orgId/projects/agent-vault/$projectId/skills"
)({
  staticData: {
    readiness: "full"
  },
  component: AgentVaultSkillsPage,
  validateSearch: zodValidator(
    agentVaultCreateIntentSearchParams.merge(agentVaultSkillSheetSearchParams)
  ),
  errorComponent: lazyRouteComponent(() => import("../../V4ErrorPage"), "V4ErrorPage")
});
