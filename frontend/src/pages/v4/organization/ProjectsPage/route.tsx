import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

import { ProjectsPage } from "./ProjectsPage";

export const Route = createFileRoute("/v4/organizations/$orgId/projects/")({
  component: ProjectsPage,
  errorComponent: lazyRouteComponent(() => import("../../V4ErrorPage"), "V4ErrorPage")
});
