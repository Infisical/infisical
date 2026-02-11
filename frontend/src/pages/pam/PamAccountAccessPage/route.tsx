import { createFileRoute, linkOptions } from "@tanstack/react-router";

import { PamAccountAccessPage } from "./PamAccountAccessPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/pam/$projectId/_pam-layout/resources/$resourceType/$resourceId/accounts/$accountId/access"
)({
  component: PamAccountAccessPage,
  beforeLoad: ({ context, params }) => {
    return {
      breadcrumbs: [
        ...context.breadcrumbs,
        {
          label: "Resources",
          link: linkOptions({
            to: "/organizations/$orgId/projects/pam/$projectId/resources",
            params: { orgId: params.orgId, projectId: params.projectId }
          })
        },
        {
          label: "Resource",
          link: linkOptions({
            to: "/organizations/$orgId/projects/pam/$projectId/resources/$resourceType/$resourceId",
            params: {
              orgId: params.orgId,
              projectId: params.projectId,
              resourceType: params.resourceType,
              resourceId: params.resourceId
            }
          })
        },
        {
          label: "Account",
          link: linkOptions({
            to: "/organizations/$orgId/projects/pam/$projectId/resources/$resourceType/$resourceId/accounts/$accountId",
            params: {
              orgId: params.orgId,
              projectId: params.projectId,
              resourceType: params.resourceType,
              resourceId: params.resourceId,
              accountId: params.accountId
            }
          })
        },
        {
          label: "Web Access"
        }
      ]
    };
  }
});
