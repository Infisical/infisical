import { createFileRoute } from "@tanstack/react-router";

import { redirectToV4IfEnabled } from "@app/helpers/v4AppFlag";

import { ProjectsPage } from "./ProjectsPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects"
)({
  beforeLoad: ({ location, params }) =>
    location.pathname.replace(/\/$/, "") === `/organizations/${params.orgId}/projects`
      ? redirectToV4IfEnabled(location.href)
      : undefined,
  context: () => ({
    breadcrumbs: [
      {
        label: "Home"
      }
    ]
  }),
  component: ProjectsPage
});
