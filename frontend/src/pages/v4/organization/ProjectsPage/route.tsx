import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

import { ProjectsPage } from "./ProjectsPage";

export const Route = createFileRoute("/v4/organizations/$orgId/projects")({
  component: ProjectsPage,
  pendingComponent: lazyRouteComponent(() => import("../../V4PageLoader"), "V4PageLoader")
});
