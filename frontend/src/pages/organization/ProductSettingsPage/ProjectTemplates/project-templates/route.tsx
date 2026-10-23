import { createFileRoute, linkOptions, redirect } from "@tanstack/react-router";

import { OrgPermissionActions, OrgPermissionSubjects } from "@app/context";
import { hasProjectTemplates, urlSlugToProjectType } from "@app/helpers/project";
import { withPermission } from "@app/hoc";
import { ProjectType } from "@app/hooks/api/projects/types";

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
        label: "Project Template"
      }
    ]
  }),
  beforeLoad: ({ params }) => {
    const projectType = urlSlugToProjectType(params.type);
    if (projectType === ProjectType.SecretManager) {
      throw redirect({
        to: "/organizations/$orgId/projects/secret-management/product-settings",
        params: { orgId: params.orgId }
      });
    }
    if (!projectType || !hasProjectTemplates(projectType)) {
      throw redirect({
        to: "/organizations/$orgId/projects",
        params: { orgId: params.orgId }
      });
    }
  }
});
