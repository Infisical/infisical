import { createFileRoute, linkOptions } from "@tanstack/react-router";
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
          link: linkOptions({ to: "/admin" })
        },
        {
          label: "Resource Overview",
          link: linkOptions({
            to: "/admin/resources/overview"
          })
        }
      ]
    };
  }
});
