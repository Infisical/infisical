import { createFileRoute, linkOptions } from "@tanstack/react-router";

import { MCPServerDetailPage } from "./MCPServerDetailPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/ai/$projectId/_ai-layout/mcp-servers/$serverId"
)({
  component: MCPServerDetailPage,
  beforeLoad: ({ context, params }) => {
    return {
      breadcrumbs: [
        ...context.breadcrumbs,
        {
          label: "MCP Servers",
          link: linkOptions({
            to: "/organizations/$orgId/projects/ai/$projectId/overview",
            params: { orgId: params.orgId, projectId: params.projectId }
          })
        },
        {
          label: "Server Details"
        }
      ]
    };
  }
});
