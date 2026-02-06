import { createFileRoute, linkOptions } from "@tanstack/react-router";

import { PamAccountByIDPage } from "./PamAccountByIDPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/pam/$projectId/_pam-layou t/accounts/$accountId"
)({
  component: PamAccountByIDPage,
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
          label: "Account Details"
        }
      ]
    };
  }
});
