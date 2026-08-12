import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { AgentProxyPage } from "./AgentProxyPage";

const AgentProxyPageQueryParams = z.object({
  selectedTab: z.string().catch("agent-policies")
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/secret-management/$projectId/_secret-manager-layout/agent-proxy"
)({
  component: AgentProxyPage,
  validateSearch: zodValidator(AgentProxyPageQueryParams),
  search: {
    middlewares: [stripSearchParams({ selectedTab: "agent-policies" })]
  },
  beforeLoad: ({ context }) => {
    return {
      breadcrumbs: [
        ...context.breadcrumbs,
        {
          label: "Agent Proxy"
        }
      ]
    };
  }
});
