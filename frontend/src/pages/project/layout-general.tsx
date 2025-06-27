import { createFileRoute } from "@tanstack/react-router";

import { ProjectGeneralLayout } from "@app/layouts/ProjectGeneralLayout";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/projects/$projectId/_project-layout/_project-general-layout"
)({
  component: ProjectGeneralLayout
});
