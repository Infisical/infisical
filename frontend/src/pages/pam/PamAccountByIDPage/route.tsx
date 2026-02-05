import { createFileRoute, linkOptions } from "@tanstack/react-router";

import { PamAccountByIDPage } from "./PamAccountByIDPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/pam/$projectId/_pam-layout/accounts/$accountId"
)({
  component: PamAccountByIDPage,
  beforeLoad: ({ context, params }) => {
    return {
      breadcrumbs: [
        ...context.breadcrumbs,
        {
          label: "Accounts",
          link: linkOptions({
            to: "/organizations/$orgId/projects/pam/$projectId/accounts",
            params: { orgId: params.orgId, projectId: params.projectId }
          })
        },
        {
          label: "Account Details"
        }
      ]
    };
  }
});
