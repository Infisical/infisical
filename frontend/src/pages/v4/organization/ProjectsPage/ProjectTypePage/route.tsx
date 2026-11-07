import { createFileRoute } from "@tanstack/react-router";

import { ProjectTypePage } from "./ProjectTypePage";

export const Route = createFileRoute("/v4/organizations/$orgId/projects/$type/")({
  component: ProjectTypePage
});
