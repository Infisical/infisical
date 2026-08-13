import { createFileRoute } from "@tanstack/react-router";

import { AgentGatewayDetailsByIDPage } from "./AgentGatewayDetailsByIDPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/secret-management/$projectId/_secret-manager-layout/agent-gateways/$agentGatewayId"
)({
  component: AgentGatewayDetailsByIDPage,
  beforeLoad: ({ context }) => {
    return {
      breadcrumbs: [...context.breadcrumbs, { label: "Agent Gateways" }]
    };
  }
});
