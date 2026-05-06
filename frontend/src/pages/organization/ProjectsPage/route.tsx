import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { ProjectsPage } from "./ProjectsPage";

const searchSchema = z.object({
  projectRedirect: z.string().optional()
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects"
)({
  component: ProjectsPage,
  validateSearch: zodValidator(searchSchema),
  context: () => ({
    breadcrumbs: [
      {
        label: "Projects"
      }
    ]
  })
});
