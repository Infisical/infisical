import { createFileRoute, linkOptions } from "@tanstack/react-router";

import { MCPEndpointDetailPage } from "./MCPEndpointDetailPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/ai/$projectId/_ai-layout/mcp-endpoints/$endpointId"
)({
  component: MCPEndpointDetailPage,
  beforeLoad: ({ context, params }) => {
    return {
      breadcrumbs: [
        ...context.breadcrumbs,
        {
          label: "MCP Endpoints",
          link: linkOptions({
            to: "/organizations/$orgId/projects/ai/$projectId/overview",
            params: { orgId: params.orgId, projectId: params.projectId }
          })
        },
        {
          label: "Endpoint Details"
        }
      ]
    };
  }
});
