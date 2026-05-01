import { createFileRoute, linkOptions } from "@tanstack/react-router";

import { PamAccountByIDPage } from "../PamAccountByIDPage/PamAccountByIDPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/pam/$projectId/_pam-layout/domains/$domainType/$domainId/accounts/$accountId/"
)({
  component: PamAccountByIDPage,
  beforeLoad: ({ context, params }) => {
    return {
      breadcrumbs: [
        ...context.breadcrumbs,
        {
          label: "Domains",
          link: linkOptions({
            to: "/organizations/$orgId/projects/pam/$projectId/domains",
            params: { orgId: params.orgId, projectId: params.projectId }
          })
        },
        {
          label: "Domain",
          link: linkOptions({
            to: "/organizations/$orgId/projects/pam/$projectId/domains/$domainType/$domainId",
            params: {
              orgId: params.orgId,
              projectId: params.projectId,
              domainType: params.domainType,
              domainId: params.domainId
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
