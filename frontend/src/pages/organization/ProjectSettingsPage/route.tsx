import { createFileRoute } from "@tanstack/react-router";

import { ProjectSettingsPage } from "./ProjectSettingsPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/secret-management/project-settings/"
)({
  component: ProjectSettingsPage,
  context: () => ({
    breadcrumbs: [
      {
        label: "Project Settings"
      }
    ]
  })
});
