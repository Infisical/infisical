import { createFileRoute, linkOptions, useParams } from "@tanstack/react-router";

import { ProjectTemplatePage } from "./ProjectTemplatePage";

function RouteComponent() {
  const { templateId } = useParams({ strict: false });

  return <ProjectTemplatePage templateId={templateId as string} />;
}

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/secret-management/product-settings/project-templates/$templateId"
)({
  component: RouteComponent,
  context: ({ params }) => ({
    breadcrumbs: [
      {
        label: "Product Settings",
        link: linkOptions({
          to: "/organizations/$orgId/projects/secret-management/product-settings" as const,
          params
        })
      },
      {
        label: "Project Templates"
      }
    ]
  })
});
