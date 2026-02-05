import { createFileRoute, linkOptions } from "@tanstack/react-router";

import { PamResourceByIDPage } from "./PamResourceByIDPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/pam/$projectId/_pam-layout/resources/$resourceType/$resourceId"
)({
  component: PamResourceByIDPage,
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
          label: "Resource Details"
        }
      ]
    };
  }
});
