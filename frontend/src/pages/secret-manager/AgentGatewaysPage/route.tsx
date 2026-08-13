import { createFileRoute } from "@tanstack/react-router";

import { AgentGatewaysPage } from "./AgentGatewaysPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/secret-management/$projectId/_secret-manager-layout/agent-gateways/"
)({
  component: AgentGatewaysPage,
  beforeLoad: ({ context }) => {
    return {
      breadcrumbs: [...context.breadcrumbs, { label: "Agent Gateways" }]
    };
  }
});
