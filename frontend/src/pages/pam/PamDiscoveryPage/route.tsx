import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { PamDiscoveryPage } from "./PamDiscoveryPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/pam/$projectId/_pam-layout/discovery/"
)({
  validateSearch: zodValidator(
    z.object({
      search: z.string().optional()
    })
  ),
  beforeLoad: ({ context }) => {
    return {
      breadcrumbs: [
        ...context.breadcrumbs,
        {
          label: "Discovery"
        }
      ]
    };
  },
  component: PamDiscoveryPage
});
