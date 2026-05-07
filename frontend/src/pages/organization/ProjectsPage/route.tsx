import { createFileRoute, redirect } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { apiRequest } from "@app/config/request";
import { clearLastProject } from "@app/helpers/lastProject";
import { getProjectHomePage } from "@app/helpers/project";
import { projectKeys } from "@app/hooks/api/projects/query-keys";
import { Project } from "@app/hooks/api/projects/types";

import { ProjectsPage } from "./ProjectsPage";

const searchSchema = z.object({
  projectRedirect: z.string().optional()
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects"
)({
  validateSearch: zodValidator(searchSchema),
  beforeLoad: async ({ context, search, params }) => {
    if (!search.projectRedirect) return;

    const projects = await context.queryClient
      .ensureQueryData({
        queryKey: projectKeys.getAllUserProjects(),
        queryFn: async () => {
          const { data } = await apiRequest.get<{ projects: Project[] }>("/api/v1/projects");
          return data.projects;
        }
      })
      .catch(() => [] as Project[]);

    const project = projects.find((p) => p.id === search.projectRedirect);
    if (project) {
      throw redirect({
        to: getProjectHomePage(project.type, project.environments),
        params: { orgId: params.orgId, projectId: project.id }
      });
    }

    if (context.user?.id) {
      clearLastProject(context.user.id, params.orgId);
    }
    throw redirect({
      to: "/organizations/$orgId/projects",
      params: { orgId: params.orgId },
      search: {}
    });
  },
  component: ProjectsPage,
  context: () => ({
    breadcrumbs: [
      {
        label: "Projects"
      }
    ]
  })
});
