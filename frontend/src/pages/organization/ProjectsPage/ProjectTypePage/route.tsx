import { createFileRoute, redirect } from "@tanstack/react-router";

import { urlSlugToProjectType } from "@app/helpers/project";

import { ProjectTypePage } from "./ProjectTypePage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/$type"
)({
  component: ProjectTypePage,
  context: () => ({
    breadcrumbs: [
      {
        label: "Projects"
      }
    ]
  }),
  beforeLoad: ({ params }) => {
    if (!urlSlugToProjectType(params.type)) {
      throw redirect({
        to: "/organizations/$orgId/projects",
        params: { orgId: params.orgId }
      });
    }
  }
});
