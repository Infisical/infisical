import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { AgentVaultVariableScope } from "@app/hooks/api/agentVault/enums";
import { agentVaultCreateIntentSearchParams } from "@app/hooks/useAgentVaultCreateIntent";

import { AgentVaultVariablesPage } from "./AgentVaultVariablesPage";

export const Route = createFileRoute(
  "/v4/organizations/$orgId/projects/agent-vault/$projectId/variables"
)({
  staticData: {
    readiness: "full"
  },
  component: AgentVaultVariablesPage,
  validateSearch: zodValidator(
    agentVaultCreateIntentSearchParams.extend({
      selectedTab: z.nativeEnum(AgentVaultVariableScope).optional().catch(undefined)
    })
  ),
  errorComponent: lazyRouteComponent(() => import("../../V4ErrorPage"), "V4ErrorPage")
});
