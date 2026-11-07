import { createFileRoute } from "@tanstack/react-router";

import { ProjectsPage } from "./ProjectsPage";

export const Route = createFileRoute("/v4/organizations/$orgId/projects/")({
  component: ProjectsPage
});
