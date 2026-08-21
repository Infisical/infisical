import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { ResourceOverviewPage } from "./ResourceOverviewPage";

const resourceOverviewSearchSchema = z.object({
  selectedTab: z.string().optional().default("organizations")
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/admin/_admin-layout/resources/overview"
)({
  component: ResourceOverviewPage,
  validateSearch: zodValidator(resourceOverviewSearchSchema),
  beforeLoad: async () => {
    return {
      breadcrumbs: [
        {
          label: "Admin",
          link: { to: "/admin" as const }
        },
        {
          label: "Resource Overview",
          link: { to: "/admin/resources/overview" as const }
        }
      ]
    };
  }
});
