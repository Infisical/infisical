import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { DiscoveryPage } from "./DiscoveryPage";

const discoveryPageSearchSchema = z.object({
  selectedTab: z.string().optional().default("jobs")
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/cert-manager/$projectId/_cert-manager-layout/discovery/"
)({
  component: DiscoveryPage,
  validateSearch: zodValidator(discoveryPageSearchSchema),
  beforeLoad: ({ context }) => {
    return {
      breadcrumbs: [
        ...context.breadcrumbs,
        {
          label: "Certificate Discovery"
        }
      ]
    };
  }
});
