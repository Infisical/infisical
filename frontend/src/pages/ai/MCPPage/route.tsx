import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { MCPPage } from "./MCPPage";

const mcpPageSearchSchema = z.object({
  selectedTab: z.string().optional().default("mcp-endpoints")
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/ai/$projectId/_ai-layout/overview"
)({
  component: MCPPage,
  validateSearch: zodValidator(mcpPageSearchSchema),
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
