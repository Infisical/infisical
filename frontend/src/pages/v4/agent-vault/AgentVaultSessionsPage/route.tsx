import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";

import { agentVaultCreateIntentSearchParams } from "@app/hooks/useAgentVaultCreateIntent";
import { agentVaultSheetSearchParams } from "@app/hooks/useAgentVaultSheetState";

import { AgentVaultSessionsPage } from "./AgentVaultSessionsPage";

export const Route = createFileRoute(
  "/v4/organizations/$orgId/projects/agent-vault/$projectId/sessions"
)({
  component: AgentVaultSessionsPage,
  validateSearch: zodValidator(
    agentVaultSheetSearchParams.merge(agentVaultCreateIntentSearchParams)
  )
});
