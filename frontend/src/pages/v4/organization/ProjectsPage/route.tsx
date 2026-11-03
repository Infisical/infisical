import { createFileRoute } from "@tanstack/react-router";

import { V4PageLoader } from "../../V4PageLoader";
import { ProjectsPage } from "./ProjectsPage";

export const Route = createFileRoute("/v4/organizations/$orgId/projects")({
  component: ProjectsPage,
  pendingComponent: V4PageLoader
});
