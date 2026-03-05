import { createFileRoute } from "@tanstack/react-router";

import { ProjectsPage } from "./ProjectsPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects"
)({
  component: ProjectsPage,
  context: () => ({
    breadcrumbs: [
      {
        label: "Projects"
      }
    ]
  })
});
