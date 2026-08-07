import { createFileRoute, linkOptions, useParams } from "@tanstack/react-router";

import { OrgPermissionActions, OrgPermissionSubjects } from "@app/context";
import { withPermission } from "@app/hoc";

import { ProjectTemplatePage } from "./ProjectTemplatePage";

const RouteComponent = withPermission(
  () => {
    const { templateId } = useParams({ strict: false });
    return <ProjectTemplatePage templateId={templateId as string} />;
  },
  {
    action: OrgPermissionActions.Read,
    subject: OrgPermissionSubjects.ProjectTemplates
  }
);

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/product-settings/$type/project-templates/$templateId"
)({
  component: RouteComponent,
  context: ({ params }) => ({
    breadcrumbs: [
      {
        label: "Product Settings",
        link: linkOptions({
          to: "/organizations/$orgId/projects/product-settings/$type",
          params
        })
      },
      { label: "Project Templates" }
    ]
  })
});
