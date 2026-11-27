import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { agentVaultCreateIntentSearchParams } from "@app/hooks/useAgentVaultCreateIntent";

import { AgentVaultServicesPage } from "./AgentVaultServicesPage";

export const Route = createFileRoute(
  "/v4/organizations/$orgId/projects/agent-vault/$projectId/services"
)({
  staticData: { readiness: "full" },
  component: AgentVaultServicesPage,
  validateSearch: zodValidator(
    agentVaultCreateIntentSearchParams.extend({
      requiresSetup: z.boolean().optional().catch(undefined)
    })
  ),
  errorComponent: lazyRouteComponent(() => import("../../V4ErrorPage"), "V4ErrorPage")
});
