import { createFileRoute } from "@tanstack/react-router";

import { MCPPage } from "./MCPPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/ai/$projectId/_ai-layout/overview"
)({
  component: MCPPage,
  beforeLoad: ({ context }) => {
    return {
      breadcrumbs: [
        ...context.breadcrumbs,
        {
          label: "MCP"
        }
      ]
    };
  }
});
