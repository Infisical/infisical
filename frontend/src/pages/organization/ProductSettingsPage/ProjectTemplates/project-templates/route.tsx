import { createFileRoute, linkOptions } from "@tanstack/react-router";

import { OrgPermissionActions, OrgPermissionSubjects } from "@app/context";
import { withPermission } from "@app/hoc";

import { ProjectTemplatePage } from "./ProjectTemplatePage";

const RouteComponent = withPermission(() => <ProjectTemplatePage />, {
  action: OrgPermissionActions.Read,
  subject: OrgPermissionSubjects.ProjectTemplates,
  accessRestrictedMode: "dialog"
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/product-settings/$type/project-templates/$templateId"
)({
  component: RouteComponent,
  context: ({ params }) => ({
    breadcrumbs: [
      {
        label: "Product Settings",
        link: linkOptions({
          to: "/organizations/$orgId/projects/product-settings/$type" as const,
          params: { orgId: params.orgId, type: params.type }
        })
      },
      {
        label: "Project Templates"
      }
    ]
  })
});
