import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { OauthApplicationsPage } from "./OauthApplicationsPage";

// Tolerate a stray ?selectedTab carried over by old Settings/Integrations redirects, then strip it.
const OauthApplicationsPageQuerySchema = z.object({
  selectedTab: z.string().catch("")
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/oauth-applications"
)({
  component: OauthApplicationsPage,
  validateSearch: zodValidator(OauthApplicationsPageQuerySchema),
  search: {
    middlewares: [stripSearchParams({ selectedTab: "" })]
  },
  context: () => ({
    breadcrumbs: [
      {
        label: "OAuth Applications"
      }
    ]
  })
});
